"""
Coupled pressure-temperature solver.

Matches MATLAB main time loop exactly:
  Step 1  (it=1):  NIt=100, dt=1 hr  → P+T convergence loop
  Steps 2+ (it>1): NIt=1,  dt=1/3600 hr → single P+T per step

The MATLAB output at 30 minutes is a TRANSIENT snapshot, not
a true steady state. The Phase 1 convergence at dt=1hr establishes
an initial temperature field, then Phase 2 evolves it with coupled
small time steps.
"""

from __future__ import annotations

import numpy as np
import logging

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import FluidData, PVTData, SurfaceEquipment, InfluxType
from ..geometry.grid import GridGeometry
from ..fluid.identification import FluidTracker
from ..friction.losses import bit_pressure_loss, compute_tfa
from ..pressure.solver import solve_pressure, PressureState
from ..temperature.integrator import solve_temperature, TemperatureState

logger = logging.getLogger(__name__)


def solve_steady_state(
    grid: GridGeometry,
    SBP: float,
    Q0: float,
    RPM: float,
    Tin: float,
    density_ref: float,
    fluids: list[FluidData],
    pvt_data: PVTData,
    tracker: FluidTracker,
    se_outlet: SurfaceEquipment,
    se_inlet: SurfaceEquipment,
    num_nozzles: int,
    nozzle_size_32: int,
    Q_booster: float = 0.0,
    booster_depth: float = 0.0,
    tj_enabled: bool = False,
    influx_type: InfluxType = InfluxType.REAL_GAS,
    influx_sg: float = 0.6,
    Kf_formation: float = 0.98,
    Cpf_formation: float = 0.22,
    dt: float = 1.0,
    max_iter: int = 100,
    tol: float = 0.01,
    n_realtime_steps: int = 1800,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> tuple[PressureState, TemperatureState]:
    """Run coupled P-T solver matching MATLAB main loop."""
    NZ = grid.NZ
    TFA = compute_tfa(num_nozzles, nozzle_size_32)

    # Initial temperature profiles (isothermal at inlet)
    Ta = np.full(NZ, Tin)
    Tp = np.full(NZ, Tin)

    def _pressure(Ta, Tp):
        return solve_pressure(
            grid, SBP, Q0, RPM, Ta, Tp,
            density_ref, fluids, pvt_data, tracker,
            se_outlet, se_inlet, TFA,
            Q_booster, booster_depth, tj_enabled,
            influx_type, influx_sg, C,
        )

    def _temperature(pstate, Tpp, Tap, dt_hr, Tp_cur=None, Ta_cur=None):
        return solve_temperature(
            grid, pstate, Tpp, Tap,
            Tin, Q0, dt_hr, density_ref,
            fluids, pvt_data, tracker,
            theta_P=0.0, theta_A=0.0,
            Kf_formation=Kf_formation, Cpf_formation=Cpf_formation,
            Tp_current=Tp_cur, Ta_current=Ta_cur,
            C=C,
        )

    # ════════════════════════════════════════════════════════════════
    # STEP 1 (MATLAB it=1): dt=1hr, NIt=100
    # Tpp/Tap fixed at time-step start. Tp/Ta evolve between iterations
    # because MATLAB uses globals that persist across calls to
    # TemperatureIntegrator (L791: Tpi=Tp; Tai=Ta sets iteration ref,
    # NOT Tp/Ta themselves — those keep their values from last iteration).
    # ════════════════════════════════════════════════════════════════
    dt_phase1 = 1.0

    Tpp = np.copy(Tp)  # Fixed at Tin
    Tap = np.copy(Ta)

    for ii in range(max_iter):
        pstate = _pressure(Ta, Tp)

        Tp_iter = np.copy(Tp)
        Ta_iter = np.copy(Ta)

        # Pass Tpp/Tap as time-step ref, AND current Tp/Ta as starting state
        tstate = _temperature(pstate, Tpp, Tap, dt_phase1, Tp_cur=Tp, Ta_cur=Ta)
        Tp = tstate.Tp
        Ta = tstate.Ta

        max_diff = max(np.max(np.abs(Ta - Ta_iter)),
                       np.max(np.abs(Tp - Tp_iter)))
        if max_diff < tol:
            logger.info("Step 1 (dt=1hr): converged in %d iters "
                        "(MaxDiff=%.4f°F, BHT=%.1f°F, Tout=%.1f°F)",
                        ii + 1, max_diff, Ta[-1], Ta[0])
            break
    else:
        logger.warning("Step 1: %d iters (MaxDiff=%.4f°F)", max_iter, max_diff)

    # ════════════════════════════════════════════════════════════════
    # STEPS 2..Ntime (MATLAB it=2..1801): dt=1/3600hr, NIt=1
    # Each step: one pressure solve + one temperature step.
    # This evolves the temperature as a 30-minute transient from
    # the Phase 1 initial condition.
    # MATLAB lines 303, 338-349.
    # ════════════════════════════════════════════════════════════════
    dt_phase2 = 1.0 / 3600.0  # 1 second in hours

    for it in range(n_realtime_steps):
        # Tpp/Tap = temperature at start of this time step (MATLAB L327)
        Tpp = np.copy(Tp)
        Tap = np.copy(Ta)

        pstate = _pressure(Ta, Tp)
        tstate = _temperature(pstate, Tpp, Tap, dt_phase2)
        Tp = tstate.Tp
        Ta = tstate.Ta

    logger.info("Steps 2-%d (dt=1/3600hr): BHT=%.1f°F, Tout=%.1f°F",
                n_realtime_steps + 1, Ta[-1], Ta[0])

    # Final pressure with converged temperature
    pstate = _pressure(Ta, Tp)

    return pstate, tstate
