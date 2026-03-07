# WellHydraulics Platform: Development Plan & Architecture

## 1. Phased Development Plan

### Phase 1 — Hydraulics Monitoring Platform (Weeks 1-6)

**Goal:** A fully functional hydraulics engineering tool where users can input well data, run simulations, and visualize results through the dashboard.

**Milestone 1.1 — Backend API (Week 1-2)**
- Wrap the existing Python wellhydraulics engine in a FastAPI server
- REST endpoints: /api/solve (run simulation), /api/validate (compare outputs)
- Input: JSON payload matching current Excel schema
- Output: JSON with profiles, scalars, grid data
- WebSocket endpoint for progress updates during long runs

**Milestone 1.2 — Data Entry Forms (Week 2-3)**
- Connect React UI forms to backend state management
- Implement all input pages with validation: Well Data, Surface Equipment, Fluids, Drill String
- Add save/load project functionality (JSON files)
- Excel import: parse Input*.xlsx files directly in browser or via backend
- Excel export: generate Output*.xlsx from results

**Milestone 1.3 — Dashboard Integration (Week 3-4)**
- Connect depth plots to actual solver output (pressure vs depth, gradient vs depth)
- Connect time series to multi-step simulation results
- Well schematic renders from actual casing/DS/hole geometry
- KPI cards read from solver results
- Add gauge toggle for KPI display (numeric vs gauge visualization)

**Milestone 1.4 — Simulation Control (Week 4-5)**
- Steady-state snapshot mode (single solve)
- Transient mode (1801 time steps with progress bar)
- Parameter sweep mode (vary flow rate, RPM, SBP)
- Event-based mode (define sequence of parameter changes)
- Results comparison (overlay multiple runs on same charts)

**Milestone 1.5 — Polish & Deploy (Week 5-6)**
- Unit system conversion (US Field / SI)
- Local deployment: `python -m wellhydraulics.server` starts both API and serves React app
- Electron wrapper for desktop app (optional)
- Docker container for cloud deployment
- Documentation and user guide

### Phase 1B — AI Data Ingestion & Engineering Assistant (Weeks 7-12)

**Goal:** An AI-powered chat interface that can ingest engineering documents, populate the hydraulics model, and assist with analysis.

**Milestone 1B.1 — Chat Interface (Week 7-8)**
- Side panel chat UI in the dashboard
- Claude API integration for conversational interactions
- Context management: chat sees current model state (inputs + results)
- Basic commands: "run simulation", "change flow rate to 600 gpm", "show pressure profile"

**Milestone 1B.2 — Document Ingestion (Week 8-10)**
- File upload handler (PDF, Excel, CSV, LAS, images, text)
- PDF extraction pipeline: text + table extraction
- Image OCR for screenshots and scanned documents
- LAS file parser for well log data
- AI extraction: send document content to Claude with structured output schema
- Validation UI: show extracted parameters, let user confirm/modify before applying

**Milestone 1B.3 — Engineering Workflow (Week 10-12)**
- Multi-turn analysis conversations
- AI can run simulations and interpret results
- Comparison mode: "compare this case with 700 gpm flow rate"
- Automated report generation (docx/pdf with charts and analysis)
- Export analysis package (data + figures + narrative)

### Phase 2 — Real-Time Operations (Weeks 13-20)

- WITS/WITSML data connector
- Live data streaming to dashboard
- Model auto-calibration against real-time measurements
- Alarm system with configurable thresholds
- Edge deployment for rig-site operation

### Phase 3 — Advanced Simulation (Weeks 21-28)

- Influx detection and well control simulation
- Surge/swab analysis (tripping operations)
- Displacement simulation (cement/spacer/mud)
- Transient hydrodynamics (compressible flow)
- Multi-phase flow (gas kick circulation)

### Phase 4 — Autonomous Control (Weeks 29+)

- Closed-loop choke control (MPD CBHP)
- Predictive pressure management
- AI-assisted decision support
- Digital twin integration


## 2. Technical Architecture — Phase 1

### System Diagram

```
Browser (React SPA)
    |
    |-- HTTP/REST --> FastAPI Server (Python)
    |                    |
    |                    |-- wellhydraulics.main.run()
    |                    |-- wellhydraulics.io.excel_reader
    |                    |-- wellhydraulics.export_json
    |                    |
    |-- WebSocket -----> Progress updates
    |
    |-- Local storage -> Project files (JSON)
```

### Backend: FastAPI Server

```
wellhydraulics/
    server/
        app.py              # FastAPI application
        routes/
            solve.py        # POST /api/solve — run simulation
            project.py      # GET/POST /api/project — save/load
            import_excel.py # POST /api/import — parse Excel input
            export.py       # GET /api/export — generate Excel/JSON output
        models/
            input_schema.py # Pydantic models for API validation
            output_schema.py
        ws/
            progress.py     # WebSocket for run progress
```

