"""
Pressure solver: RK4 integration over the full wellbore.

Integrates the pressure equation over:
  1. Surface outlet equipment (annular side)
  2. Annulus (surface → bit)
  3. Bit pressure loss
  4. Drillstring (bit → surface)
  5. Surface inlet equipment (drillstring side)

Exact match to MATLAB ``PressureIntegratorNonIsothermal`` (lines 463-550).
"""

from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray
from dataclasses import dataclass

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import FluidData, PVTData, InfluxType, SurfaceEquipment
from ..geometry.grid import GridGeometry
from ..fluid.identification import FluidTracker
from ..friction.losses import bit_pressure_loss, compute_tfa
from .gradient import pressure_gradient, PGradResult


@dataclass
class PressureState:
    """Complete pressure solution on the computational grid."""
    AnPres: NDArray     # [psi] annular total pressure at each node
    DSPres: NDArray     # [psi] drillstring total pressure at each node
    AnFric: NDArray     # [psi] annular accumulated friction
    DSFric: NDArray     # [psi] drillstring accumulated friction
    SPP: float          # [psi] standpipe pressure (including SE inlet)

    # Profiles for output / temperature solver
    rhoa: NDArray       # [ppg] annular density
    rhop: NDArray       # [ppg] pipe density
    Va: NDArray         # [ft/min] annular velocity
    Vp: NDArray         # [ft/min] pipe velocity
    AnAVis: NDArray     # [cP] annular apparent viscosity
    DSAVis: NDArray     # [cP] pipe apparent viscosity
    AnRe: NDArray       # [-] annular generalised Reynolds
    DSRe: NDArray       # [-] pipe generalised Reynolds


def _pgrad_call(
    P: float, T: float,
    D2: float, Dh: float, rr: float, alpha: float,
    inc: float, md: float,
    D2_TJ: float, TJ_length: float,
    mud_index: int, density_ref: float,
    Q0: float, bit_depth: float, RPM: float,
    Q_booster: float, booster_depth: float, tj_enabled: bool,
    fluids: list[FluidData], pvt_data: PVTData,
    influx_type: InfluxType, influx_sg: float, Tf_surface: float,
    C: PhysicalConstants,
) -> PGradResult:
    """Thin wrapper for pressure_gradient with full argument forwarding."""
    return pressure_gradient(
        P, T, D2, Dh, rr, alpha, inc, md,
        D2_TJ, TJ_length, mud_index, density_ref,
        Q0, bit_depth, RPM, Q_booster, booster_depth, tj_enabled,
        fluids, pvt_data, influx_type, influx_sg, Tf_surface, C,
    )


