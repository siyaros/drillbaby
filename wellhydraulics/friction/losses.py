"""
Local pressure loss models.

  1. Tool-joint expansion/contraction  (Bourgoyne 1986)
  2. Pipe rotation friction            (Hemphill 2008, modified)
  3. Bit pressure loss                 (TFA model)
  4. Surface equipment friction        (long-pipe model)
"""

from __future__ import annotations

import math
import logging

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS

logger = logging.getLogger(__name__)


# ── Tool-joint losses ────────────────────────────────────────────────────

def tool_joint_pressure_gradient(
    V: float,
    Q: float,
    D2_TJ: float,
    TJ_length: float,
    rho: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Tool-joint expansion/contraction pressure loss per unit depth.

    Matches MATLAB PGrad lines 757-760:
        TJV = (V - Q0 * AVG_VEL_UNIT_CONV / D2TJ) / 60  [ft/sec]
        pfg_TJ = 0.001614 * rho * TJV² / TJLn

    Parameters
    ----------
    V : float          Annular velocity [ft/min]
    Q : float          Flow rate [gpm]
    D2_TJ : float      HID² - TJOD² or TJID² [in²]
    TJ_length : float  Spacing between tool joints [ft]
    rho : float        Fluid density [ppg]

    Returns
    -------
    dp_dz : float      Pressure gradient contribution [psi/ft]
    """
    if TJ_length <= 0:
        return 0.0

    # Velocity at tool joint [ft/sec]
    V_TJ = (V - Q * C.AVG_VEL_UNIT_CONV / D2_TJ) / 60.0

    return C.CON_EXP_CONST * rho * V_TJ * V_TJ / TJ_length


# ── Rotation losses ──────────────────────────────────────────────────────

def rotation_pressure_gradient(
    RPM: float,
    V: float,
    rr: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Pipe-rotation friction loss (Hemphill 2008, modified).

    Matches MATLAB PGrad lines 761-764:
        pfg_rot = RPM * min(V/60/4, 1) * rr * (C1*rr - C2)

    The min(V/240, 1) factor is an undocumented modification that smooths
    rotation loss to zero at zero circulation.  It is NOT in the original
    Hemphill paper but is preserved for MATLAB bit-accuracy.

    Parameters
    ----------
    RPM : float   Pipe rotation speed [rpm]
    V : float     Annular velocity [ft/min]
    rr : float    POD / HID ratio [-]

    Returns
    -------
    dp_dz : float  Pressure gradient contribution [psi/ft]
    """
    if RPM == 0:
        return 0.0

    Vc = min(V / 60.0 / 4.0, 1.0)  # smoothing factor
    return RPM * Vc * rr * (C.HEMPHILL_C1 * rr - C.HEMPHILL_C2)


# ── Bit pressure loss ────────────────────────────────────────────────────

def bit_pressure_loss(
    rho: float,
    Q: float,
    TFA: float,
    density_ref: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Bit nozzle pressure loss.

    Matches MATLAB PressureIntegrator lines 517-520:
        VB = Q0 * dref / (rho * TFA * BIT_EFFICIENCY)
        BitLoss = rho * VB² * TFAToPressure

    Parameters
    ----------
    rho : float         Fluid density at bit [ppg]
    Q : float           Flow rate [gpm]
    TFA : float         Total flow area of nozzles [in²]
    density_ref : float Reference density [ppg]

    Returns
    -------
    dP_bit : float      Bit pressure loss [psi]
    """
    if TFA <= 0:
        logger.warning("TFA <= 0, returning zero bit loss")
        return 0.0

    V_bit = Q * density_ref / (rho * TFA * C.BIT_EFFICIENCY)
    return rho * V_bit * V_bit * C.TFAToPressure


def compute_tfa(num_nozzles: int, nozzle_size_32nds: int) -> float:
    """Compute Total Flow Area from nozzle count and size.

    TFA = NN * (NI/32)² * π/4  [in²]

    Parameters
    ----------
    num_nozzles : int
        Number of nozzles.
    nozzle_size_32nds : int
        Nozzle diameter in 1/32 inch.

    Returns
    -------
    TFA : float [in²]
    """
    d = nozzle_size_32nds / 32.0  # inches
    return num_nozzles * d * d * math.pi / 4.0


# ── Surface equipment ────────────────────────────────────────────────────

def surface_pipe_friction(
    P: float,
    T: float,
    Dh: float,
    V: float,
    rho: float,
    n: float,
    K: float,
    tau_y: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Friction pressure gradient in a surface pipe segment.

    Uses the same API-13D friction model as downhole, with alpha=0 (pipe)
    for inlet piping and alpha=1 (annulus) for outlet piping.  The MATLAB
    code uses alpha=1 for outlet and alpha=0 for inlet — but the surface
    pipe call passes rr=1, alpha=0/1 depending on context.

    Returns
    -------
    dp_dz : float  Pressure gradient [psi/ft]
    """
    from .api13d import friction_factor

    # Surface piping is treated as pipe flow (alpha=0) in MATLAB for inlet
    # and as annular flow (alpha=1) for outlet with rr=1.
    # We compute the friction gradient directly.
    result = friction_factor(rho, Dh, V, alpha=1.0, n=n, K=K, tau_y=tau_y, C=C)
    return rho * C.PRESS_LOSS_CONST * result.ff * V * V / Dh
