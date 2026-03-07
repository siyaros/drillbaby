"""
Well geometry: survey processing, mesh generation, and component mapping.

Handles:
  1. TVD calculation from inclination (minimum curvature)
  2. Computational grid generation with adaptive node placement
  3. Mapping of pipe/casing/hole geometry onto the grid
"""

from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray
from dataclasses import dataclass, field
from typing import Optional

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import (
    WellpathData, CasingData, HoleData, DrillStringData,
    FormationData, TemperatureInput,
)
from ..utils.interpolation import grid_char_interp


@dataclass
class GridGeometry:
    """Complete computational grid with all mapped properties.

    All arrays are length NZ (number of grid nodes).
    """
    # Grid coordinates
    z: NDArray          # [ft] measured depth at each node
    dz: NDArray         # [ft] cell sizes (NZ-1 elements)
    tvd: NDArray        # [ft] true vertical depth
    inc: NDArray        # [deg] inclination

    # Geometry arrays
    PID: NDArray        # [in] pipe inner diameter
    POD: NDArray        # [in] pipe outer diameter
    HID: NDArray        # [in] hole inner diameter
    COD: NDArray        # [in] casing outer diameter

    # Tool-joint arrays
    TJOD: NDArray       # [in] TJ outer diameter
    TJID: NDArray       # [in] TJ inner diameter
    TJL: NDArray        # [ft] TJ spacing

    # Formation properties on grid
    PPG: NDArray        # [ppg] pore pressure gradient
    FPG: NDArray        # [ppg] fracture pressure gradient
    Tf: NDArray         # [°F] formation temperature

    # Pore/frac pressure on grid
    PrPres: NDArray     # [psi] pore pressure
    FrPres: NDArray     # [psi] frac pressure

    # Special indices
    Nbit: int           # grid index of bit depth
    NZ: int             # total number of grid nodes

    @property
    def bit_depth(self) -> float:
        return self.z[self.Nbit]