def solve_pressure(
    grid: GridGeometry,
    SBP: float,
    Q0: float,
    RPM: float,
    Ta: NDArray,
    Tp: NDArray,
    density_ref: float,
    fluids: list[FluidData],
    pvt_data: PVTData,
    tracker: FluidTracker,
    se_outlet: SurfaceEquipment,
    se_inlet: SurfaceEquipment,
    TFA: float = 0.0,
    Q_booster: float = 0.0,
    booster_depth: float = 0.0,
    tj_enabled: bool = False,
    influx_type: InfluxType = InfluxType.REAL_GAS,
    influx_sg: float = 0.6,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> PressureState:
    """Solve for pressure, velocity, and density over the full wellbore.

    Parameters
    ----------
    grid : GridGeometry          Computational grid and mapped geometry.
    SBP : float                  Surface back pressure [psi].
    Q0 : float                   Surface flow rate [gpm].
    RPM : float                  Pipe rotation speed [rpm].
    Ta, Tp : (NZ,) arrays        Temperature profiles [°F].
    density_ref : float          Reference mud weight [ppg].
    fluids : list[FluidData]     Fluid definitions.
    pvt_data : PVTData           PVT coefficient table.
    tracker : FluidTracker       Multi-fluid tracker.
    se_outlet : SurfaceEquipment Outlet surface piping.
    se_inlet : SurfaceEquipment  Inlet surface piping.
    Q_booster, booster_depth : Booster parameters.
    tj_enabled : bool            Tool-joint effect flag.
    influx_type, influx_sg : Influx parameters.

    Returns
    -------
    PressureState with all profiles populated.
    """
    NZ = grid.NZ
    Nbit = grid.Nbit
    bit_depth = grid.bit_depth
    Tf_surface = grid.Tf[0] if len(grid.Tf) > 0 else 70.0

    # Allocate output arrays
    AnPres = np.zeros(NZ)
    DSPres = np.zeros(NZ)
    AnFric = np.zeros(NZ)
    DSFric = np.zeros(NZ)
    rhoa = np.zeros(NZ)
    rhop = np.zeros(NZ)
    Va = np.zeros(NZ)
    Vp = np.zeros(NZ)
    AnAVis = np.ones(NZ)
    DSAVis = np.ones(NZ)
    AnRe = np.zeros(NZ)
    DSRe = np.zeros(NZ)

    # Common kwargs for PGrad calls
    def _kwargs(mud_i: int, dref: float):
        return dict(
            Q0=Q0, bit_depth=bit_depth, RPM=RPM,
            Q_booster=Q_booster, booster_depth=booster_depth,
            tj_enabled=tj_enabled, fluids=fluids, pvt_data=pvt_data,
            influx_type=influx_type, influx_sg=influx_sg,
            Tf_surface=Tf_surface, C=C,
        )

    # ════════════════════════════════════════════════════════════════
    # 1. Surface outlet boundary condition
    # ════════════════════════════════════════════════════════════════
    AnPres[0] = SBP
    AnFric[0] = 0.0

    mud_i, dref = tracker.identify(2.0 * bit_depth)
    kw = _kwargs(mud_i, dref)

    for js in range(len(se_outlet.lengths)):
        Dh_s = se_outlet.diameters[js]
        D2_s = Dh_s * Dh_s
        r = _pgrad_call(
            AnPres[0], Ta[0], D2_s, Dh_s, 1.0, 1.0,
            0.0, 0.0, D2_s, 0.0, mud_i, dref, **kw,
        )
        AnFric[0] -= se_outlet.lengths[js] * r.pfg
        AnPres[0] -= se_outlet.lengths[js] * r.pfg

    # ════════════════════════════════════════════════════════════════
    # 2. Annulus integration (surface → bottom)  — RK4
    # ════════════════════════════════════════════════════════════════
    for j in range(NZ - 1):
        if j <= Nbit:
            mud_i, dref = tracker.identify(2.0 * bit_depth - grid.z[j])
        else:
            mud_i, dref = 1, density_ref

        kw = _kwargs(mud_i, dref)

        D2 = grid.HID[j] ** 2 - grid.POD[j] ** 2
        Dh = grid.HID[j] - grid.POD[j]
        rr = grid.POD[j] / grid.HID[j] if grid.HID[j] > 0 else 0.0
        j1 = j + 1
        D2_TJ = grid.HID[j] ** 2 - grid.TJOD[j] ** 2
        TJLn = grid.TJL[j]
        h = grid.dz[j]

        inc_j = grid.inc[j]
        inc_j1 = grid.inc[j1]
        inc_mid = 0.5 * (inc_j + inc_j1)
        md_j = grid.z[j]
        md_mid = md_j + 0.5 * h

        # RK4 stages
        k1 = _pgrad_call(AnPres[j], Ta[j],
                         D2, Dh, rr, 1.0, inc_j, md_j,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k2 = _pgrad_call(AnPres[j] + h * k1.pg / 2, Ta[j],
                         D2, Dh, rr, 1.0, inc_mid, md_mid,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k3 = _pgrad_call(AnPres[j] + h * k2.pg / 2, Ta[j],
                         D2, Dh, rr, 1.0, inc_mid, md_mid,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k4 = _pgrad_call(AnPres[j] + h * k3.pg, Ta[j],
                         D2, Dh, rr, 1.0, inc_j1, grid.z[j1],
                         D2_TJ, TJLn, mud_i, dref, **kw)

        PDrop = h * (k1.pg + 2 * k2.pg + 2 * k3.pg + k4.pg) / 6.0
        PFDrop = h * (k1.pfg + 2 * k2.pfg + 2 * k3.pfg + k4.pfg) / 6.0

        AnPres[j1] = AnPres[j] + PDrop
        AnFric[j1] = AnFric[j] + PFDrop

        # Store first-stage values for profiles
        rhoa[j] = k1.rho
        Va[j] = k1.V
        AnAVis[j] = k1.mu_app
        AnRe[j] = k1.NReG

    # Last-node density from k4
    rhoa[NZ - 1] = k4.rho

    # ════════════════════════════════════════════════════════════════
    # 3. Bit pressure loss
    # ════════════════════════════════════════════════════════════════
    _mud_i, _dref = tracker.identify(grid.z[Nbit])
    rho_bit = rhoa[Nbit]
    BitLoss = 0.0
    if TFA > 0:
        BitLoss = bit_pressure_loss(rho_bit, Q0, TFA, _dref, C)

    # ════════════════════════════════════════════════════════════════
    # 4. Drillstring integration (bit → surface) — RK4
    # ════════════════════════════════════════════════════════════════
    # Initialize DS at bit = annulus pressure + bit loss
    DSPres[Nbit] = AnPres[Nbit] + BitLoss
    DSFric[Nbit] = AnFric[Nbit] + BitLoss
    rhop[Nbit:] = rhoa[Nbit:]
    Vp[Nbit:] = 0.0

    for j in range(Nbit - 1, -1, -1):
        Dh = grid.PID[j]
        D2 = Dh * Dh
        j1 = j + 1
        D2_TJ = grid.TJID[j] ** 2
        TJLn = grid.TJL[j]
        h = grid.dz[j]

        mud_i, dref = tracker.identify(grid.z[j])
        kw = _kwargs(mud_i, dref)

        inc_j = grid.inc[j]
        inc_j1 = grid.inc[j1]
        inc_mid = 0.5 * (inc_j + inc_j1)
        md_j1 = grid.z[j1]
        md_mid = grid.z[j] + 0.5 * h

        # RK4 (integrating from j1 toward j, so subtract)
        k1 = _pgrad_call(DSPres[j1], Tp[j1],
                         D2, Dh, 1.0, 0.0, inc_j1, md_j1,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k2 = _pgrad_call(DSPres[j1] - h * k1.pg / 2, Tp[j1],
                         D2, Dh, 1.0, 0.0, inc_mid, md_mid,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k3 = _pgrad_call(DSPres[j1] - h * k2.pg / 2, Tp[j1],
                         D2, Dh, 1.0, 0.0, inc_mid, md_mid,
                         D2_TJ, TJLn, mud_i, dref, **kw)
        k4 = _pgrad_call(DSPres[j1] - h * k3.pg, Tp[j1],
                         D2, Dh, 1.0, 0.0, inc_j, grid.z[j],
                         D2_TJ, TJLn, mud_i, dref, **kw)

        PDrop = h * (k1.pg + 2 * k2.pg + 2 * k3.pg + k4.pg) / 6.0
        PFDrop = h * (k1.pfg + 2 * k2.pfg + 2 * k3.pfg + k4.pfg) / 6.0

        DSPres[j] = DSPres[j1] - PDrop
        DSFric[j] = DSFric[j1] - PFDrop

        rhop[j] = k4.rho
        Vp[j] = k4.V
        DSAVis[j] = k4.mu_app
        DSRe[j] = k4.NReG

    SPP = DSPres[0]

    # ════════════════════════════════════════════════════════════════
    # 5. Surface inlet equipment
    # ════════════════════════════════════════════════════════════════
    mud_i, dref = tracker.identify(0.0)
    kw = _kwargs(mud_i, dref)

    for js in range(len(se_inlet.lengths)):
        Dh_s = se_inlet.diameters[js]
        D2_s = Dh_s * Dh_s
        r = _pgrad_call(
            DSPres[0], Tp[0], D2_s, Dh_s, 1.0, 0.0,
            0.0, 0.0, D2_s, 0.0, mud_i, dref, **kw,
        )
        SPP -= se_inlet.lengths[js] * r.pfg

    return PressureState(
        AnPres=AnPres, DSPres=DSPres,
        AnFric=AnFric, DSFric=DSFric,
        SPP=SPP,
        rhoa=rhoa, rhop=rhop,
        Va=Va, Vp=Vp,
        AnAVis=AnAVis, DSAVis=DSAVis,
        AnRe=AnRe, DSRe=DSRe,
    )
