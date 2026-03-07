"""
Influx-fluid density correlations.

Implements:
  1. Black Oil  (Standing correlations)  → MATLAB ``BlackOilCorr``
  2. Real Gas   (Dranchuk & Abou-Kassem) → MATLAB ``DranchukCorr``
  3. Sea Water  (PVT polynomial)         → MATLAB ``ResWaterCorr``
"""

from __future__ import annotations

import math
import logging

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..utils.numerics import bisection, safe_exp

logger = logging.getLogger(__name__)


# ── Black Oil ────────────────────────────────────────────────────────────

def black_oil_density(
    oil_sg: float,
    gas_sg: float,
    Rsob: float,
    Tres: float,
    P: float,
    T: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Black-oil density correlation.

    Exact match to MATLAB ``BlackOilCorr`` (lines 601-626).

    Parameters
    ----------
    oil_sg : float   Specific gravity of oil [-]
    gas_sg : float   Specific gravity of gas [-]
    Rsob : float     Solution GOR at bubble point [scf/stb]
    Tres : float     Reservoir temperature [°F]
    P : float        Pressure [psi]
    T : float        Temperature [°F]

    Returns
    -------
    rho : float      Oil density [ppg]
    """
    oilapi = 141.5 / oil_sg - 131.5

    if oilapi >= 30.0:
        c1, c2, c3 = 0.0178, 1.1870, 23.9310
        a1, a2, a3 = 4.67e-04, 1.1e-05, 1.337e-09
    else:
        c1, c2, c3 = 0.0362, 1.0937, 25.7240
        a1, a2, a3 = 4.677e-04, 1.751e-05, -1.811e-08

    # Bubble point pressure
    pb = min(5250.0,
             (Rsob / (c1 * gas_sg * safe_exp(c3 * oilapi / (Tres + 460.0)))
              ) ** (1.0 / c2))

    # Gas solubility
    Rs = min(Rsob,
             c1 * gas_sg * (P ** c2) * safe_exp(c3 * oilapi / (T + 460.0)))

    # Compressibility factor c0
    Pa = P + C.ATM_PRESSURE
    if oilapi >= 30.0:
        c0 = (-1433.0 + 5.0 * Rsob + 17.2 * T - 1180.0 * gas_sg
              + 12.61 * oilapi) / (1e5 * Pa)
    elif oilapi >= 10.0:
        c0 = (-2841.8 + 2.9646 * Rsob + 25.5439 * T - 1230.5 * gas_sg
              + 41.91 * oilapi) / (1e5 * Pa)
    else:
        c0 = (-889.6 + 3.1374 * Rsob + 20.0 * T - 627.3 * gas_sg
              - 81.4476 * oilapi) / (1e5 * Pa)

    # Oil formation volume factor
    Bo = ((1.0 + a1 * Rs + (a2 + a3 * Rs) * (T - 60.0) * oilapi / gas_sg)
          * safe_exp(-c0 * max(0.0, P - pb)))

    # Density [ppg]
    rho = ((350.0 * oil_sg + 0.0765 * gas_sg * Rs)
           / (5.615 * Bo)
           * safe_exp(c0 * max(0.0, P - pb))
           / 7.48)

    return rho


# ── Real Gas (Dranchuk) ─────────────────────────────────────────────────

def dranchuk_gas_density(
    gas_sg: float,
    P: float,
    T: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Real-gas density via Dranchuk & Abou-Kassem Z-factor equation.

    Exact match to MATLAB ``DranchukCorr`` (lines 628-654).

    Parameters
    ----------
    gas_sg : float   Gas specific gravity [-]
    P : float        Pressure [psi]
    T : float        Temperature [°F]

    Returns
    -------
    rho : float      Gas density [ppg]
    """
    # Pseudo-critical properties (Sutton correlation)
    Ppc = 756.8 - 131.07 * gas_sg - 3.6 * gas_sg * gas_sg
    Tpc = 169.2 + 349.5 * gas_sg - 74.0 * gas_sg * gas_sg

    # Pseudo-reduced properties
    Ppr = (P + 14.7) / Ppc
    Tpr = (T + 459.67) / Tpc

    Tpr2 = Tpr * Tpr
    Tpr3 = Tpr2 * Tpr
    Tpr4 = Tpr3 * Tpr
    Tpr5 = Tpr4 * Tpr

    # Dranchuk coefficients (MATLAB lines 636-639)
    AA = [0.0,  # 0-indexed padding
          0.3265, -1.07, -0.5339,
          0.01569, -0.05165, 0.5475,
          -0.7361, 0.1844, 0.1056,
          0.6134, 0.721, -0.27]

    def fgas(rho_r: float) -> float:
        """Dranchuk EOS residual.  Root is the reduced density."""
        r2 = rho_r * rho_r
        r3 = r2 * rho_r
        r6 = r3 * r3
        return (AA[12] * Tpr4 * Ppr
                + rho_r * Tpr5
                + (Tpr5 * AA[1] + Tpr4 * AA[2] + Tpr2 * AA[3]
                   + Tpr * AA[4] + AA[5]) * r2
                + (Tpr5 * AA[6] + Tpr4 * AA[7] + Tpr3 * AA[8]) * r3
                - AA[9] * (Tpr4 * AA[7] + Tpr3 * AA[8]) * r6
                + AA[10] * (1.0 + AA[11] * r2)
                  * Tpr2 * r3 * math.exp(-AA[11] * r2))

    # Bisection solve for reduced density
    rho_r = bisection(fgas,
                      C.DRANCHUK_RHO_BOUNDS[0],
                      C.DRANCHUK_RHO_BOUNDS[1],
                      max_iter=C.DRANCHUK_MAX_ITER)

    # Convert to ppg  (MATLAB line 650)
    rho = max(C.GAS_DENSITY_FLOOR,
              rho_r * 10.0 * 0.1337 * Ppc / Tpc * gas_sg)

    return rho


# ── Sea Water ────────────────────────────────────────────────────────────

def sea_water_density(
    sg: float,
    P: float,
    T: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Sea-water density from PVT polynomial.

    Exact match to MATLAB ``ResWaterCorr`` (lines 656-663).

    Parameters
    ----------
    sg : float   Specific gravity [-]
    P : float    Pressure [psi]
    T : float    Temperature [°F]

    Returns
    -------
    rho : float  Density [ppg]
    """
    Pa = P + C.ATM_PRESSURE
    c1 = 0.9911 + 6.35e-5 * T + 8.5e-7 * T * T
    c2 = 1.093e-6 - 3.3497e-9 * T + 4.57e-12 * T * T
    c3 = -5.0e-11 + 6.429e-13 * T - 1.43e-15 * T * T
    Bw = c1 + (c2 + c3 * Pa) * Pa
    return 8.345 * sg / Bw