def build_grid(
    wellpath: WellpathData,
    casings: CasingData,
    hole: HoleData,
    drillstring: DrillStringData,
    formations: FormationData,
    temperature: TemperatureInput,
    bit_depth: float,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> GridGeometry:
    """Build the computational grid and map all geometry.

    Replicates MATLAB main function lines 62-255.

    Parameters
    ----------
    wellpath : WellpathData   Survey stations
    casings : CasingData      Casing intervals
    hole : HoleData           Open-hole sections
    drillstring : DrillStringData  Drill-string components
    formations : FormationData   Formation tops
    temperature : TemperatureInput  Formation temperature profile
    bit_depth : float          Current bit depth [ft]
    C : PhysicalConstants

    Returns
    -------
    GridGeometry with all arrays populated.
    """
    L = bit_depth
    hmax = L / C.MAX_GRID_DIVISOR

    # Base uniform grid
    NZ_base = int(math.ceil(L / hmax)) + 1
    z0 = np.linspace(0.0, L, NZ_base)
    z0[-1] = L  # ensure exact

    # Collect all junction depths to merge into grid
    junctions = set(z0.tolist())
    junctions.add(bit_depth)

    # Drillstring segment boundaries
    segments = drillstring.segments
    NP = len(segments)
    # Accumulated pipe depths from bit (MATLAB L214)
    acc_lengths = np.array([s.total_length for s in segments])
    MDP = np.zeros(NP)
    MDP[-1] = bit_depth  # bit is last segment
    for ip in range(NP - 2, -1, -1):
        MDP[ip] = bit_depth - acc_lengths[ip + 1]

    for md in MDP:
        if 0 <= md <= L:
            junctions.add(md)

    # Casing setting depths
    for sd in casings.sd:
        if 0 < sd <= L:
            junctions.add(min(sd, L))
    for hd in casings.hd:
        if 0 < hd <= L:
            junctions.add(min(hd, L))

    # Hole tops
    for md in hole.md:
        if 0 < md <= L:
            junctions.add(min(md, L))

    # Formation tops
    for md in formations.md:
        if 0 < md <= L:
            junctions.add(md)

    # Build final sorted grid
    z = np.array(sorted(junctions))
    NZ = len(z)
    dz = np.diff(z)

    # Find bit index
    Nbit = NZ - 1
    for i in range(NZ - 1, -1, -1):
        if abs(z[i] - bit_depth) < 0.01:
            Nbit = i
            break

    # ── Inclination ──────────────────────────────────────────────
    inc = grid_char_interp(z, wellpath.md, wellpath.inclination)

    # ── TVD (minimum curvature) ──────────────────────────────────
    tvd = np.zeros(NZ)
    for j in range(1, NZ):
        dInc_half = abs(inc[j] - inc[j - 1]) * math.pi / 360.0
        CTVD = 1.0
        if dInc_half > 1e-6:
            CTVD = math.sin(dInc_half) / dInc_half
        tvd[j] = tvd[j - 1] + (z[j] - z[j - 1]) * math.cos(
            (inc[j] + inc[j - 1]) * math.pi / 360.0) * CTVD

    # ── Map pipe geometry ────────────────────────────────────────
    PID = np.full(NZ, segments[0].pid)
    POD = np.full(NZ, segments[0].od)
    TJOD = np.full(NZ, segments[0].tj_od)
    TJID = np.full(NZ, segments[0].tj_id)
    TJL = np.full(NZ, segments[0].tj_length)

    ip = 0
    for j in range(1, NZ):
        while ip < NP - 1 and MDP[ip + 1] <= z[j]:
            ip += 1
        # Clamp to valid segment range
        idx = min(ip, NP - 1)
        PID[j] = segments[idx].pid
        POD[j] = segments[idx].od
        TJOD[j] = segments[idx].tj_od
        TJID[j] = segments[idx].tj_id
        TJL[j] = segments[idx].tj_length

    # ── Map casing/hole geometry ─────────────────────────────────
    HID = np.full(NZ, casings.hid[0])
    COD = np.full(NZ, casings.od[0] if len(casings.od) > 0 else casings.hid[0])

    ic = 0
    NC = len(casings.sd)
    for j in range(1, NZ):
        while ic < NC - 1 and casings.sd[ic + 1] <= z[j]:
            ic += 1
        HID[j] = casings.hid[min(ic, NC - 1)]
        COD[j] = casings.od[min(ic, NC - 1)] if len(casings.od) > min(ic, NC - 1) else HID[j]

    # Open-hole sections override HID beyond last casing
    for j in range(NZ):
        for k in range(len(hole.md)):
            if z[j] >= hole.md[k] and z[j] > casings.sd[-1]:
                HID[j] = hole.diameter[k]
                COD[j] = hole.diameter[k]

    # ── Formation pressure gradients ─────────────────────────────
    PPG = np.full(NZ, formations.ppg[0])
    FPG = np.full(NZ, formations.fpg[0])
    ifm = 0
    NF = len(formations.md)
    for j in range(1, NZ):
        while ifm < NF - 1 and formations.md[ifm + 1] <= z[j]:
            ifm += 1
        PPG[j] = formations.ppg[min(ifm, NF - 1)]
        FPG[j] = formations.fpg[min(ifm, NF - 1)]

    PrPres = np.zeros(NZ)
    FrPres = np.zeros(NZ)
    for j in range(1, NZ):
        PrPres[j] = PPG[j - 1] * tvd[j] * C.HYDSTATIC_CONV
        FrPres[j] = FPG[j - 1] * tvd[j] * C.HYDSTATIC_CONV

    # ── Formation temperature ────────────────────────────────────
    Tf = grid_char_interp(z, temperature.tvd, temperature.temp)

    return GridGeometry(
        z=z, dz=dz, tvd=tvd, inc=inc,
        PID=PID, POD=POD, HID=HID, COD=COD,
        TJOD=TJOD, TJID=TJID, TJL=TJL,
        PPG=PPG, FPG=FPG, Tf=Tf,
        PrPres=PrPres, FrPres=FrPres,
        Nbit=Nbit, NZ=NZ,
    )
