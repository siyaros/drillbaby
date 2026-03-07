"""
Physical and unit-conversion constants for the hydraulics model.

Every constant is traced to either the engineering manual or the MATLAB
source (hyds_mod.m lines 41-50).  Values are *exact* copies of the MATLAB
code so that numerical comparison is bit-accurate.

US-field unit system:
    Pressure  : psi          Density   : ppg
    Length    : ft           Diameter  : in
    Velocity  : ft/min       Flow rate : gpm
    Temperature: °F          Time      : hr  (temperature), sec (real-time)
    Viscosity : cP           Shear stress: lbf/100 ft²
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class PhysicalConstants:
    """Immutable bag of every constant used by the hydraulics engine.

    Default values reproduce the MATLAB mirror code exactly.
    Override individual fields for sensitivity studies.
    """

    # ── velocity ────────────────────────────────────────────────────
    # V [ft/min] = AVG_VEL_UNIT_CONV * Q [gpm] / D² [in²]
    #   = 4/π * 12² / 231 * 60  ≈ 24.51  (manual §2.6.8)
    AVG_VEL_UNIT_CONV: float = 24.51

    # Tool-joint velocity conversion  (ft/min → ft/sec, with area factor)
    # = (4/π) * 19.25 / 60 = 0.4085   (manual §2.6.6)
    AVG_VEL_UNIT_CONV_RB: float = 0.4085

    # ── Reynolds number ─────────────────────────────────────────────
    # N_ReG = ρ V² / (REYNOLDS_NO_CONV * τ_w)
    # Derivation:  3600 * 0.4788 / (8 * 119.8 * 0.3048²) = 19.36
    REYNOLDS_NO_CONV: float = 19.36

    # ── pressure ────────────────────────────────────────────────────
    # ΔP_f = PRESS_LOSS_CONST * f * ρ * V² / D_h * ΔL
    # = 2 * 144 / (32.17 * 3600 * 231) = 1.076e-5   (manual §2.6.2)
    PRESS_LOSS_CONST: float = 1.076e-5

    # ΔP_h = HYDSTATIC_CONV * ρ * ΔTVD
    # = 12 / 231 ≈ 0.05195  (rounded to 0.052)
    HYDSTATIC_CONV: float = 12.0 / 231.0  # 0.051948…

    # Atmospheric pressure [psi]
    ATM_PRESSURE: float = 14.7

    # ── bit ──────────────────────────────────────────────────────────
    # ΔP_bit = ρ * V_bit² * TFAToPressure
    TFAToPressure: float = 0.00008311
    BIT_EFFICIENCY: float = 0.95  # discharge coefficient η

    # ── rheology / friction ──────────────────────────────────────────
    # τ_measured = SHEAR_STRESS_CORRECTION * θ_dial
    SHEAR_STRESS_CORRECTION: float = 1.066

    # μ_app [cP] = APPARENT_VISCOSITY * τ / γ̇
    APPARENT_VISCOSITY: float = 478.8026

    # Fann rpm → 1/s   γ̇ = SHEAR_RATE_CORRECTION * RPM_fann
    SHEAR_RATE_CORRECTION: float = 1.703

    # ── rotation loss (Hemphill 2008) ────────────────────────────────
    HEMPHILL_C1: float = 0.00017982
    HEMPHILL_C2: float = 0.000010792

    # ── tool-joint expansion / contraction ───────────────────────────
    # ΔP_exp = CON_EXP_CONST * ρ * (V1 - V2)²   (manual eq. 12-US)
    CON_EXP_CONST: float = 0.001614

    # ── thermal ──────────────────────────────────────────────────────
    PRANDTL_CONV: float = 2.4190883293
    GAL_PSI_TO_BTU: float = 0.0247
    PumpMechEff: float = 0.9

    # Thermal γ coefficients (US units, Eq 13-US)
    GAMMA1: float = 0.052         # = HYDSTATIC_CONV
    GAMMA2: float = 60.0
    GAMMA3: float = 1.4825
    GAMMA4: float = 1.0 / 144.0  # = 0.006944…

    # ── defaults for parameters that *should* be inputs ──────────────
    FORMATION_DENSITY_PPG: float = 19.19   # hardcoded in MATLAB L794
    CIRCULATION_TIME_HR: float = 24.0      # hardcoded in MATLAB L793
    THERMAL_EXPANSION: float = 0.0009      # hardcoded in MATLAB L811
    MAX_GRID_DIVISOR: float = 50.0         # hmax = L / 50  (MATLAB L65)

    # ── numerical ────────────────────────────────────────────────────
    VELOCITY_FLOOR: float = 0.1            # ft/min – prevents /0 in ffactor
    DRANCHUK_MAX_ITER: int = 20            # bisection iterations (MATLAB L634)
    DRANCHUK_RHO_BOUNDS: tuple[float, float] = (0.0, 2.0)
    GAS_DENSITY_FLOOR: float = 0.001       # ppg – floor in DranchukCorr
    DIFFUSION_DISABLED: bool = False        # toggle thermal diffusion
    OLD_NU: bool = False                    # False→Sieder-Tate, True→Hausen transitional
    INC_NATURAL_CONVECTION: bool = True


# Module-level singleton for convenience; solvers accept it as argument.
DEFAULT_CONSTANTS = PhysicalConstants()
