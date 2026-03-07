"""
API RP 13D Non-Newtonian friction factor model.

Implements the unified friction factor (all flow regimes) from API-13D
Section 7.4.  Exact match to MATLAB ``ffactor`` (lines 700-725).

Flow regimes:
    Laminar:      f_lam = 16 / N_ReG             (Eq. 85)
    Transitional: f_trans = 16*N_ReG / N_CRe²     (Eq. 86)
    Turbulent:    f_turb = a / N_ReG^b             (Eq. 87)
    Intermediate: f_int = (f_trans^-8 + f_turb^-8)^(-1/8)  (Eq. 91)
    Unified:      f = (f_int^12 + f_lam^12)^(1/12)         (Eq. 90)

Note: All friction factors are Fanning × 4 (Darcy convention).
"""

from __future__ import annotations

import math
import logging
from dataclasses import dataclass

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS

logger = logging.getLogger(__name__)


@dataclass
class FrictionResult:
    """Result bundle from friction factor calculation."""
    ff: float         # Darcy friction factor [-]
    mu_app: float     # Apparent viscosity [cP]
    NReG: float       # Generalized Reynolds number [-]
    gamma_w: float    # Shear rate at wall [1/s]
    tau_w: float      # Shear stress at wall [lbf/100ft²]


def friction_factor(
    rho: float,
    Dh: float,
    V: float,
    alpha: float,
    n: float,
    K: float,
    tau_y: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> FrictionResult:
    """Compute unified API-13D friction factor.

    Parameters
    ----------
    rho : float     Fluid density [ppg]
    Dh : float      Hydraulic diameter [in]
    V : float       Flow velocity [ft/min]
    alpha : float   Geometry constant: 0 = pipe, 1 = annulus
    n : float       Flow behaviour index [-]
    K : float       Consistency index [lbf·sⁿ/100ft²]
    tau_y : float   Yield stress [lbf/100ft²]

    Returns
    -------
    FrictionResult with ff, mu_app, NReG, gamma_w, tau_w.
    """
    # Velocity floor to prevent division by zero (MATLAB L711)
    VV = max(C.VELOCITY_FLOOR, abs(V))

    # Dh floor to prevent division by zero at bit node or zero-area geometry
    if Dh < 0.01:
        return FrictionResult(ff=0.0, mu_app=1.0, NReG=0.0, gamma_w=0.0, tau_w=0.0)

    # Geometry factor G (API-13D Eqs. 70-72)
    G = (1.0 + alpha / 2.0) * (((3.0 - alpha) * n + 1.0) / ((4.0 - alpha) * n))

    # Shear rate at wall (API-13D Eq. 73)
    gamma_w = 1.6 * G * VV / Dh

    # Shear stress at wall (API-13D Eq. 75)
    tau_w = C.SHEAR_STRESS_CORRECTION * (
        ((4.0 - alpha) / (3.0 - alpha)) ** n * tau_y + K * gamma_w ** n
    )

    # Apparent viscosity [cP] (API-13D Eq. 119)
    mu_app = (tau_y + K * gamma_w ** n) / gamma_w * C.APPARENT_VISCOSITY

    # Generalized Reynolds number (API-13D Eq. 76)
    NReG = rho * VV * VV / (C.REYNOLDS_NO_CONV * tau_w)

    # Laminar friction factor (API-13D Eq. 85, Darcy convention)
    f_lam = 16.0 / NReG

    # Turbulent parameters (API-13D Eqs. 88-89)
    log_n = math.log10(max(1e-10, n))
    a = (log_n + 3.93) / 50.0
    b = (1.75 - log_n) / 7.0

    # Turbulent friction factor (API-13D Eq. 87)
    f_turb = a / (NReG ** b)

    # Critical Reynolds number (API-13D Eq. 77)
    NRec = 3470.0 - 1370.0 * n

    # Transitional friction factor (API-13D Eq. 86)
    f_trans = 16.0 * NReG / (NRec * NRec)

    # Intermediate (API-13D Eq. 91)
    f_int = (f_trans ** (-8.0) + f_turb ** (-8.0)) ** (-1.0 / 8.0)

    # Unified friction factor (API-13D Eq. 90)
    ff = (f_int ** 12.0 + f_lam ** 12.0) ** (1.0 / 12.0)

    return FrictionResult(
        ff=ff,
        mu_app=mu_app,
        NReG=NReG,
        gamma_w=gamma_w,
        tau_w=tau_w,
    )
