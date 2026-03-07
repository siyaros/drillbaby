"""
Unit tests for wellhydraulics core physics.

Tests verify:
  1. Friction factor (API-13D) matches known analytical values
  2. Density models (PVT, Dranchuk, Black Oil, Sea Water)
  3. Rheology conversions (PV/YP/LSYP → HB)
  4. Pressure gradient sign conventions
  5. Grid construction
  6. Full solver produces reasonable values
"""

import math
import numpy as np
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from wellhydraulics.config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from wellhydraulics.config.schema import PVTCoefficients
from wellhydraulics.friction.api13d import friction_factor
from wellhydraulics.fluid.density import pvt_polynomial
from wellhydraulics.fluid.influx_density import dranchuk_gas_density, sea_water_density
from wellhydraulics.fluid.rheology import pv_yp_lsyp_to_hb, RheologyParams
from wellhydraulics.utils.numerics import bisection
from wellhydraulics.utils.interpolation import grid_char_interp


C = DEFAULT_CONSTANTS
PASS = 0
FAIL = 0


def check(name: str, got, expected, tol=1e-6):
    global PASS, FAIL
    if isinstance(expected, float):
        err = abs(got - expected)
        ok = err <= tol * max(abs(expected), 1.0)
    else:
        ok = got == expected
        err = 0
    if ok:
        PASS += 1
        print(f"  PASS  {name}: got={got:.6g}" if isinstance(got, float) else f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}: got={got}, expected={expected}, err={err}")


def test_friction_newtonian_laminar():
    """Newtonian fluid in laminar pipe flow: f = 64/Re (Darcy)."""
    print("\n=== Newtonian Laminar Friction ===")
    # n=1, K in lbf·s/100ft², tau_y=0 → Newtonian
    # Low velocity → laminar
    r = friction_factor(rho=8.35, Dh=4.0, V=10.0, alpha=0.0,
                        n=1.0, K=0.05, tau_y=0.0, C=C)
    # NReG should be positive
    check("NReG > 0", r.NReG > 0, True)
    # Friction factor should be dominated by laminar term
    check("ff > 0", r.ff > 0, True)
    # For Newtonian laminar: f_lam = 16/NReG
    f_lam = 16.0 / r.NReG
    check("ff ≈ f_lam (laminar regime)", r.ff, f_lam, tol=0.05)


def test_friction_turbulent():
    """High flow → turbulent regime: ff should decrease with Re."""
    print("\n=== Turbulent Friction ===")
    r_low = friction_factor(rho=8.35, Dh=4.0, V=100.0, alpha=0.0,
                            n=1.0, K=0.05, tau_y=0.0, C=C)
    r_high = friction_factor(rho=8.35, Dh=4.0, V=500.0, alpha=0.0,
                             n=1.0, K=0.05, tau_y=0.0, C=C)
    check("Higher V → higher NReG", r_high.NReG > r_low.NReG, True)
    check("Higher V → lower ff", r_high.ff < r_low.ff, True)


def test_friction_annulus_vs_pipe():
    """Annulus (alpha=1) vs pipe (alpha=0) give different results."""
    print("\n=== Annulus vs Pipe ===")
    r_pipe = friction_factor(rho=8.35, Dh=4.0, V=200.0, alpha=0.0,
                             n=0.7, K=0.1, tau_y=5.0, C=C)
    r_ann = friction_factor(rho=8.35, Dh=4.0, V=200.0, alpha=1.0,
                            n=0.7, K=0.1, tau_y=5.0, C=C)
    check("Pipe and annulus give different ff", abs(r_pipe.ff - r_ann.ff) > 0, True)


