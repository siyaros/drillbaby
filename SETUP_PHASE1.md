# WellHydraulics Platform - Phase 1 Setup

## Quick Start

### 1. Install Python dependencies
```bash
cd C:\Users\siyar\Documents\HydraulicsModel
pip install fastapi uvicorn python-multipart
```

### 2. Start the API server
```bash
python -m wellhydraulics.server
```
This starts the API at http://localhost:8000
API docs at http://localhost:8000/docs

### 3. Test the API
Open browser to http://localhost:8000/docs and try:
- GET /api/health -> should return {"status": "ok"}
- POST /api/solve with body:
  ```json
  {
    "excel_path": "input-output/Input-testOG.xlsx",
    "time_step_index": 0
  }
  ```

### 4. Setup React frontend (optional for now)
```bash
cd wellhydraulics-ui
npm install
npm run dev
```
Opens at http://localhost:3000 (proxies API to :8000)

### 5. Build for production
```bash
cd wellhydraulics-ui
npm run build
```
This outputs to wellhydraulics/server/static/
Then `python -m wellhydraulics.server` serves everything.

## Project Structure
```
HydraulicsModel/
  wellhydraulics/           # Python package (existing)
    server/
      __init__.py           # FastAPI app + routes
      __main__.py           # Entry point
      static/               # React build output (after npm run build)
    main.py                 # Solver entry point
    io/                     # Excel reader
    config/                 # Constants, schemas
    ...
  wellhydraulics-ui/        # React frontend
    src/
      App.jsx               # Main app component
      api/client.js         # API communication
      state/stores.js       # Zustand state management
      theme.js              # Color/font constants
    package.json
    vite.config.js
  input-output/             # Test data files
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Server status |
| POST | /api/solve | Run hydraulics solver |
| POST | /api/import/excel | Parse Excel input file |

## Next Steps
1. Test API with existing Input-testOG.xlsx
2. Build React UI connected to API
3. Add Excel file upload in browser
4. Add parameter sweep mode
5. Add results comparison
