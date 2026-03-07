"""
Pressure gradient computation at a single point.

This is the Python equivalent of MATLAB ``PGrad`` (lines 727-767).
It is called 4 times per RK4 sub-step per grid cell.

Given (P, T, geometry, flow), it returns:
  - Frictional pressure gradient  dPf/dz  [psi/ft]
  - Total pressure gradient       dP/dz   [psi/ft]  (friction + hydrostatic)
  - Local density, velocity, apparent viscosity, Reynolds number
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import FluidData, PVTData, InfluxType
from ..fluid.density import compositional_density
from ..fluid.influx_density import black_oil_density, dranchuk_gas_density, sea_water_density
from ..fluid.rheology import RheologyParams, get_rheology
from ..fluid.identification import FluidTracker
from ..friction.api13d import friction_factor
from ..friction.losses import tool_joint_pressure_gradient, rotation_pressure_gradient


@dataclass
class PGradResult:
    """Results from a single pressure-gradient evaluation."""
    pfg: float       # frictional pressure gradient [psi/ft]
    pg: float        # total pressure gradient [psi/ft] (friction + hydrostatic)
    rho: float       # local density [ppg]
    V: float         # local velocity [ft/min]
    mu_app: float    # apparent viscosity [cP]
    NReG: float      # generalized Reynolds number [-]


def compute_density(
    P: float,
    T: float,
    mud_index: int,
    density_ref: float,
    fluids: list[FluidData],
    pvt_data: PVTData,
    influx_type: InfluxType,
    influx_sg: float,
    Tf_surface: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> float:
    """Compute fluid density at (P, T) for any fluid type.

    Matches MATLAB PVTdens dispatcher logic (lines 568-599).
    """
    if mud_index <= len(fluids):
        fl = fluids[mud_index - 1]
        return compositional_density(P, T, fl, pvt_data, density_ref, C)
    else:
        # Influx fluid
        if influx_type == InfluxType.BLACK_OIL:
            return black_oil_density(density_ref, 0.6, 665.0, 150.0, P, Tf_surface, C)
        elif influx_type == InfluxType.REAL_GAS:
            return dranchuk_gas_density(density_ref, P, Tf_surface, C)
        else:
            return sea_water_density(density_ref, P, Tf_surface, C)


def pressure_gradient(
    P: float,
    T: float,
    D2: float,
    Dh: float,
    rr: float,
    alpha: float,
    inclination: float,
    md: float,
    D2_TJ: float,
    TJ_length: float,
    mud_index: int,
    density_ref: float,
    Q0: float,
    bit_depth: float,
    RPM: float,
    Q_booster: float,
    booster_depth: float,
    tj_enabled: bool,
    fluids: list[FluidData],
    pvt_data: PVTData,
    influx_type: InfluxType = InfluxType.REAL_GAS,
    influx_sg: float = 0.6,
    Tf_surface: float = 70.0,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> PGradResult:
    """Compute pressure gradient at a single point.

    Exact match to MATLAB ``PGrad`` (lines 727-767).

    Parameters
    ----------
    P : float          Local pressure [psi]
    T : float          Local temperature [°F]
    D2 : float         Flow cross-section D² [in²] (HID²-POD² or PID²)
    Dh : float         Hydraulic diameter [in]
    rr : float         POD/HID ratio (or 1 for pipe)
    alpha : float      0 = pipe, 1 = annulus
    inclination : float   [deg]
    md : float         Measured depth [ft]
    D2_TJ : float      TJ flow area D² [in²]
    TJ_length : float  TJ spacing [ft]
    mud_index : int    1-based fluid index
    density_ref : float  Reference density [ppg]
    Q0 : float         Surface flow rate [gpm]
    bit_depth : float  [ft]
    RPM : float        Pipe rotation speed [rpm]
    Q_booster : float  Booster flow rate [gpm]
    booster_depth : float  [ft]
    tj_enabled : bool  Tool-joint effect flag
    fluids : list[FluidData]
    pvt_data : PVTData
    influx_type, influx_sg, Tf_surface : influx parameters

    Returns
    -------
    PGradResult
    """
    # ── Density ──────────────────────────────────────────────────
    rho = compute_density(P, T, mud_index, density_ref, fluids, pvt_data,
                          influx_type, influx_sg, Tf_surface, C)

    # ── Velocity ─────────────────────────────────────────────────
    if md <= bit_depth and D2 > 0.01 and Dh > 0.01:
        V = Q0 / D2 * C.AVG_VEL_UNIT_CONV * density_ref / rho
        # Booster flow (annulus only, below booster depth)
        if md <= booster_depth and alpha > 0.5:
            V += Q_booster * alpha / D2 * C.AVG_VEL_UNIT_CONV * density_ref / rho
    else:
        V = 0.0

    # ── Rheology ─────────────────────────────────────────────────
    rheo = get_rheology(P, T, mud_index, fluids, influx_type, influx_sg, C)

    # ── Friction factor ──────────────────────────────────────────
    fric = friction_factor(rho, Dh, V, alpha, rheo.n, rheo.K, rheo.tau_y, C)

    # ── Frictional pressure gradient ─────────────────────────────
    pfg = rho * C.PRESS_LOSS_CONST * fric.ff * V * V / Dh

    # Tool-joint losses
    if tj_enabled and TJ_length > 0:
        pfg += tool_joint_pressure_gradient(V, Q0, D2_TJ, TJ_length, rho, C)

    # Rotation losses (annulus only)
    if alpha > 0.5:
        pfg += rotation_pressure_gradient(RPM, V, rr, C)

    # Sign convention: friction opposes flow
    # In annulus (α=1): pfg > 0 (pressure increases with depth)
    # In pipe   (α=0): pfg < 0 (pressure decreases toward surface)
    pfg *= (2.0 * alpha - 1.0)

    # ── Total gradient = friction + hydrostatic ──────────────────
    pg = pfg + rho * math.cos(math.radians(inclination)) * C.HYDSTATIC_CONV

    return PGradResult(
        pfg=pfg,
        pg=pg,
        rho=rho,
        V=V,
        mu_app=fric.mu_app,
        NReG=fric.NReG,
    )
