"""
WellHydraulics API Server.

Run:  python -m wellhydraulics.server
Serves both the API and the React frontend (static files).
"""

from __future__ import annotations

import json
import logging
import math
import sys
import traceback
from pathlib import Path
from typing import Optional

import numpy as np

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
except ImportError:
    print("FastAPI not installed. Run: pip install fastapi uvicorn python-multipart")
    sys.exit(1)

from ..main import run as run_solver, run_from_input
from ..io.excel_reader import read_input_excel
from ..config.constants import DEFAULT_CONSTANTS as C

logger = logging.getLogger("wellhydraulics.server")

app = FastAPI(title="WellHydraulics API", version="0.1.0")

# CORS for local dev (React dev server on different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models for API ───────────────────────────────────────

class SolveRequest(BaseModel):
    """Request to run the hydraulics solver.
    Reads baseline from Excel, then applies any JSON overrides.
    """
    excel_path: Optional[str] = None
    time_step_index: int = 0
    # Sim parameter overrides
    flow_rate: Optional[float] = None
    rpm: Optional[float] = None
    sbp: Optional[float] = None
    mud_weight: Optional[float] = None
    bit_depth: Optional[float] = None
    inlet_temp: Optional[float] = None
    mud_index: Optional[int] = None
    # Geometry overrides (arrays from the UI tables)
    wellpath: Optional[list] = None       # [{md, inc, azi}, ...]
    casings: Optional[list] = None        # [{od, id, sd, hd}, ...]
    hole: Optional[list] = None           # [{md, dia}, ...]
    drillstring: Optional[list] = None    # [{od, id, len, ...}, ...]
    fluids: Optional[list] = None         # [{ty, n, K, ...}, ...]
    formations: Optional[list] = None     # [{md, ppg, fpg}, ...]
    temperature: Optional[list] = None    # [{tvd, temp}, ...]


class SolveResponse(BaseModel):
    """Response from the hydraulics solver."""
    success: bool
    scalars: dict = {}
    profiles: list = []
    grid_info: dict = {}
    error: Optional[str] = None


def _safe_float(v):
    """Convert numpy types to Python float, handling NaN/Inf."""
    if v is None:
        return None
    f = float(v)
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _result_to_dict(result: dict) -> dict:
    """Convert solver result to JSON-serializable dict."""
    g = result["grid"]
    p = result["pstate"]
    t = result["tstate"]
    Nbit = g.Nbit

    BHP = _safe_float(p.AnPres[Nbit])
    TVD_bit = _safe_float(g.tvd[Nbit])
    ECD = BHP / (C.HYDSTATIC_CONV * TVD_bit) if TVD_bit and TVD_bit > 0 else None

    scalars = {
        "SPP": _safe_float(p.SPP),
        "BHP": BHP,
        "ECD": _safe_float(ECD),
        "BHT": _safe_float(t.Ta[g.NZ - 1]),
        "BitLoss": _safe_float(p.DSPres[Nbit] - p.AnPres[Nbit]),
        "TotalDSFric": _safe_float(p.DSFric[0]),
        "TotalAnFric": _safe_float(p.AnFric[Nbit]),
        "BitDepth": _safe_float(g.bit_depth),
        "TVD_bit": TVD_bit,
    }

    profiles = []
    for i in range(g.NZ):
        profiles.append({
            "MD": _safe_float(g.z[i]),
            "TVD": _safe_float(g.tvd[i]),
            "Inc": _safe_float(g.inc[i]),
            "PID": _safe_float(g.PID[i]),
            "HID": _safe_float(g.HID[i]),
            "POD": _safe_float(g.POD[i]),
            "Pp": _safe_float(p.DSPres[i]),
            "Pa": _safe_float(p.AnPres[i]),
            "DSFric": _safe_float(p.DSFric[i]),
            "AnFric": _safe_float(p.AnFric[i]),
            "rhop": _safe_float(p.rhop[i]),
            "rhoa": _safe_float(p.rhoa[i]),
            "Vp": _safe_float(p.Vp[i]),
            "Va": _safe_float(p.Va[i]),
            "Tp": _safe_float(t.Tp[i]),
            "Ta": _safe_float(t.Ta[i]),
            "Tf": _safe_float(g.Tf[i]),
        })

    grid_info = {
        "NZ": g.NZ,
        "Nbit": Nbit,
        "bit_depth": _safe_float(g.bit_depth),
    }

    return {"scalars": scalars, "profiles": profiles, "grid_info": grid_info}


# ── API Routes ─────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "wellhydraulics", "version": "0.1.0"}