**Key endpoints:**

POST /api/solve
- Input: { wellpath, casings, hole, drillstring, fluids, realtime, ... }
- Output: { scalars: {SPP, BHP, ECD, BHT}, profiles: [{MD, Pa, Pp, Ta, Tp, ...}], grid: {...} }
- Runs wellhydraulics.main.run() with provided parameters

POST /api/import/excel
- Input: multipart file upload (*.xlsx)
- Output: parsed input JSON (same schema as /api/solve input)
- Uses wellhydraulics.io.excel_reader

POST /api/export/excel
- Input: results JSON
- Output: downloadable .xlsx file

### Frontend: React Application

```
src/
    App.jsx                 # Root with routing and state
    state/
        projectStore.js     # Zustand store for project data
        solverStore.js      # Solver state (running, results, progress)
    pages/
        Dashboard.jsx       # Main monitoring view
        WellData.jsx        # Well data entry
        SurfaceEquip.jsx    # Surface equipment
        Fluids.jsx          # Fluid properties
        DrillString.jsx     # DS and BHA
        Simulation.jsx      # Run control
        Settings.jsx        # Units, display options
    components/
        charts/
            DepthPlot.jsx       # SVG depth-based chart
            TimeSeriesChart.jsx # Time-based chart with toggles
            GaugeKPI.jsx        # Numeric/gauge toggle KPI
        well/
            WellSchematic.jsx   # SVG well cross-section
        tables/
            DataTable.jsx       # Editable data table
        layout/
            Sidebar.jsx         # Navigation
            TopBar.jsx          # Mode selector, alarms
            KPIBar.jsx          # Operational KPIs
    api/
        client.js           # fetch/WebSocket wrapper
    utils/
        units.js            # Unit conversion
        validation.js       # Input validation rules
```

### State Management: Zustand

```javascript
// projectStore.js
const useProjectStore = create((set) => ({
    wellpath: [],
    casings: [],
    hole: [],
    drillstring: [],
    fluids: [],
    realtime: [],
    // ... all input data
    setWellpath: (data) => set({ wellpath: data }),
    loadFromJSON: (json) => set(json),
    exportToJSON: () => { /* returns full project */ },
}));

// solverStore.js
const useSolverStore = create((set) => ({
    status: 'idle',  // idle | running | complete | error
    progress: 0,
    results: null,
    history: [],     // previous runs for comparison
    runSolver: async () => {
        set({ status: 'running', progress: 0 });
        const input = useProjectStore.getState().exportToJSON();
        const ws = new WebSocket('/ws/progress');
        ws.onmessage = (e) => set({ progress: JSON.parse(e.data).pct });
        const res = await fetch('/api/solve', { method: 'POST', body: JSON.stringify(input) });
        const data = await res.json();
        set((s) => ({ status: 'complete', results: data, history: [...s.history, data] }));
    },
}));
```

### KPI Gauge Toggle Implementation

```javascript
// GaugeKPI.jsx — toggles between numeric and gauge display
function GaugeKPI({ label, value, unit, min, max, color, alarm }) {
    const [showGauge, setShowGauge] = useState(false);
    const pct = (value - min) / (max - min);

    if (!showGauge) {
        // Numeric display (current behavior)
        return <NumericKPI ... onClick={() => setShowGauge(true)} />;
    }

    // Gauge display — SVG arc
    return (
        <div onClick={() => setShowGauge(false)}>
            <svg> {/* arc gauge with needle */} </svg>
            <div>{value} {unit}</div>
        </div>
    );
}
```


## 3. Architecture — Phase 1B (AI Ingestion + Chat Assistant)

### System Diagram

```
Browser
    |
    |-- Chat Panel UI
    |       |
    |       v
    |-- POST /api/chat --> FastAPI
    |                        |
    |                        |-- Claude API (Anthropic)
    |                        |       |
    |                        |       |-- System prompt with:
    |                        |       |     - Current model state
    |                        |       |     - Available tools/functions
    |                        |       |     - Domain knowledge
    |                        |       |
    |                        |       |-- Tool calls:
    |                        |             - run_simulation(params)
    |                        |             - update_parameter(path, value)
    |                        |             - extract_from_document(file)
    |                        |             - generate_report(template)
    |                        |             - compare_cases(case_a, case_b)
    |                        |
    |                        |-- File processing pipeline
    |                        |       |
    |                        |       |-- PDF: pdfplumber -> text + tables
    |                        |       |-- Excel: openpyxl -> structured data
    |                        |       |-- CSV: pandas -> dataframe
    |                        |       |-- LAS: lasio -> well log curves
    |                        |       |-- Image: base64 -> Claude vision
    |                        |
    |                        |-- Return: { message, actions, model_updates }
    |
    |-- Model state updates --> React stores
```