def test_pvt_polynomial():
    """PVT polynomial at reference conditions should give baseline density."""
    print("\n=== PVT Polynomial ===")
    # Simple test: if all coefficients except a1 are 0, density = a1
    c = PVTCoefficients(a1=8.5, b1=0, c1=0, a2=0, b2=0, c2=0)
    check("Constant PVT → a1", pvt_polynomial(5000.0, 150.0, c), 8.5, tol=1e-10)

    # Pressure dependence only
    c2 = PVTCoefficients(a1=8.0, b1=1e-4, c1=0, a2=0, b2=0, c2=0)
    check("Linear P dependence", pvt_polynomial(1000.0, 0.0, c2), 8.1, tol=1e-10)


def test_dranchuk_gas():
    """Dranchuk gas density: should give sensible values for methane."""
    print("\n=== Dranchuk Gas Density ===")
    rho = dranchuk_gas_density(gas_sg=0.6, P=5000.0, T=200.0)
    check("Gas density > 0", rho > 0, True)
    check("Gas density < water", rho < 8.35, True)
    check("Gas density reasonable range", 0.5 < rho < 5.0, True)


def test_sea_water():
    """Sea water density at standard conditions ≈ 8.55 ppg."""
    print("\n=== Sea Water Density ===")
    rho = sea_water_density(sg=1.025, P=14.7, T=60.0)
    check("Sea water ≈ 8.55 ppg", rho, 8.55, tol=0.2)


def test_pv_yp_lsyp():
    """PV/YP/LSYP → HB conversion: known case."""
    print("\n=== PV/YP/LSYP → HB ===")
    # Newtonian: PV>0, YP=0, LSYP=0 → n=1, tau_y=0
    r = pv_yp_lsyp_to_hb(PV=20.0, YP=20.0, LSYP=0.0)
    check("tau_y = LSYP = 0", r.tau_y, 0.0, tol=1e-10)
    check("n in (0,1]", 0.0 < r.n <= 1.0, True)
    check("K > 0", r.K > 0, True)


def test_bisection():
    """Bisection root finder: sqrt(2)."""
    print("\n=== Bisection ===")
    root = bisection(lambda x: x * x - 2.0, 1.0, 2.0, max_iter=50)
    check("sqrt(2)", root, math.sqrt(2.0), tol=1e-6)


def test_grid_char_interp():
    """Linear interpolation on grid."""
    print("\n=== Grid Interpolation ===")
    z_grid = np.array([0, 25, 50, 75, 100], dtype=float)
    z_junc = np.array([0, 100], dtype=float)
    vals = np.array([10.0, 20.0])
    result = grid_char_interp(z_grid, z_junc, vals)
    check("Midpoint interp", result[2], 15.0, tol=1e-10)
    check("Endpoint low", result[0], 10.0, tol=1e-10)
    check("Endpoint high", result[4], 20.0, tol=1e-10)


def test_full_solver():
    """Integration test: run solver on Inputtest.xlsx."""
    print("\n=== Full Solver (Inputtest.xlsx) ===")
    try:
        from wellhydraulics.main import run
        result = run('/mnt/project/Inputtest.xlsx', time_step_index=0)
        check("SPP > 0", result['SPP'] > 0, True)
        check("BHP > 0", result['BHP'] > 0, True)
        check("ECD > density_ref", result['ECD'] > 8.35, True)
        check("BHP > SPP", result['BHP'] > result['SPP'], True)
        check("SPP reasonable (100-5000 psi)", 100 < result['SPP'] < 5000, True)
        check("BHP reasonable (1000-10000 psi)", 1000 < result['BHP'] < 10000, True)
    except Exception as e:
        print(f"  FAIL  Full solver crashed: {e}")
        global FAIL
        FAIL += 1


if __name__ == "__main__":
    test_friction_newtonian_laminar()
    test_friction_turbulent()
    test_friction_annulus_vs_pipe()
    test_pvt_polynomial()
    test_dranchuk_gas()
    test_sea_water()
    test_pv_yp_lsyp()
    test_bisection()
    test_grid_char_interp()
    test_full_solver()

    print(f"\n{'='*50}")
    print(f"  Results: {PASS} passed, {FAIL} failed")
    print(f"{'='*50}")
    sys.exit(1 if FAIL > 0 else 0)
