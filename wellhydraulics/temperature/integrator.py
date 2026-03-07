"""
Implicit finite-difference temperature integrator.

Exact line-by-line translation of MATLAB ``TemperatureIntegrator`` (L769-891).
"""

from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray
from dataclasses import dataclass
import logging

from ..config.constants import PhysicalConstants, DEFAULT_CONSTANTS
from ..config.schema import FluidData
from ..fluid.identification import FluidTracker
from ..pressure.solver import PressureState
from ..geometry.grid import GridGeometry
from .heat_transfer import forced_nusselt

logger = logging.getLogger(__name__)


@dataclass
class TemperatureState:
    Tp: NDArray
    Ta: NDArray
    BHT: float
    ReTp: NDArray
    ReTa: NDArray
    Prp: NDArray
    Pra: NDArray
    Nup: NDArray
    Nua: NDArray
    HTCp: NDArray
    HTCa: NDArray
    GF: NDArray
    Bp: NDArray
    Ba: NDArray


def solve_temperature(
    grid: GridGeometry,
    pstate: PressureState,
    Tp_prev: NDArray,
    Ta_prev: NDArray,
    Tin: float,
    Q0: float,
    dt: float,
    density_ref: float,
    fluids: list[FluidData],
    pvt_data,
    tracker: FluidTracker,
    theta_P: float = 0.0,
    theta_A: float = 0.0,
    Kf_formation: float = 0.98,
    Cpf_formation: float = 0.22,
    Tp_current: NDArray = None,
    Ta_current: NDArray = None,
    C: PhysicalConstants = DEFAULT_CONSTANTS,
) -> TemperatureState:
    NZ = grid.NZ
    Nbit = grid.Nbit
    Tf = grid.Tf

    rhop = pstate.rhop
    rhoa = pstate.rhoa
    Vp = pstate.Vp
    Va = pstate.Va
    DSAVis = pstate.DSAVis
    AnAVis = pstate.AnAVis
    DSFric = pstate.DSFric
    AnFric = pstate.AnFric
    DSPres = pstate.DSPres

    # Tpp/Tap = time-step reference for B2 term (fixed during iterations)
    Tpp = np.copy(Tp_prev)
    Tap = np.copy(Ta_prev)
    # Tp/Ta = current state that evolves during the FD sweep
    # If Tp_current provided, use it (convergence iterations within one time step)
    # Otherwise start from Tp_prev (single-step mode)
    Tp = np.copy(Tp_current) if Tp_current is not None else np.copy(Tp_prev)
    Ta = np.copy(Ta_current) if Ta_current is not None else np.copy(Ta_prev)

    def _fl(mud_i):
        return fluids[max(0, min(mud_i - 1, len(fluids) - 1))]

    TH = C.CIRCULATION_TIME_HR
    rhof = C.FORMATION_DENSITY_PPG
    thermalEx = C.THERMAL_EXPANSION
    gam1 = C.GAMMA1
    gam2 = C.GAMMA2
    gam3 = C.GAMMA3
    gam4 = C.GAMMA4
    Ks = 24.85

    UF = np.zeros(NZ)
    ReTp = np.zeros(NZ)
    ReTa = np.zeros(NZ)
    Prp = np.zeros(NZ)
    Pra = np.zeros(NZ)
    Nup_arr = np.zeros(NZ)
    Nua_arr = np.zeros(NZ)
    HTCp_arr = np.zeros(NZ)
    HTCa_arr = np.zeros(NZ)
    GF_arr = np.zeros(NZ)
    Bp = np.zeros((5, NZ))
    Ba = np.zeros((6, NZ))

    # ── Pump heating (L786-790) ──────────────────────────────────
    mud_i, dref = tracker.identify(0.0)
    fl = _fl(mud_i)
    rho_pump = density_ref
    DelTempPump = DSPres[0] * (rho_pump / dref - C.PumpMechEff) / dref / fl.cp * C.GAL_PSI_TO_BTU
    Tp[0] = Tin + DelTempPump

    # Get formation thermal properties (NOT fluid properties!)
    Kf = Kf_formation
    Cpf = Cpf_formation

    # Track Ap5 for use in annulus loop (MATLAB keeps it from last pipe iteration)
    Ap5 = 0.0

    # ═══════════ PIPE: surface → bit (L797-858) ═══════════════════
    # MATLAB: for j = 2 : NZZ (1-indexed, includes Nbit)
    # Python: for j in range(1, Nbit+1) (0-indexed, includes Nbit)
    NZZ = Nbit
    for j in range(1, NZZ + 1):
        j1 = j - 1
        DL = grid.dz[max(0, j - 2)]
        Dh = grid.PID[j1]
        HOD = grid.HID[j1] + 0.01
        DsArea = math.pi / 4.0 * Dh * Dh
        j2 = min(NZZ, j + 1)  # MATLAB: min(NZZ, j+1) but in 0-indexed

        mud_i, dref = tracker.identify(grid.z[j1])
        fl = _fl(mud_i)
        Cpm = fl.cp
        Km = fl.k_thermal
        Q = Q0 * dref / max(rhop[j1], 1e-6)

        mu_p = max(DSAVis[j1], 1e-6)
        ReTp[j1] = rhop[j1] * Vp[j1] * Dh / mu_p * 928.0 / 60.0
        Prp[j1] = C.PRANDTL_CONV * mu_p * Cpm / max(Km, 1e-10)

        Nup_arr[j1] = forced_nusselt(ReTp[j1], Prp[j1], C.OLD_NU)
        if C.INC_NATURAL_CONVECTION:
            Grp = 2.3 * abs(Tp[j1] - Ta[j1]) * Dh**3 * rhop[j1]**2 * thermalEx / mu_p**2
            Rap = Grp * Prp[j1]
            NuNp = 0.1 * abs(Rap) ** 0.33
            Nup_arr[j1] = (NuNp**3 + Nup_arr[j1]**3) ** 0.33

        hp = 12.0 * Nup_arr[j1] * Km / max(Dh, 1e-6)

        Dh_a = grid.HID[j1] - grid.POD[j1]
        mu_a = max(AnAVis[j1], 1e-6)
        ReTa[j1] = rhoa[j1] * Va[j1] * max(Dh_a, 0.01) / mu_a * 757.0 / 60.0
        Pra[j1] = C.PRANDTL_CONV * mu_a * Cpm / max(Km, 1e-10)

        Nua_arr[j1] = forced_nusselt(ReTa[j1], Pra[j1], C.OLD_NU)
        if C.INC_NATURAL_CONVECTION:
            Gra = 2.3 * abs(Tp[j1] - Ta[j1]) * max(Dh_a, 0.01)**3 * rhoa[j1]**2 * thermalEx / mu_a**2
            Raa = Gra * Pra[j1]
            NuNa = 0.1 * abs(Raa)**0.33 * 0.25 * (grid.HID[j1] / max(grid.POD[j1], 0.01))**0.15
            Nua_arr[j1] = (NuNa**3 + Nua_arr[j1]**3) ** 0.33

        ha = 12.0 * Nua_arr[j1] * Km / max(Dh_a, 0.01)

        HTCp_arr[j1] = 1.0 / (24.0 / grid.PID[j1] / max(hp, 1e-6)
                                + 24.0 / grid.POD[j1] / max(ha, 1e-6)
                                + math.log(max(grid.POD[j1] / grid.PID[j1], 1.001)) / Ks)
        HTCa_arr[j1] = 1.0 / (24.0 / grid.HID[j1] / max(ha, 1e-6)
                                + math.log(max(grid.COD[j1] / grid.HID[j1], 1.001)) / Ks)

        fadiff = Kf / max(rhof, 0.01) / 7.48 / max(Cpf, 0.01)
        td = 576.0 * TH * fadiff / (HOD * HOD)
        std = math.sqrt(max(td, 0.0))
        if td <= 1.5:
            tD = 1.1281 * std * (1.0 - 0.3 * std)
        else:
            tD = (0.4063 + math.log(max(td, 1e-10)) / 2.0) * (1.0 + 0.6 / max(td, 1e-10))
        GF_arr[j1] = HOD * HTCa_arr[j1] * tD / 24.0 / max(Kf, 1e-10)
        UF[j1] = HTCa_arr[j1] / (1.0 + GF_arr[j1])

        # FD coefficients (L845-855)
        Ap1 = gam1 * rhop[j1] * Cpm * DsArea
        Ap2 = gam2 * rhop[j1] * Cpm * Q
        Ap3 = 2.0 * math.pi * HTCp_arr[j1]
        Ap4 = -2.0 * math.pi * HTCp_arr[j1]

        if C.DIFFUSION_DISABLED:
            Ap5 = 0.0
        else:
            Ap5 = -gam4 * DsArea * Km / max(DL, 1e-10)

        Bp[3, j1] = dt * Ap5 / max(DL, 1e-10)
        Ap6 = -gam3 * Q * (DSFric[j1] - DSFric[j]) / max(DL, 1e-10) + Ap2 * theta_P

        BB = Ap1 + dt * Ap3 + dt * Ap2 / max(DL, 1e-10)

        Bp[0, j1] = -dt * (Ap2 - Ap5) / max(DL, 1e-10)
        Bp[1, j1] = -Ap1
        Bp[2, j1] = dt * Ap4
        Bp[4, j1] = dt * Ap6
        # Bp(:,j1) = -Bp(:,j1)/BB
        for k in range(5):
            Bp[k, j1] = -Bp[k, j1] / BB if abs(BB) > 1e-30 else 0.0

        Tp_j2 = Tp[j2] if j2 < NZ else Tp[min(j + 1, NZ - 1)]
        Tp[j] = (Bp[0, j1] * Tp[j1]
                 + Bp[1, j1] * Tpp[j]
                 + Bp[2, j1] * Ta[j]
                 + Bp[3, j1] * Tp_j2
                 + Bp[4, j1])

    # ── Bit heating (L859-860) ───────────────────────────────────
    mud_i, dref = tracker.identify(grid.z[Nbit])
    fl = _fl(mud_i)
    tempGenBit = 1.4825 * (DSFric[Nbit] - AnFric[Nbit]) / 60.0 / max(rhop[Nbit], 1e-6) / fl.cp
    Ta[Nbit] = Tp[Nbit] + tempGenBit

    # ═══════════ ANNULUS: bit → surface (L861-881) ════════════════
    for j in range(Nbit - 1, -1, -1):
        j1 = j + 1
        jm = max(0, j - 1)
        j2 = min(j + 2, Nbit)

        Dh_a = grid.HID[j] - grid.POD[j]
        DL = grid.dz[j]
        DLM = grid.dz[jm] if jm < len(grid.dz) else DL
        AnArea = math.pi / 4.0 * max(Dh_a, 0.01) * (grid.HID[j] + grid.POD[j])

        mud_i, dref = tracker.identify(2.0 * grid.z[Nbit] - grid.z[j])
        fl = _fl(mud_i)
        Cpm = fl.cp
        Km = fl.k_thermal
        Q = Q0 * dref / max(rhoa[j], 1e-6)

        Aa1 = gam1 * rhoa[j] * Cpm * AnArea
        Aa2 = gam2 * rhoa[j] * Cpm * Q
        Aa3 = -2.0 * math.pi * HTCp_arr[j]
        Aa4 = 2.0 * math.pi * (HTCp_arr[j] + UF[j])
        Aa5 = -2.0 * math.pi * UF[j]

        if C.DIFFUSION_DISABLED:
            Aa6 = 0.0
        else:
            Aa6 = gam4 * AnArea * Km / max(DL, 1e-10)

        Ba[4, j] = dt * Aa6 / max(DLM, 1e-10)
        Aa7 = -gam3 * Q * (AnFric[j1] - AnFric[j]) / max(DL, 1e-10) - Aa2 * theta_A

        BB = Aa1 + dt * Aa4 + dt * (Aa2 + Aa6) / max(DL, 1e-10)

        # NOTE: Ap5 retains value from last pipe loop iteration (MATLAB behavior)
        Ba[0, j] = -dt * (Aa2 + (1.0 + DL / max(DLM, 1e-10)) * Ap5) / max(DL, 1e-10)
        Ba[1, j] = -Aa1
        Ba[2, j] = dt * Aa3
        Ba[3, j] = dt * Aa5
        Ba[5, j] = dt * Aa7
        for k in range(6):
            Ba[k, j] = -Ba[k, j] / BB if abs(BB) > 1e-30 else 0.0

        Ta_j2 = Ta[j2] if j2 < NZ else Ta[min(j + 1, NZ - 1)]
        Ta[j] = (Ba[0, j] * Ta[j1]
                 + Ba[1, j] * Tap[j]
                 + Ba[2, j] * Tp[j]
                 + Ba[3, j] * Tf[j]
                 + Ba[4, j] * Ta_j2
                 + Ba[5, j])

    # ═══════════ BELOW BIT (L882-886) ═════════════════════════════
    for j in range(Nbit + 1, NZ):
        Dh_bb = grid.HID[j]
        AnArea_bb = math.pi / 4.0 * Dh_bb * Dh_bb
        fl = _fl(1)
        uf_j = UF[min(j, len(UF) - 1)]
        numer = (2.0 * math.pi * uf_j * Tf[j]
                 + rhoa[j] * fl.cp * AnArea_bb * C.HYDSTATIC_CONV * Tap[j] / max(dt, 1e-20))
        denom = (2.0 * math.pi * uf_j
                 + rhoa[j] * fl.cp * AnArea_bb * C.HYDSTATIC_CONV / max(dt, 1e-20))
        Ta[j] = numer / denom if denom > 0 else Tf[j]

    BHT = Ta[NZ - 1]

    return TemperatureState(
        Tp=Tp, Ta=Ta, BHT=BHT,
        ReTp=ReTp, ReTa=ReTa,
        Prp=Prp, Pra=Pra,
        Nup=Nup_arr, Nua=Nua_arr,
        HTCp=HTCp_arr, HTCa=HTCa_arr,
        GF=GF_arr, Bp=Bp, Ba=Ba,
    )
