"""
Export solver results as JSON for the validation dashboard.

Usage:
    python -m wellhydraulics.export_json Input-test.xlsx output.json
"""

import sys
import json
import numpy as np
from pathlib import Path

from .main import run


def export_json(input_path: str, output_path: str, time_step: int = 0):
    """Run solver and export profiles + scalars as JSON."""
    result = run(input_path, time_step_index=time_step)
    
    grid = result["grid"]
    pstate = result["pstate"]
    tstate = result["tstate"]
    
    NZ = grid.NZ
    
    # Build profile rows matching MATLAB Output sheet column order:
    # MD, Incl, PID, rho_p, V_p, DSRe, ReTp, DSFric, P_p, Prp, Nup, HTCp,
    # T_p, HID, POD, rho_a, V_a, AnRe, ReTa, AnFric, P_a, Pra, Nua, HTCa,
    # T_a, T_f, B1p, B2p, B3p, B4p, B5p, B1a, B2a, B3a, B4a, B5a, B6a, GF
    profiles = []
    for i in range(NZ):
        row = [
            float(grid.z[i]),           # 0: MD
            float(grid.inc[i]),         # 1: Incl
            float(grid.PID[i]),         # 2: PID
            float(pstate.rhop[i]),      # 3: rho_p
            float(pstate.Vp[i]),        # 4: V_p
            float(pstate.DSRe[i]),      # 5: DSRe
            float(tstate.ReTp[i]),      # 6: ReTp
            float(pstate.DSFric[i]),    # 7: DSFric
            float(pstate.DSPres[i]),    # 8: P_p
            float(tstate.Prp[i]),       # 9: Prp
            float(tstate.Nup[i]),       # 10: Nup
            float(tstate.HTCp[i]),      # 11: HTCp
            float(tstate.Tp[i]),        # 12: T_p
            float(grid.HID[i]),         # 13: HID
            float(grid.POD[i]),         # 14: POD
            float(pstate.rhoa[i]),      # 15: rho_a
            float(pstate.Va[i]),        # 16: V_a
            float(pstate.AnRe[i]),      # 17: AnRe
            float(tstate.ReTa[i]),      # 18: ReTa
            float(pstate.AnFric[i]),    # 19: AnFric
            float(pstate.AnPres[i]),    # 20: P_a
            float(tstate.Pra[i]),       # 21: Pra
            float(tstate.Nua[i]),       # 22: Nua
            float(tstate.HTCa[i]),      # 23: HTCa
            float(tstate.Ta[i]),        # 24: T_a
            float(grid.Tf[i]),          # 25: T_f
            float(tstate.Bp[0, i]),     # 26: B1p
            float(tstate.Bp[1, i]),     # 27: B2p
            float(tstate.Bp[2, i]),     # 28: B3p
            float(tstate.Bp[3, i]),     # 29: B4p
            float(tstate.Bp[4, i]),     # 30: B5p
            float(tstate.Ba[0, i]),     # 31: B1a
            float(tstate.Ba[1, i]),     # 32: B2a
            float(tstate.Ba[2, i]),     # 33: B3a
            float(tstate.Ba[3, i]),     # 34: B4a
            float(tstate.Ba[4, i]),     # 35: B5a
            float(tstate.Ba[5, i]),     # 36: B6a
            float(tstate.GF[i]),        # 37: GF
        ]
        profiles.append(row)
    
    Nbit = grid.Nbit
    BHP = pstate.AnPres[Nbit]
    SPP = pstate.SPP
    ECD = BHP / (0.052 * grid.tvd[Nbit]) if grid.tvd[Nbit] > 0 else 0
    
    output = {
        "scalars": {
            "SPP": float(SPP),
            "BHP": float(BHP),
            "ECD": float(ECD),
            "BHT": float(tstate.Ta[NZ - 1]),
            "BitLoss": float(pstate.DSPres[Nbit] - pstate.AnPres[Nbit]),
            "TotalDSFric": float(pstate.DSFric[0]),
            "TotalAnFric": float(pstate.AnFric[Nbit]),
        },
        "profiles": profiles,
        "grid": {
            "NZ": NZ,
            "Nbit": Nbit,
            "bit_depth": float(grid.bit_depth),
        },
    }
    
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"Exported {NZ} nodes to {output_path}")
    print(f"  SPP = {SPP:.1f} psi")
    print(f"  BHP = {BHP:.1f} psi")
    print(f"  ECD = {ECD:.2f} ppg")
    print(f"  BHT = {tstate.Ta[NZ-1]:.1f} °F")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python -m wellhydraulics.export_json <input.xlsx> <output.json>")
        sys.exit(1)
    export_json(sys.argv[1], sys.argv[2])
