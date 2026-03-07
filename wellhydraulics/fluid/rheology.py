"""
Rheology models for drilling fluids and influx fluids.

Implements:
  1. Standard drilling fluid: returns stored (n, K, τ_y) – Herschel-Bulkley
  2. PV/YP/LSYP conversion to HB parameters
  3. Black-oil influx viscosity  (Standing dead-oil + live-oil)
  4. Real-gas influx viscosity   (Lee-Gonzalez-Eakin)
  5. Sea-water influx viscosity  (exponential correlation)

Corresponds to MATLAB ``Rheology`` function (lines 665-698).
"""

from __future__ import annotations

import math
import logging
from dataclasses import dataclass

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import InfluxType
from ..utils.numerics import safe_exp, safe_log10

logger = logging.getLogger(__name__)


@dataclass
class RheologyParams:
    """Herschel-Bulkley parameters."""
    n: float      # flow behaviour index [-]
    K: float      # consistency index [lbf·sⁿ/100ft²]
    tau_y: float  # yield stress [lbf/100ft²]


# ── Standard mud ─────────────────────────────────────────────────────────

def mud_rheology(n: float, K: float, tau_y: float) -> RheologyParams:
    """Pass-through for standard drilling fluid with stored HB parameters."""
    return RheologyParams(n=n, K=K, tau_y=tau_y)


def pv_yp_lsyp_to_hb(PV: float, YP: float, LSYP: float) -> RheologyParams:
    """Convert PV/YP/LSYP to Herschel-Bulkley parameters.

    API-13D equations 65-66.

    Parameters
    ----------
    PV   : Plastic Viscosity [cP]
    YP   : Yield Point [lbf/100ft²]
    LSYP : Low-Shear Yield Point [lbf/100ft²]

    Returns
    -------
    RheologyParams with (n, K, τ_y)
    """
    tau_y = LSYP
    arg = (2.0 * PV + YP - LSYP) / (PV + YP - LSYP)
    if arg <= 0:
        logger.warning("Invalid PV/YP/LSYP: log argument <= 0, defaulting n=1")
        n = 1.0
    else:
        n = 3.32 * math.log10(arg)
    K = (PV + YP - LSYP) / (511.0 ** n)
    return RheologyParams(n=max(0.01, min(1.0, n)), K=max(1e-10, K), tau_y=max(0.0, tau_y))


# ── Black-oil influx viscosity ───────────────────────────────────────────

def black_oil_rheology(
    oil_sg: float,
    P: float,
    T: float,
    gas_sg: float = 0.6,
    Rsob: float = 665.0,
    Tres: float = 150.0,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> RheologyParams:
    """Black-oil influx rheology (Newtonian, n=1, τ_y=0, K=viscosity).

    Exact match to MATLAB ``Rheology`` lines 671-686.

    Returns K in [lbf·s/100ft²] (after cP → lbf conversion).
    """
    oilapi = 141.5 / oil_sg - 131.5
    z = 3.0324 - 0.02023 * oilapi

    if oilapi >= 30.0:
        c1, c2, c3 = 0.0178, 1.1870, 23.9310
    else:
        c1, c2, c3 = 0.0362, 1.0937, 25.7240

    pb = min(5250.0,
             (Rsob / (c1 * gas_sg * safe_exp(c3 * oilapi / (Tres + 460.0)))
              ) ** (1.0 / c2))
    Rs = min(Rsob,
             c1 * gas_sg * (P ** c2) * safe_exp(c3 * oilapi / (T + 460.0)))

    # Dead-oil viscosity (Beggs-Robinson)
    y = 10.0 ** z
    x = y * max(1.0, T) ** (-1.163)
    mu_dead = 10.0 ** x - 1.0

    # Live-oil viscosity
    A = 10.715 * (Rs + 150.0) ** (-0.515)
    B = 5.44 * (Rs + 150.0) ** (-0.338)
    mu_oil = A * (mu_dead ** B)

    # Above bubble point correction
    if P > pb:
        Pa = P + C.ATM_PRESSURE
        exponent = 2.6 * Pa ** 1.187 * safe_exp(-11.513 - 8.98e-5 * Pa)
        KK = min(30.0, mu_oil * (P / pb) ** exponent)
    else:
        KK = min(30.0, mu_oil)

    # Convert cP → lbf·s/100ft²
    KK *= 0.00209

    return RheologyParams(n=1.0, K=KK, tau_y=0.0)


# ── Real-gas influx viscosity ────────────────────────────────────────────

def real_gas_rheology(
    gas_sg: float,
    P: float,
    T: float,
) -> RheologyParams:
    """Real-gas influx rheology (Lee-Gonzalez-Eakin).

    Exact match to MATLAB ``Rheology`` lines 687-692.
    Note: MATLAB converts T to Rankine internally.
    """
    T_R = T + 459.67  # Rankine

    sK = (9.4 + 0.57934 * gas_sg) * T_R ** 1.5 / (209.0 + 550.373 * gas_sg + T_R)
    sX = 3.5 + 986.0 / T_R + 0.28967 * gas_sg
    sY = 2.4 - 0.2 * sX
    rho_ref = 8.345  # water density reference (ppg) — hardcoded in MATLAB

    KK = 0.0001 * sK * safe_exp(sX * (0.11968831 * rho_ref) ** sY)
    KK *= 0.00209  # cP → lbf·s/100ft²

    return RheologyParams(n=1.0, K=KK, tau_y=0.0)


# ── Sea-water influx viscosity ───────────────────────────────────────────

def sea_water_rheology(P: float, T: float) -> RheologyParams:
    """Sea-water influx rheology (exponential correlation).

    Exact match to MATLAB ``Rheology`` lines 693-695.
    """
    KK = math.exp(1.003 - 1.479e-2 * T + 1.982e-5 * T * T)
    KK *= 0.00209  # cP → lbf·s/100ft²
    return RheologyParams(n=1.0, K=KK, tau_y=0.0)


# ── Dispatcher ───────────────────────────────────────────────────────────

def get_rheology(
    P: float,
    T: float,
    mud_index: int,
    fluids: list,
    influx_type: InfluxType = InfluxType.REAL_GAS,
    influx_sg: float = 0.6,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> RheologyParams:
    """Return HB parameters for the given fluid at (P, T).

    Dispatches to standard-mud or influx-specific model based on mud_index.
    Matches MATLAB ``Rheology`` dispatcher logic.

    Parameters
    ----------
    P, T : float
        Local pressure [psi] and temperature [°F].
    mud_index : int
        1-based fluid index. 1-2 = standard mud, 3 = influx.
    fluids : list[FluidData]
        Fluid definitions (0-indexed).
    influx_type : InfluxType
        Type of influx fluid.
    influx_sg : float
        Influx specific gravity.
    """
    if mud_index <= len(fluids):
        fl = fluids[mud_index - 1]
        return mud_rheology(fl.n, fl.K, fl.tau_y)
    else:
        # Influx fluid
        if influx_type == InfluxType.BLACK_OIL:
            return black_oil_rheology(influx_sg, P, T, C=C)
        elif influx_type == InfluxType.REAL_GAS:
            return real_gas_rheology(influx_sg, P, T)
        else:
            return sea_water_rheology(P, T)