### Chat Backend

```
wellhydraulics/
    ai/
        chat.py             # Chat endpoint handler
        system_prompt.py    # Dynamic system prompt builder
        tools.py            # Tool definitions for Claude
        extractors/
            pdf.py          # PDF text/table extraction
            excel.py        # Excel parsing
            las.py          # LAS file parsing
            image.py        # Image preprocessing for vision
        report/
            generator.py    # Report compilation
            templates/      # Report templates (docx)
```

### Claude Tool Definitions

```python
TOOLS = [
    {
        "name": "run_simulation",
        "description": "Run hydraulics simulation with current or modified parameters",
        "input_schema": {
            "type": "object",
            "properties": {
                "flow_rate": {"type": "number", "description": "Flow rate in gpm"},
                "rpm": {"type": "number"},
                "sbp": {"type": "number", "description": "Surface back pressure in psi"},
                "bit_depth": {"type": "number"},
            }
        }
    },
    {
        "name": "update_parameter",
        "description": "Update a specific input parameter in the model",
        "input_schema": {
            "type": "object",
            "properties": {
                "section": {"type": "string", "enum": ["wellpath","casings","hole","drillstring","fluids","realtime"]},
                "path": {"type": "string", "description": "Dot-notation path, e.g. 'fluids.0.n'"},
                "value": {"description": "New value"},
            },
            "required": ["section", "path", "value"]
        }
    },
    {
        "name": "extract_from_document",
        "description": "Extract drilling parameters from an uploaded document",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "string"},
                "target_sections": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["wellpath","casings","hole","drillstring","fluids","formations","temperature"]}
                }
            }
        }
    },
    {
        "name": "compare_cases",
        "description": "Compare results from two simulation cases",
        "input_schema": {
            "type": "object",
            "properties": {
                "case_a": {"type": "string", "description": "Run ID for case A"},
                "case_b": {"type": "string", "description": "Run ID for case B"},
                "metrics": {"type": "array", "items": {"type": "string"}}
            }
        }
    },
    {
        "name": "generate_report",
        "description": "Generate an engineering report from simulation results",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "include": {"type": "array", "items": {"type": "string", "enum": ["summary","pressure_profiles","temperature_profiles","drilling_window","recommendations"]}}
            }
        }
    }
]
```

### System Prompt Structure

```python
def build_system_prompt(project_state, solver_results):
    return f"""You are an AI drilling engineering assistant for the WellHydraulics platform.

Current well configuration:
- Well: {project_state['well_name']}
- Bit Depth: {project_state['bit_depth']} ft
- Mud Weight: {project_state['mud_weight']} ppg
- Flow Rate: {project_state['flow_rate']} gpm

Current results (if available):
- SPP: {solver_results.get('SPP', 'N/A')} psi
- BHP: {solver_results.get('BHP', 'N/A')} psi
- ECD: {solver_results.get('ECD', 'N/A')} ppg
- BHT: {solver_results.get('BHT', 'N/A')} F

Available input sections:
{json.dumps(project_state['inputs'], indent=2)}

You can use tools to:
1. Run simulations with modified parameters
2. Update model inputs
3. Extract data from uploaded documents
4. Compare simulation cases
5. Generate engineering reports

When extracting data from documents, always show the user what you extracted
and ask for confirmation before applying to the model.

When running simulations, explain what parameters changed and interpret the results
in engineering context (e.g., whether ECD is within the drilling window)."""
```

### Document Ingestion Pipeline

```python
async def ingest_document(file, target_sections):
    # 1. Extract raw content based on file type
    if file.type == "application/pdf":
        content = extract_pdf(file)      # text + tables
    elif file.type.endswith("sheet"):
        content = extract_excel(file)    # structured data
    elif file.type == "text/csv":
        content = extract_csv(file)      # dataframe
    elif file.suffix == ".las":
        content = extract_las(file)      # well log curves
    elif file.type.startswith("image"):
        content = encode_image(file)     # base64 for vision
    else:
        content = file.read_text()       # plain text

    # 2. Send to Claude with extraction prompt
    response = await claude.messages.create(
        model="claude-sonnet-4-20250514",
        system=EXTRACTION_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": f"Extract {target_sections} from this document:"},
                content_block,  # text or image
            ]
        }],
        tools=[{
            "name": "set_extracted_data",
            "input_schema": {
                "type": "object",
                "properties": {
                    "wellpath": {"type": "array", ...},
                    "casings": {"type": "array", ...},
                    "fluids": {"type": "object", ...},
                    # ... matches input schema
                }
            }
        }]
    )

    # 3. Return structured extraction for user review
    return {
        "extracted": response.tool_calls[0].input,
        "confidence": response.confidence_notes,
        "source_file": file.name,
    }
```

