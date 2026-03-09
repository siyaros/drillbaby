import { useState, useRef } from 'react';
import { useProjectStore, useSolverStore } from '../state/stores';
import { importExcel, runSolver as apiRunSolver } from '../api/client';
import { C } from '../theme';

var SWEEP_VARS = [
  { id: 'flowRate', label: 'Flow Rate', unit: 'gpm', key: 'flow_rate', min: 100, max: 1500, step: 100 },
  { id: 'rpm', label: 'RPM', unit: 'rpm', key: 'rpm', min: 0, max: 200, step: 20 },
  { id: 'sbp', label: 'SBP', unit: 'psi', key: 'sbp', min: 0, max: 500, step: 50 },
  { id: 'mudWeight', label: 'Mud Weight', unit: 'ppg', key: 'mud_weight', min: 7, max: 18, step: 0.5 },
  { id: 'bitDepth', label: 'Bit Depth', unit: 'ft', key: 'bit_depth', min: 1000, max: 15000, step: 1000 },
  { id: 'inletTemp', label: 'Inlet Temp', unit: 'F', key: 'inlet_temp', min: 50, max: 200, step: 10 },
];

var SWEEP_COLORS = ['#4a9eff','#34d399','#fbbf24','#f472b6','#a78bfa','#fb923c','#00d4aa','#f87171'];

