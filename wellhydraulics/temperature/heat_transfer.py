"""
Heat transfer coefficient calculations.

Implements Nusselt number (forced + natural convection), combined HTCs,
and formation temperature factor.  Corresponds to MATLAB
TemperatureIntegrator lines 797-844.
"""

from __future__ import annotations

import math
import logging

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS

logger = logging.getLogger(__name__)


def forced_nusselt(Re: float, Pr: float, old_nu: bool = False) -> float:
    """Forced-convection Nusselt number (3 regimes).

    old_nu=False  → Sieder-Tate: Nu = max(3.657, 0.027·Re^0.8·Pr^(1/3))
    old_nu=True   → Hausen transitional + high-Re turbulent
    """
    if old_nu:
        Nu = max(3.657, 0.116 * (Re ** (2.0 / 3.0) - 125.0) * Pr ** (1.0 / 3.0))
        if Re > 10000:
            Nu = 0.024823 * Re ** 0.8 * Pr ** (1.0 / 3.0)
    else:
        Nu = max(3.657, 0.027 * Re ** 0.8 * Pr ** (1.0 / 3.0))
    return Nu


def natural_nusselt_pipe(
    Tp: float, Ta: float, Dh: float, rho: float, mu: float,
    Pr: float, thermal_ex: float,
) -> float:
    """Natural convection Nusselt for pipe interior."""
    Gr = 2.3 * abs(Tp - Ta) * Dh ** 3 * rho ** 2 * thermal_ex / max(mu ** 2, 1e-20)
    Ra = Gr * Pr
    return 0.1 * abs(Ra) ** 0.33


def natural_nusselt_annulus(
    Tp: float, Ta: float, Dh: float, rho: float, mu: float,
    Pr: float, HID: float, POD: float, thermal_ex: float,
) -> float:
    """Natural convection Nusselt for annulus with geometry correction."""
    Gr = 2.3 * abs(Tp - Ta) * Dh ** 3 * rho ** 2 * thermal_ex / max(mu ** 2, 1e-20)
    Ra = Gr * Pr
    return 0.1 * abs(Ra) ** 0.33 * 0.25 * (HID / max(POD, 0.01)) ** 0.15


def mixed_nusselt(Nu_forced: float, Nu_natural: float) -> float:
    """Combine forced and natural convection: Nu = (Nuf³ + Nun³)^(1/3)."""
    return (Nu_forced ** 3 + Nu_natural ** 3) ** (1.0 / 3.0)


def pipe_htc(PID: float, POD: float, hp: float, ha: float, Ks: float) -> float:
    """Combined pipe heat transfer coefficient [Btu/ft·hr·°F].

    1/HTCp = 24/(PID·hp) + 24/(POD·ha) + ln(POD/PID)/Ks
    """
    denom = (24.0 / max(PID, 0.01) / max(hp, 0.001)
             + 24.0 / max(POD, 0.01) / max(ha, 0.001)
             + math.log(max(POD / max(PID, 0.01), 1.001)) / max(Ks, 0.01))
    return 1.0 / denom if denom > 0 else 0.0


def annulus_htc(HID: float, COD: float, ha: float, Ks: float) -> float:
    """Combined annulus heat transfer coefficient [Btu/ft·hr·°F].

    1/HTCa = 24/(HID·ha) + ln(COD/HID)/Ks
    """
    denom = (24.0 / max(HID, 0.01) / max(ha, 0.001)
             + math.log(max(COD / max(HID, 0.01), 1.001)) / max(Ks, 0.01))
    return 1.0 / denom if denom > 0 else 0.0


def formation_factor(
    HOD: float, HTCa_val: float, Kf: float, Cpf: float,
    rhof: float, TH: float,
) -> tuple[float, float]:
    """Formation dimensionless temperature factor and UF.

    Returns (GF, UF) where UF = HTCa / (1 + GF).

    Matches MATLAB lines 837-844.
    """
    fadiff = Kf / max(rhof, 0.01) / 7.48 / max(Cpf, 0.01)
    td = 576.0 * TH * fadiff / max(HOD ** 2, 0.01)
    std = math.sqrt(max(td, 0.0))

    if td <= 1.5:
        tD = 1.1281 * std * (1.0 - 0.3 * std)
    else:
        tD = (0.4063 + math.log(max(td, 1e-10)) / 2.0) * (1.0 + 0.6 / max(td, 1e-10))

    GF = HOD * HTCa_val * tD / 24.0 / max(Kf, 1e-10)
    UF = HTCa_val / (1.0 + GF) if (1.0 + GF) != 0 else 0.0
    return GF, UF