@app.post("/api/solve", response_model=SolveResponse)
def solve(req: SolveRequest):
    """Run the hydraulics solver. Reads Excel baseline, applies overrides, solves."""
    try:
        if not req.excel_path:
            raise HTTPException(status_code=400, detail="excel_path is required")

        path = Path(req.excel_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        # 1. Read baseline from Excel
        inp = read_input_excel(str(path))
        rt = inp.realtime[req.time_step_index]

        # 2. Apply simulation parameter overrides
        if req.flow_rate is not None:
            rt.Q = req.flow_rate
        if req.rpm is not None:
            rt.RPM = req.rpm
        if req.sbp is not None:
            rt.SBP = req.sbp
        if req.mud_weight is not None:
            rt.density_ref = req.mud_weight
        if req.bit_depth is not None:
            rt.bit_depth = req.bit_depth
        if req.inlet_temp is not None:
            rt.T_inlet = req.inlet_temp
        if req.mud_index is not None:
            rt.mud_index = req.mud_index

        # 3. Apply wellpath overrides
        if req.wellpath and len(req.wellpath) >= 2:
            inp.wellpath.md = np.array([float(p.get('md', 0)) for p in req.wellpath])
            inp.wellpath.inclination = np.array([float(p.get('inc', 0)) for p in req.wellpath])

        # 4. Apply casing overrides
        if req.casings and len(req.casings) >= 1:
            inp.casings.od = np.array([float(c.get('od', 0)) for c in req.casings])
            inp.casings.hid = np.array([float(c.get('id', 0)) for c in req.casings])
            inp.casings.sd = np.array([float(c.get('sd', 0)) for c in req.casings])
            inp.casings.hd = np.array([float(c.get('hd', 0)) for c in req.casings])

        # 5. Apply hole overrides
        if req.hole and len(req.hole) >= 1:
            inp.hole.md = np.array([float(h.get('md', 0)) for h in req.hole])
            inp.hole.diameter = np.array([float(h.get('dia', 0)) for h in req.hole])

        # 6. Apply formation overrides
        if req.formations and len(req.formations) >= 1:
            inp.formations.md = np.array([float(f.get('md', 0)) for f in req.formations])
            inp.formations.ppg = np.array([float(f.get('ppg', 0)) for f in req.formations])
            inp.formations.fpg = np.array([float(f.get('fpg', 0)) for f in req.formations])

        # 7. Apply temperature overrides
        if req.temperature and len(req.temperature) >= 2:
            inp.temperature.tvd = np.array([float(t.get('tvd', 0)) for t in req.temperature])
            inp.temperature.temp = np.array([float(t.get('temp', 0)) for t in req.temperature])

        # 8. Apply fluid overrides (rheology)
        if req.fluids and len(req.fluids) >= 1:
            for i, fov in enumerate(req.fluids):
                if i < len(inp.fluids):
                    fl = inp.fluids[i]
                    if 'ty' in fov and fov['ty'] is not None:
                        fl.tau_y = float(fov['ty'])
                    if 'n' in fov and fov['n'] is not None:
                        fl.n = float(fov['n'])
                    if 'K' in fov and fov['K'] is not None:
                        fl.K = float(fov['K'])

        logger.info("Solving with overrides: Q=%.1f, RPM=%.0f, SBP=%.1f, MW=%.2f",
                     rt.Q, rt.RPM, rt.SBP, rt.density_ref)

        # 9. Run solver with the modified ModelInput
        result = run_from_input(inp, time_step_index=req.time_step_index)
        data = _result_to_dict(result)

        return SolveResponse(
            success=True,
            scalars=data["scalars"],
            profiles=data["profiles"],
            grid_info=data["grid_info"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Solver error: %s", traceback.format_exc())
        return SolveResponse(success=False, error=str(e))


@app.post("/api/import/excel")
async def import_excel(file: UploadFile = File(...)):
    """Parse an Excel input file, save it, and return structured data."""
    try:
        # Save uploaded file to uploads directory (persistent, not /tmp)
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(exist_ok=True)
        saved_path = uploads_dir / file.filename
        content = await file.read()
        saved_path.write_bytes(content)

        # Parse with our reader
        inp = read_input_excel(str(saved_path))

        # Convert to JSON-serializable dict
        data = {
            "wellpath": {
                "md": inp.wellpath.md.tolist(),
                "inclination": inp.wellpath.inclination.tolist(),
            },
            "casings": {
                "od": inp.casings.od.tolist(),
                "hid": inp.casings.hid.tolist(),
                "sd": inp.casings.sd.tolist(),
                "hd": inp.casings.hd.tolist(),
            },
            "hole": {
                "md": inp.hole.md.tolist(),
                "diameter": inp.hole.diameter.tolist(),
            },
            "drillstring": [
                {
                    "description": s.description,
                    "od": s.od,
                    "id": s.pid,
                    "total_length": s.total_length,
                    "num_nozzles": s.num_nozzles,
                    "nozzle_size": s.nozzle_size,
                }
                for s in inp.drillstring.segments
            ],
            "fluids": [
                {
                    "index": f.index,
                    "base": int(f.base),
                    "pvt_enabled": f.pvt_enabled,
                    "tau_y": f.tau_y,
                    "n": f.n,
                    "K": f.K,
                    "k_thermal": f.k_thermal,
                    "cp": f.cp,
                }
                for f in inp.fluids
            ],
            "realtime": {
                "Q": inp.realtime[0].Q,
                "SBP": inp.realtime[0].SBP,
                "RPM": inp.realtime[0].RPM,
                "density_ref": inp.realtime[0].density_ref,
                "T_inlet": inp.realtime[0].T_inlet,
                "bit_depth": inp.realtime[0].bit_depth,
                "mud_index": inp.realtime[0].mud_index,
            },
            "formations": {
                "md": inp.formations.md.tolist(),
                "ppg": inp.formations.ppg.tolist(),
                "fpg": inp.formations.fpg.tolist(),
            },
            "temperature": {
                "tvd": inp.temperature.tvd.tolist(),
                "temp": inp.temperature.temp.tolist(),
            },
        }

        return {"success": True, "data": data, "file_path": str(saved_path)}

    except Exception as e:
        logger.error("Import error: %s", traceback.format_exc())
        return {"success": False, "error": str(e)}


# ── Server entry point ─────────────────────────────────────────────

def main():
    """Start the server."""
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    # Serve React static files if build exists
    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
        logger.info("Serving frontend from %s", static_dir)

    logger.info("Starting WellHydraulics server at http://localhost:8000")
    logger.info("API docs at http://localhost:8000/docs")

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    main()