### Chat UI Component

```
src/
    components/
        chat/
            ChatPanel.jsx       # Sliding side panel
            ChatMessage.jsx     # Message bubble (text, charts, tables)
            FileUpload.jsx      # Drag-and-drop file upload
            ExtractionReview.jsx # Show extracted params for confirmation
            RunResult.jsx       # Inline simulation result display
```


## 4. How AI Assistant Interacts with Hydraulics Engine

The interaction follows a tool-use pattern:

### Flow 1: Direct Parameter Modification

```
User: "Change the mud weight to 13.5 ppg and run the simulation"

AI -> tool_call: update_parameter(section="fluids", path="0.density_ref", value=13.5)
   -> tool_call: run_simulation()
   -> Interprets results: "With 13.5 ppg mud, BHP increased to 5,612 psi.
      ECD at shoe is now 13.2 ppg, which is within the drilling window
      (pore: 9.5 ppg, frac: 16.5 ppg). The margin to fracture is 3.3 ppg."
```

### Flow 2: Document Ingestion

```
User: [uploads well_program.pdf]
      "Extract the casing program and formation data from this"

AI -> tool_call: extract_from_document(file_id="...", target_sections=["casings","formations"])
   -> Returns extracted data for review:
      "I extracted the following from the well program:

      Casings:
      - 20" conductor to 1,500 ft
      - 13-3/8" surface to 4,200 ft
      - 9-5/8" intermediate to 8,800 ft

      Formations:
      - Shale (0-3,000 ft): PPG 8.5, FPG 14.0
      - Sandstone (3,000-7,500 ft): PPG 9.8, FPG 15.5
      - Limestone (7,500-11,000 ft): PPG 10.2, FPG 16.0

      Should I apply these to the model?"

User: "Yes, but the intermediate casing shoe is at 9,000 ft, not 8,800"

AI -> tool_call: update_parameter(section="casings", path="2.sd", value=9000)
   -> "Updated. The intermediate casing shoe is now set to 9,000 ft.
      All other extracted values have been applied."
```

### Flow 3: Engineering Analysis

```
User: "What flow rate would give me the best bit hydraulics without exceeding fracture pressure?"

AI -> Runs parameter sweep internally:
   -> tool_call: run_simulation(flow_rate=400)
   -> tool_call: run_simulation(flow_rate=600)
   -> tool_call: run_simulation(flow_rate=800)
   -> tool_call: run_simulation(flow_rate=1000)
   -> Analyzes results:
      "Based on the parameter sweep:

      | Flow (gpm) | SPP (psi) | ECD (ppg) | Frac Margin | Bit HSI |
      |------------|-----------|-----------|-------------|---------|
      | 400        | 1,200     | 12.1      | 4.4 ppg     | 0.8     |
      | 600        | 2,100     | 12.5      | 4.0 ppg     | 1.8     |
      | 800        | 3,400     | 12.9      | 3.6 ppg     | 3.2     |
      | 1000       | 5,100     | 13.4      | 3.1 ppg     | 5.0     |

      Recommended: 800 gpm gives HSI of 3.2 (above the 2.0 threshold)
      with a comfortable 3.6 ppg margin to fracture."
```


## 5. Recommended Implementation Order

### Week 1-2: Backend API
1. Create `wellhydraulics/server/app.py` with FastAPI
2. Implement `/api/solve` endpoint wrapping `main.run()`
3. Implement `/api/import/excel` endpoint wrapping `excel_reader`
4. Add WebSocket for progress reporting
5. Test with existing Input-testOG.xlsx

### Week 2-3: Frontend Data Binding
1. Set up React project with Vite + Tailwind
2. Implement Zustand stores (project + solver)
3. Connect existing UI forms to stores
4. Add API client for backend communication
5. Implement save/load project (JSON files)

### Week 3-4: Dashboard Live Data
1. Connect DepthPlot to actual solver output arrays
2. Connect TimeSeriesChart to multi-step results
3. Generate WellSchematic from actual geometry data
4. Implement KPI gauge toggle component
5. Wire up "Run" button to solver API

### Week 4-5: Simulation Modes
1. Steady-state mode (single solve)
2. Transient mode with progress bar
3. Parameter sweep with results overlay
4. Event-based simulation
5. Results history and comparison

### Week 5-6: Deployment
1. Package as single `python -m wellhydraulics.server`
2. Serve React build from FastAPI static files
3. Docker container
4. User documentation

### Week 7-12: Phase 1B (AI)
1. Chat UI panel component
2. Claude API integration with tool use
3. Document upload and extraction pipeline
4. Engineering workflow tools
5. Report generation

This plan delivers a working hydraulics platform in 6 weeks, then adds AI capabilities in the following 6 weeks.
