"""
Input data schemas validated with pydantic.

Every field maps to a specific Excel sheet / column in the MATLAB input file.
Validation catches bad data before it reaches the solver.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional

import numpy as np
from numpy.typing import NDArray


# ── enums ────────────────────────────────────────────────────────────────

class MudBaseType(IntEnum):
    """Mud base fluid type (matches Excel 'Fluids' column B)."""
    MOBM = 1  # Mineral Oil Based Mud
    SBM = 2   # Synthetic Based Mud
    OBM = 3   # Oil Based Mud
    WBM = 4   # Water Based Mud


class SaltType(IntEnum):
    """Salt type for brine PVT (matches Excel 'Fluids' column G)."""
    CaCl2 = 1
    NaCl = 2


class InfluxType(IntEnum):
    """Influx fluid type (matches Excel 'Kick' column D)."""
    BLACK_OIL = 1
    REAL_GAS = 2
    SEA_WATER = 3


# ── data containers ──────────────────────────────────────────────────────

@dataclass
class WellpathData:
    """Survey stations from 'Wellpath' sheet."""
    md: NDArray           # [ft] measured depth
    inclination: NDArray  # [deg] hole inclination


@dataclass
class FormationData:
    """Formation tops from 'Formations' sheet."""
    md: NDArray            # [ft]
    ppg: NDArray           # [ppg] pore pressure gradient
    fpg: NDArray           # [ppg] fracture pressure gradient
    k_thermal: float       # [Btu/hr/ft/°F] formation thermal conductivity
    cp: float              # [Btu/lbm/°F] formation specific heat


@dataclass
class CasingData:
    """Casing intervals from 'Casings' sheet."""
    od: NDArray            # [in]
    hid: NDArray           # [in] casing ID (= hole ID inside casing)
    sd: NDArray            # [ft] setting depth
    hd: NDArray            # [ft] hanger depth


@dataclass
class HoleData:
    """Open-hole sections from 'Hole' sheet."""
    md: NDArray            # [ft]
    diameter: NDArray      # [in]


@dataclass
class TemperatureInput:
    """Formation temperature profile from 'Temp' sheet."""
    tvd: NDArray           # [ft]
    temp: NDArray          # [°F]


@dataclass
class KickData:
    """Kick / influx zone parameters from 'Kick' sheet."""
    md: float              # [ft] kick zone depth
    drain_radius: float    # [ft]
    gas_sg: float          # [-] specific gravity
    influx_type: InfluxType
    volume: float = 0.0    # [gal] – may come from real-time detection


@dataclass
class DrillStringSegment:
    """One drill-string component (pipe, BHA, bit) from 'DS' sheet."""
    description: str
    od: float              # [in]
    pid: float             # [in] pipe ID
    length: float          # [ft] accumulated length
    total_length: float    # [ft]
    tj_enabled: bool
    tj_od: float           # [in]
    tj_id: float           # [in]
    tj_length: float       # [ft] spacing between TJ
    k_thermal: float       # [Btu/hr/ft/°F] steel conductivity
    # Bit-specific
    num_nozzles: int = 0
    nozzle_size: int = 0   # [1/32 in]


@dataclass
class DrillStringData:
    """Complete drill string from 'DS' sheet."""
    segments: list[DrillStringSegment]
    steel_conductivity: float  # [Btu/hr/ft/°F]

    @property
    def bit(self) -> DrillStringSegment:
        return self.segments[-1]

    @property
    def has_tool_joints(self) -> bool:
        return any(s.tj_enabled for s in self.segments)


@dataclass
class SurfaceEquipment:
    """Surface piping from 'SEin'/'SEout' sheets."""
    lengths: NDArray       # [ft]
    diameters: NDArray     # [in]


@dataclass
class FluidData:
    """Single fluid definition from 'Fluids' sheet."""
    index: int
    base: MudBaseType
    temp_ref: float        # [°F]
    pvt_enabled: bool
    f_base_pct: float      # [%]
    f_brine_pct: float     # [%]
    salt_type: SaltType
    salinity_pct: float    # [%]
    k_thermal: float       # [Btu/hr/ft/°F]
    cp: float              # [Btu/lbm/°F]
    tau_y: float           # [lbf/100ft²]
    n: float               # [-] flow behaviour index
    K: float               # [lbf·sⁿ/100ft²] consistency index

    def __post_init__(self) -> None:
        if not (0.0 < self.n <= 1.0):
            raise ValueError(f"Flow index n={self.n} must be in (0, 1]")
        if self.K <= 0:
            raise ValueError(f"Consistency index K={self.K} must be > 0")
        if self.tau_y < 0:
            raise ValueError(f"Yield stress tau_y={self.tau_y} must be >= 0")


@dataclass
class PVTCoefficients:
    """Six-coefficient PVT model: ρ = a1+b1P+c1P² + (a2+b2P+c2P²)T."""
    a1: float
    b1: float
    c1: float
    a2: float
    b2: float
    c2: float

    def density(self, P: float, T: float) -> float:
        """Evaluate ρ(P,T) from the polynomial."""
        return (self.a1 + P * (self.b1 + P * self.c1)
                + T * (self.a2 + P * (self.b2 + P * self.c2)))


@dataclass
class PVTData:
    """PVT coefficients for all base/brine types from 'PVT' sheet."""
    base_coeffs: dict[MudBaseType, PVTCoefficients]
    # Brine coefficients per salt type and salinity bracket
    water_coeffs: PVTCoefficients  # s=0 (pure water)
    cacl2_s1: PVTCoefficients      # CaCl2 s=19.3%
    cacl2_s2: PVTCoefficients      # CaCl2 s=25%
    nacl_s1: PVTCoefficients       # NaCl s=10%
    nacl_s2: PVTCoefficients       # NaCl s=20%


@dataclass
class RealTimeStep:
    """One row of the 'RealTime' sheet."""
    time: float            # [sec]
    Q: float               # [gpm] flow rate
    SBP: float             # [psi] surface back pressure
    BHPC_enabled: bool
    BHP_setpoint: float    # [psi]
    gain: float            # controller gain
    Q_booster: float       # [gpm]
    mud_index: int         # fluid index (1-based)
    density_ref: float     # [ppg]
    T_inlet: float         # [°F]
    RPM: float
    bit_depth: float       # [ft]
    T_calib_enabled: bool
    BHT_measured: float    # [°F]
    T_out_measured: float  # [°F]
    Q_out: float           # [gpm] return flow


@dataclass
class CvCurveData:
    """Choke Cv curve from 'Cv-curve' sheet."""
    cv: NDArray            # Cv values (increasing)
    op: NDArray            # % open (increasing)


@dataclass
class ModelInput:
    """Top-level container for all validated inputs."""
    wellpath: WellpathData
    formations: FormationData
    casings: CasingData
    hole: HoleData
    temperature: TemperatureInput
    kick: KickData
    drillstring: DrillStringData
    se_inlet: SurfaceEquipment
    se_outlet: SurfaceEquipment
    booster_depth: float   # [ft], 0 = no booster
    fluids: list[FluidData]
    pvt: PVTData
    realtime: list[RealTimeStep]
    cv_curve: Optional[CvCurveData] = None
