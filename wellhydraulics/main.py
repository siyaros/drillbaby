"""
Main entry point: run the hydraulics model from an Excel input file.

Usage:
    python -m wellhydraulics.main Inputtest.xlsx
"""

from __future__ import annotations

import sys
import logging
import numpy as np
from pathlib import Path

from .io.excel_reader import read_input_excel
from .config.constants import DEFAULT_CONSTANTS
from .geometry.grid import build_grid
from .fluid.identification import FluidTracker
from .friction.losses import compute_tfa
from .solver.steady_state import solve_steady_state

logger = logging.getLogger("wellhydraulics")


def run(input_path: str | Path, time_step_index: int = 0) -> dict:
    """Run the hydraulics model for one time step from an Excel file."""
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")

    logger.info("Reading input file: %s", input_path)
    inp = read_input_excel(input_path)

    return run_from_input(inp, time_step_index)


def run_from_input(inp, time_step_index: int = 0) -> dict:
    """Run the hydraulics model from a ModelInput object.

    This is the core solver entry point. The server calls this after
    optionally patching the ModelInput with user overrides.

    Parameters
    ----------
    inp : ModelInput (from schema.py or excel_reader)
    time_step_index : which row in realtime to solve

    Returns
    -------
    dict with keys: SPP, BHP, ECD, pstate, tstate, grid, inputs
    """
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")

    C = DEFAULT_CONSTANTS

    rt = inp.realtime[time_step_index]
    Q0 = rt.Q
    SBP = rt.SBP
    RPM = rt.RPM
    Tin = rt.T_inlet
    density_ref = rt.density_ref
    bit_depth = rt.bit_depth

    logger.info("Time step %d: Q=%.1f gpm, SBP=%.1f psi, RPM=%.0f, "
                "ρ_ref=%.2f ppg, BitDepth=%.0f ft",
                time_step_index, Q0, SBP, RPM, density_ref, bit_depth)

    # ── Build grid ───────────────────────────────────────────────
    logger.info("Building computational grid...")
    grid = build_grid(
        inp.wellpath, inp.casings, inp.hole, inp.drillstring,
        inp.formations, inp.temperature, bit_depth, C,
    )
    logger.info("Grid: %d nodes, bit at index %d (%.0f ft)",
                grid.NZ, grid.Nbit, grid.bit_depth)

    # ── Fluid tracker ────────────────────────────────────────────
    mud_index = rt.mud_index  # which fluid is active (1-based)
    tracker = FluidTracker(density_ref=density_ref, default_mud=mud_index)
    logger.info("Active fluid: index %d, PVT=%s",
                mud_index, inp.fluids[mud_index - 1].pvt_enabled)

    # ── Bit TFA ──────────────────────────────────────────────────
    bit_seg = inp.drillstring.segments[-1]
    num_nozzles = bit_seg.num_nozzles
    nozzle_size = bit_seg.nozzle_size
    TFA = compute_tfa(num_nozzles, nozzle_size)
    logger.info("Bit: %d nozzles × %d/32 in = TFA %.4f in²",
                num_nozzles, nozzle_size, TFA)

    # ── Solve ────────────────────────────────────────────────────
    logger.info("Running coupled P-T solver...")
    pstate, tstate = solve_steady_state(
        grid=grid,
        SBP=SBP,
        Q0=Q0,
        RPM=RPM,
        Tin=Tin,
        density_ref=density_ref,
        fluids=inp.fluids,
        pvt_data=inp.pvt,
        tracker=tracker,
        se_outlet=inp.se_outlet,
        se_inlet=inp.se_inlet,
        num_nozzles=num_nozzles,
        nozzle_size_32=nozzle_size,
        Q_booster=rt.Q_booster,
        booster_depth=inp.booster_depth,
        tj_enabled=inp.drillstring.has_tool_joints,
        Kf_formation=inp.formations.k_thermal,
        Cpf_formation=inp.formations.cp,
        dt=1.0,
        max_iter=50,
        tol=0.1,
        C=C,
    )

    # ── Key outputs ──────────────────────────────────────────────
    BHP = pstate.AnPres[grid.Nbit]
    ECD = BHP / (C.HYDSTATIC_CONV * grid.tvd[grid.Nbit]) if grid.tvd[grid.Nbit] > 0 else 0.0
    SPP = pstate.SPP

    logger.info("Results: SPP=%.1f psi, BHP=%.1f psi, ECD=%.2f ppg",
                SPP, BHP, ECD)

    return {
        "SPP": SPP,
        "BHP": BHP,
        "ECD": ECD,
        "pstate": pstate,
        "tstate": tstate,
        "grid": grid,
        "inputs": inp,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m wellhydraulics.main <input.xlsx>")
        sys.exit(1)
    result = run(sys.argv[1])
    print(f"\n{'='*50}")
    print(f"  SPP  = {result['SPP']:.1f} psi")
    print(f"  BHP  = {result['BHP']:.1f} psi")
    print(f"  ECD  = {result['ECD']:.2f} ppg")
    print(f"{'='*50}")
