"""
Drilling-fluid density models.

Implements:
  1. PVT compositional model  (Zamora 2013)
  2. Salinity interpolation   (Lagrange 2nd-order)
  3. Incompressible pass-through

Corresponds to MATLAB ``PVTdens`` for ``mud < 3`` (standard drilling fluid).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import PVTCoefficients, FluidData, PVTData, MudBaseType, SaltType

logger = logging.getLogger(__name__)


def pvt_polynomial(P: float, T: float, c: PVTCoefficients) -> float:
    """Evaluate the 6-coefficient PVT polynomial.

    ρ(P,T) = a1 + b1*P + c1*P² + (a2 + b2*P + c2*P²)*T

    Matches MATLAB lines 575-582 exactly.
    """
    return (c.a1 + P * (c.b1 + P * c.c1)
            + T * (c.a2 + P * (c.b2 + P * c.c2)))


def interpolate_brine_pvt(
    salinity: float,
    pvt_data: PVTData,
    salt_type: SaltType,
) -> PVTCoefficients:
    """Lagrange 2nd-order interpolation of brine PVT coefficients.

    Replicates MATLAB lines 130-139 exactly.

    Parameters
    ----------
    salinity : float
        Salinity [%].
    pvt_data : PVTData
        Full PVT coefficient table.
    salt_type : SaltType
        CaCl2 or NaCl.

    Returns
    -------
    PVTCoefficients
        Interpolated brine coefficients.
    """
    if salt_type == SaltType.CaCl2:
        s1, s2 = 19.3, 25.0
        pvt1 = pvt_data.cacl2_s1
        pvt2 = pvt_data.cacl2_s2
    else:
        s1, s2 = 10.0, 20.0
        pvt1 = pvt_data.nacl_s1
        pvt2 = pvt_data.nacl_s2

    pvt0 = pvt_data.water_coeffs  # s = 0
    s = salinity

    # Lagrange basis polynomials
    L0 = (s1 - s) * (s2 - s) / (s1 * s2)
    L1 = s * (s2 - s) / (s1 * (s2 - s1))
    L2 = (s - s1) * s / ((s2 - s1) * s2)

    def _interp_field(f0: float, f1: float, f2: float) -> float:
        return f0 * L0 + f1 * L1 + f2 * L2

    return PVTCoefficients(
        a1=_interp_field(pvt0.a1, pvt1.a1, pvt2.a1),
        b1=_interp_field(pvt0.b1, pvt1.b1, pvt2.b1),
        c1=_interp_field(pvt0.c1, pvt1.c1, pvt2.c1),
        a2=_interp_field(pvt0.a2, pvt1.a2, pvt2.a2),
        b2=_interp_field(pvt0.b2, pvt1.b2, pvt2.b2),
        c2=_interp_field(pvt0.c2, pvt1.c2, pvt2.c2),
    )


def compositional_density(
    P: float,
    T: float,
    fluid: FluidData,
    pvt_data: PVTData,
    density_ref: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Compositional PVT density model (Zamora 2013).

    ρ(P,T) = ρ_bulk / (1 + f_base*(ρ_base_ref/ρ_base - 1)
                          + f_brine*(ρ_brine_ref/ρ_brine - 1))

    Matches MATLAB ``PVTdens`` lines 572-585.

    Parameters
    ----------
    P : float
        Local pressure [psi].
    T : float
        Local temperature [°F].
    fluid : FluidData
        Fluid properties (base type, composition, etc.).
    pvt_data : PVTData
        PVT coefficient table.
    density_ref : float
        Reference (surface) mud weight [ppg].
    C : PhysicalConstants
        Unit-conversion constants.

    Returns
    -------
    rho : float
        Fluid density [ppg] at (P, T).
    """
    if not fluid.pvt_enabled:
        return density_ref

    # Base fluid PVT
    base_pvt = pvt_data.base_coeffs[fluid.base]
    rho_base = pvt_polynomial(P, T, base_pvt)
    rho_base_ref = pvt_polynomial(C.ATM_PRESSURE, fluid.temp_ref, base_pvt)

    # Brine PVT (interpolated for salinity)
    brine_pvt = interpolate_brine_pvt(fluid.salinity_pct, pvt_data, fluid.salt_type)
    rho_brine = pvt_polynomial(P, T, brine_pvt)
    rho_brine_ref = pvt_polynomial(C.ATM_PRESSURE, fluid.temp_ref, brine_pvt)

    # Compositional formula – fractions are in percent (divided by 100)
    fb = fluid.f_base_pct / 100.0
    fw = fluid.f_brine_pct / 100.0

    # Guard against zero density (extreme conditions)
    if rho_base <= 0 or rho_brine <= 0:
        logger.warning(
            "Non-positive PVT density: rho_base=%.4f, rho_brine=%.4f at P=%.1f T=%.1f",
            rho_base, rho_brine, P, T,
        )
        return density_ref

    denom = 1.0 + fb * (rho_base_ref / rho_base - 1.0) + fw * (rho_brine_ref / rho_brine - 1.0)

    if denom <= 0:
        logger.warning("Compositional density denominator <= 0 at P=%.1f T=%.1f", P, T)
        return density_ref

    return density_ref / denom