// XY Chart for sweep results
function SweepChart({ sweepVar, results, width, height }) {
  if (!results || results.length < 2) return null;

  var hdr = 30;
  var pad = { t: 8, b: 28, l: 50, r: 16 };
  var w = width - pad.l - pad.r;
  var h = height - hdr - pad.t - pad.b;

  var xVals = results.map(function (r) { return r.sweepValue; });
  var xMin = Math.min.apply(null, xVals);
  var xMax = Math.max.apply(null, xVals);
  var xR = xMax - xMin || 1;

  var outputTraces = [
    { key: 'SPP', label: 'SPP', color: C.cyan, unit: 'psi' },
    { key: 'BHP', label: 'BHP', color: C.blue, unit: 'psi' },
    { key: 'ECD', label: 'ECD', color: C.green, unit: 'ppg' },
    { key: 'BHT', label: 'BHT', color: C.red, unit: 'F' },
  ];

  // Each trace gets its own Y range (dual axis not needed, just normalize)
  function toX(v) { return pad.l + ((v - xMin) / xR) * w; }

  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, overflow: 'hidden', marginTop: 16 }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>Sweep Results</span>
        <span style={{ fontSize: 9, color: C.t0 }}>{sweepVar.label} ({sweepVar.unit})</span>
      </div>

      {/* One mini chart per output */}
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {outputTraces.map(function (trace) {
          var yVals = results.map(function (r) { return r.scalars[trace.key] || 0; });
          var yMin = Math.min.apply(null, yVals);
          var yMax = Math.max.apply(null, yVals);
          var yR = yMax - yMin || 1;
          yMin = yMin - yR * 0.1;
          yMax = yMax + yR * 0.1;
          yR = yMax - yMin;

          function toY(v) { return pad.t + h - ((v - yMin) / yR) * h; }

          var pts = results.map(function (r, i) {
            return toX(r.sweepValue) + ',' + toY(r.scalars[trace.key] || 0);
          }).join(' ');

          var chartW = width / 2;
          var chartH = 160;
          var ch = chartH - hdr - pad.t - pad.b;

          function toYc(v) { return pad.t + ch - ((v - yMin) / yR) * ch; }
          var ptsc = results.map(function (r) {
            return toX(r.sweepValue) + ',' + toYc(r.scalars[trace.key] || 0);
          }).join(' ');

          return (
            <div key={trace.key} style={{ width: '50%', borderRight: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border }}>
              <svg width={chartW} height={chartH} viewBox={'0 0 ' + width + ' ' + chartH} style={{ display: 'block', width: '100%' }}>
                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(function (f, i) {
                  var y = pad.t + ch * (1 - f);
                  var v = yMin + yR * f;
                  return <g key={i}>
                    <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={C.border} strokeWidth="0.4" />
                    <text x={pad.l - 4} y={y + 3} fill={C.t0} fontSize="8" textAnchor="end">
                      {v > 100 ? Math.round(v) : v.toFixed(1)}
                    </text>
                  </g>;
                })}
                {/* X grid */}
                {results.map(function (r, i) {
                  var x = toX(r.sweepValue);
                  return <g key={i}>
                    <line x1={x} x2={x} y1={pad.t} y2={pad.t + ch} stroke={C.border} strokeWidth="0.3" />
                    <text x={x} y={chartH - 4} fill={C.t0} fontSize="8" textAnchor="middle">
                      {r.sweepValue > 100 ? Math.round(r.sweepValue) : r.sweepValue.toFixed(1)}
                    </text>
                  </g>;
                })}

                {/* Line */}
                <polyline points={ptsc} fill="none" stroke={trace.color} strokeWidth="2" />
                {/* Dots */}
                {results.map(function (r, i) {
                  return <circle key={i} cx={toX(r.sweepValue)} cy={toYc(r.scalars[trace.key] || 0)}
                    r={3.5} fill={trace.color} stroke={C.bg} strokeWidth="1" />;
                })}

                {/* Label */}
                <text x={pad.l + 4} y={pad.t + 12} fill={trace.color} fontSize="11" fontWeight="700">
                  {trace.label} ({trace.unit})
                </text>
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SimulationPage() {
  var simParams = useProjectStore(function (s) { return s.simParams; });
  var setSimParams = useProjectStore(function (s) { return s.setSimParams; });
  var excelPath = useProjectStore(function (s) { return s.excelPath; });
  var setExcelPath = useProjectStore(function (s) { return s.setExcelPath; });
  var loadFromImport = useProjectStore(function (s) { return s.loadFromImport; });

  var status = useSolverStore(function (s) { return s.status; });
  var progress = useSolverStore(function (s) { return s.progress; });
  var error = useSolverStore(function (s) { return s.error; });
  var results = useSolverStore(function (s) { return s.results; });
  var runSolver = useSolverStore(function (s) { return s.run; });
  var history = useSolverStore(function (s) { return s.history; });

  // File upload state
  var stDrag = useState(false);
  var dragging = stDrag[0], setDragging = stDrag[1];
  var stUploading = useState(false);
  var uploading = stUploading[0], setUploading = stUploading[1];
  var stUploadMsg = useState('');
  var uploadMsg = stUploadMsg[0], setUploadMsg = stUploadMsg[1];
  var stFileName = useState('');
  var fileName = stFileName[0], setFileName = stFileName[1];
  var fileRef = useRef(null);
  var running = status === 'running';

  // Sweep state
  var stSweepVar = useState('flowRate');
  var sweepVarId = stSweepVar[0], setSweepVarId = stSweepVar[1];
  var stSweepFrom = useState('');
  var sweepFrom = stSweepFrom[0], setSweepFrom = stSweepFrom[1];
  var stSweepTo = useState('');
  var sweepTo = stSweepTo[0], setSweepTo = stSweepTo[1];
  var stSweepSteps = useState(5);
  var sweepSteps = stSweepSteps[0], setSweepSteps = stSweepSteps[1];
  var stSweepRunning = useState(false);
  var sweepRunning = stSweepRunning[0], setSweepRunning = stSweepRunning[1];
  var stSweepProgress = useState('');
  var sweepProgress = stSweepProgress[0], setSweepProgress = stSweepProgress[1];
  var stSweepResults = useState(null);
  var sweepResults = stSweepResults[0], setSweepResults = stSweepResults[1];
  var stSweepError = useState(null);
  var sweepError = stSweepError[0], setSweepError = stSweepError[1];

  var sweepVar = SWEEP_VARS.find(function (v) { return v.id === sweepVarId; });

  // Update from/to when sweep variable changes
  function handleSweepVarChange(newId) {
    setSweepVarId(newId);
    var sv = SWEEP_VARS.find(function (v) { return v.id === newId; });
    if (sv) {
      setSweepFrom(String(sv.min));
      setSweepTo(String(sv.max));
    }
  }

  // File upload handlers
  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) { setUploadMsg('Please upload .xlsx'); return; }
    setFileName(file.name); setUploading(true); setUploadMsg('Uploading...');
    importExcel(file).then(function (response) {
      setUploading(false);
      if (response.success) {
        setExcelPath(response.file_path);
        loadFromImport(response.data);
        if (response.data.realtime) {
          setSimParams({
            flowRate: response.data.realtime.Q, rpm: response.data.realtime.RPM,
            sbp: response.data.realtime.SBP, mudWeight: response.data.realtime.density_ref,
            bitDepth: response.data.realtime.bit_depth, inletTemp: response.data.realtime.T_inlet,
          });
        }
        setUploadMsg('Parsed! ' + (response.data.drillstring ? response.data.drillstring.length : 0) + ' DS segments loaded.');
      } else { setUploadMsg('Error: ' + (response.error || 'Unknown')); }
    }).catch(function (err) { setUploading(false); setUploadMsg('Failed: ' + err.message); });
  }
  function handleDrop(e) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); }
  function handleDragOver(e) { e.preventDefault(); setDragging(true); }
  function handleDragLeave(e) { e.preventDefault(); setDragging(false); }
  function handleFileInput(e) { if (e.target.files.length) handleFile(e.target.files[0]); }
  function handleRun() { if (!excelPath) { alert('Upload file first'); return; } runSolver(); }

  // Run sweep
  async function handleSweep() {
    if (!excelPath) { alert('Upload file first'); return; }
    var from = parseFloat(sweepFrom);
    var to = parseFloat(sweepTo);
    var steps = parseInt(sweepSteps) || 5;
    if (isNaN(from) || isNaN(to) || from >= to) { alert('Invalid sweep range'); return; }

    setSweepRunning(true); setSweepError(null); setSweepResults(null);
    var allResults = [];
    var project = useProjectStore.getState();

    for (var i = 0; i < steps; i++) {
      var val = from + (to - from) * i / (steps - 1);
      setSweepProgress('Running ' + (i + 1) + '/' + steps + ' (' + sweepVar.label + '=' + val.toFixed(1) + ')');

      var params = {
        excel_path: project.excelPath,
        time_step_index: 0,
        flow_rate: project.simParams.flowRate,
        rpm: project.simParams.rpm,
        sbp: project.simParams.sbp,
        mud_weight: project.simParams.mudWeight,
        bit_depth: project.simParams.bitDepth,
        inlet_temp: project.simParams.inletTemp,
        mud_index: project.simParams.mudIndex,
        wellpath: project.wellpath,
        casings: project.casings,
        hole: project.hole,
        formations: project.formations,
        temperature: project.temperature,
        fluids: project.fluids,
      };
      // Override the sweep variable
      params[sweepVar.key] = val;

      try {
        var response = await apiRunSolver(params);
        if (response.success) {
          allResults.push({ sweepValue: val, scalars: response.scalars, profiles: response.profiles });
        } else {
          allResults.push({ sweepValue: val, scalars: {}, error: response.error });
        }
      } catch (err) {
        allResults.push({ sweepValue: val, scalars: {}, error: err.message });
      }

      // Update results progressively
      setSweepResults(allResults.slice());
    }

    setSweepRunning(false);
    setSweepProgress('Complete - ' + steps + ' runs');
  }

  var inputStyle = { width: '100%', background: C.bgIn, border: '1px solid ' + C.border,
    borderRadius: 4, padding: '8px 10px', color: C.t3, fontSize: 12, outline: 'none' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 16, overflow: 'auto' }}>
      {/* LEFT COLUMN */}
      <div>
        {/* File upload */}
        <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          onClick={function () { fileRef.current.click(); }}
          style={{ background: dragging ? C.blue + '15' : C.bg2, borderRadius: 8,
            border: '2px dashed ' + (dragging ? C.blue : fileName ? C.green : C.border),
            padding: 20, marginBottom: 16, textAlign: 'center', cursor: 'pointer' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileInput} />
          {uploading ? <div style={{ fontSize: 12, color: C.amber }}>Parsing...</div>
            : fileName ? <div><div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{fileName}</div>
              <div style={{ fontSize: 9, color: C.t0 }}>Click to replace</div></div>
            : <div><div style={{ fontSize: 20, color: C.t0 }}>+</div>
              <div style={{ fontSize: 12, color: C.t2 }}>Drop Excel file here</div></div>}
        </div>
        {uploadMsg && <div style={{ padding: '6px 10px', marginBottom: 12, borderRadius: 6, fontSize: 10,
          background: uploadMsg.includes('Error') || uploadMsg.includes('Failed') ? C.red + '18' : C.green + '18',
          color: uploadMsg.includes('Error') || uploadMsg.includes('Failed') ? C.red : C.green }}>{uploadMsg}</div>}
        {excelPath && <div style={{ background: C.bg2, borderRadius: 6, border: '1px solid ' + C.border,
          padding: '8px 10px', marginBottom: 12, fontSize: 10, color: C.t1 }}>Server: {excelPath}</div>}

        {/* Parameters */}
        <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>PARAMETERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[{ l: 'Flow Rate (gpm)', k: 'flowRate' }, { l: 'RPM', k: 'rpm' },
              { l: 'SBP (psi)', k: 'sbp' }, { l: 'Bit Depth (ft)', k: 'bitDepth' },
              { l: 'Mud Weight (ppg)', k: 'mudWeight' }, { l: 'Inlet Temp (F)', k: 'inletTemp' },
            ].map(function (f) {
              return <div key={f.k}>
                <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>{f.l}</div>
                <input value={simParams[f.k]} onChange={function (e) {
                  var obj = {}; obj[f.k] = parseFloat(e.target.value) || 0; setSimParams(obj);
                }} style={inputStyle} />
              </div>;
            })}
          </div>
        </div>

        {/* Run single */}
        <button onClick={handleRun} disabled={running || !excelPath} style={{
          width: '100%', padding: 14, borderRadius: 8, border: 'none',
          background: running ? '#1e3a5f' : !excelPath ? C.bg3 : C.blue,
          color: !excelPath ? C.t0 : '#fff', fontSize: 14, fontWeight: 700,
          cursor: running || !excelPath ? 'not-allowed' : 'pointer' }}>
          {running ? 'RUNNING...' : !excelPath ? 'UPLOAD FILE FIRST' : 'RUN SIMULATION'}
        </button>
        {error && <div style={{ marginTop: 8, padding: 8, background: C.red + '18', border: '1px solid ' + C.red,
          borderRadius: 6, color: C.red, fontSize: 11 }}>Error: {error}</div>}

        {/* === PARAMETER SWEEP === */}
        <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>PARAMETER SWEEP</div>

          {/* Variable selector */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.t0, marginBottom: 4 }}>Sweep Variable</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {SWEEP_VARS.map(function (sv) {
                var active = sweepVarId === sv.id;
                return <button key={sv.id} onClick={function () { handleSweepVarChange(sv.id); }} style={{
                  padding: '5px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: active ? C.blue + '20' : 'transparent',
                  border: '1px solid ' + (active ? C.blue : C.border),
                  color: active ? C.blue : C.t0, cursor: 'pointer' }}>{sv.label}</button>;
              })}
            </div>
          </div>

          {/* Range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>From ({sweepVar.unit})</div>
              <input value={sweepFrom} onChange={function (e) { setSweepFrom(e.target.value); }} style={inputStyle}
                placeholder={String(sweepVar.min)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>To ({sweepVar.unit})</div>
              <input value={sweepTo} onChange={function (e) { setSweepTo(e.target.value); }} style={inputStyle}
                placeholder={String(sweepVar.max)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>Steps</div>
              <input value={sweepSteps} onChange={function (e) { setSweepSteps(parseInt(e.target.value) || 2); }}
                style={inputStyle} />
            </div>
          </div>

          {/* Fixed params info */}
          <div style={{ fontSize: 9, color: C.t0, marginBottom: 12 }}>
            Fixed: {SWEEP_VARS.filter(function (v) { return v.id !== sweepVarId; }).map(function (v) {
              return v.label + '=' + simParams[v.id];
            }).join(', ')}
          </div>

          {/* Run sweep button */}
          <button onClick={handleSweep} disabled={sweepRunning || !excelPath} style={{
            width: '100%', padding: 12, borderRadius: 8, border: 'none',
            background: sweepRunning ? '#1e3a5f' : !excelPath ? C.bg3 : C.amber,
            color: sweepRunning || !excelPath ? C.t0 : C.bg, fontSize: 13, fontWeight: 700,
            cursor: sweepRunning || !excelPath ? 'not-allowed' : 'pointer' }}>
            {sweepRunning ? sweepProgress : 'RUN SWEEP'}
          </button>

          {sweepError && <div style={{ marginTop: 8, padding: 8, background: C.red + '18',
            borderRadius: 6, color: C.red, fontSize: 10 }}>{sweepError}</div>}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div>
        {/* Current results */}
        {results && results.success && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>LATEST RESULT</div>
            {Object.entries(results.scalars).map(function (entry) {
              return <div key={entry[0]} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                borderBottom: '1px solid ' + C.border + '10', fontSize: 11 }}>
                <span style={{ color: C.t0 }}>{entry[0]}</span>
                <span style={{ color: C.t3, fontWeight: 700 }}>{entry[1] != null ? entry[1].toFixed(2) : '--'}</span>
              </div>;
            })}
          </div>
        )}

        {/* Sweep results table */}
        {sweepResults && sweepResults.length > 0 && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>SWEEP RESULTS</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr style={{ background: C.bg1 }}>
                  <th style={{ textAlign: 'left', color: C.amber, padding: '6px 6px', borderBottom: '1px solid ' + C.border, fontWeight: 700 }}>
                    {sweepVar.label} ({sweepVar.unit})</th>
                  <th style={{ textAlign: 'right', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>SPP (psi)</th>
                  <th style={{ textAlign: 'right', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>BHP (psi)</th>
                  <th style={{ textAlign: 'right', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>ECD (ppg)</th>
                  <th style={{ textAlign: 'right', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>BHT (F)</th>
                  <th style={{ textAlign: 'right', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>AnFric (psi)</th>
                </tr></thead>
                <tbody>
                  {sweepResults.map(function (r, i) {
                    var sc = r.scalars || {};
                    return <tr key={i} style={{ borderBottom: '1px solid ' + C.border + '10' }}>
                      <td style={{ color: C.amber, padding: '5px 6px', fontWeight: 700 }}>{r.sweepValue.toFixed(1)}</td>
                      <td style={{ textAlign: 'right', color: C.t3, padding: '5px 6px' }}>{sc.SPP ? sc.SPP.toFixed(0) : '--'}</td>
                      <td style={{ textAlign: 'right', color: C.t3, padding: '5px 6px' }}>{sc.BHP ? sc.BHP.toFixed(0) : '--'}</td>
                      <td style={{ textAlign: 'right', color: C.t3, padding: '5px 6px' }}>{sc.ECD ? sc.ECD.toFixed(3) : '--'}</td>
                      <td style={{ textAlign: 'right', color: C.t3, padding: '5px 6px' }}>{sc.BHT ? sc.BHT.toFixed(1) : '--'}</td>
                      <td style={{ textAlign: 'right', color: C.t3, padding: '5px 6px' }}>{sc.TotalAnFric ? sc.TotalAnFric.toFixed(0) : '--'}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sweep XY charts */}
        {sweepResults && sweepResults.length >= 2 && (
          <SweepChart sweepVar={sweepVar} results={sweepResults} width={600} height={360} />
        )}

        {/* Run history + comparison table */}
        {history.length > 0 && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>RUN HISTORY</div>
            {history.map(function (h) {
              return <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: '1px solid ' + C.border + '10' }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: h.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: h.color, fontWeight: 700 }}>{h.label}</div>
                  <div style={{ fontSize: 8, color: C.t0 }}>{h.paramLabel}</div>
                </div>
                <div style={{ fontSize: 9, color: C.t1 }}>
                  SPP={h.scalars.SPP ? h.scalars.SPP.toFixed(0) : '--'} BHP={h.scalars.BHP ? h.scalars.BHP.toFixed(0) : '--'}
                </div>
              </div>;
            })}
          </div>
        )}

        {history.length >= 2 && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>COMPARISON TABLE</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr style={{ background: C.bg1 }}>
                  <th style={{ textAlign: 'left', color: C.t0, padding: '6px 6px', borderBottom: '1px solid ' + C.border }}>Parameter</th>
                  {history.map(function (h) {
                    return <th key={h.id} style={{ textAlign: 'right', color: h.color, padding: '6px 6px',
                      borderBottom: '1px solid ' + C.border, fontWeight: 700 }}>{h.label}</th>;
                  })}
                  {history.length === 2 && <th style={{ textAlign: 'right', color: C.amber, padding: '6px 6px',
                    borderBottom: '1px solid ' + C.border, fontWeight: 700 }}>Delta</th>}
                </tr></thead>
                <tbody>
                  {[{ key: 'SPP', label: 'SPP (psi)', dec: 0 }, { key: 'BHP', label: 'BHP (psi)', dec: 0 },
                    { key: 'ECD', label: 'ECD (ppg)', dec: 3 }, { key: 'BHT', label: 'BHT (F)', dec: 1 },
                    { key: 'TotalAnFric', label: 'Ann Friction', dec: 1 }, { key: 'BitLoss', label: 'Bit Loss', dec: 0 },
                  ].map(function (m) {
                    return <tr key={m.key}>
                      <td style={{ color: C.t1, padding: '4px 6px', borderBottom: '1px solid ' + C.border + '10' }}>{m.label}</td>
                      {history.map(function (h) {
                        var v = h.scalars ? h.scalars[m.key] : null;
                        return <td key={h.id} style={{ textAlign: 'right', color: h.color, padding: '4px 6px',
                          borderBottom: '1px solid ' + C.border + '10', fontWeight: 600 }}>
                          {v != null ? v.toFixed(m.dec) : '--'}</td>;
                      })}
                      {history.length === 2 && (function () {
                        var v1 = history[0].scalars ? history[0].scalars[m.key] : null;
                        var v2 = history[1].scalars ? history[1].scalars[m.key] : null;
                        if (v1 == null || v2 == null) return <td style={{ textAlign: 'right', color: C.t0, padding: '4px 6px' }}>--</td>;
                        var d = v2 - v1; var sign = d >= 0 ? '+' : '';
                        return <td style={{ textAlign: 'right', color: d >= 0 ? C.green : C.red, padding: '4px 6px',
                          borderBottom: '1px solid ' + C.border + '10', fontWeight: 700 }}>{sign}{d.toFixed(m.dec)}</td>;
                      })()}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
