import { useState, useRef } from 'react';
import { useProjectStore, useSolverStore } from '../state/stores';
import { importExcel } from '../api/client';
import { C } from '../theme';

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

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      setUploadMsg('Please upload an Excel file (.xlsx)');
      return;
    }
    setFileName(file.name);
    setUploading(true);
    setUploadMsg('Uploading and parsing...');

    importExcel(file).then(function (response) {
      setUploading(false);
      if (response.success) {
        // Set the server-side file path for the solver
        setExcelPath(response.file_path);
        // Populate all input forms from parsed data
        loadFromImport(response.data);
        // Update sim params from parsed realtime data
        if (response.data.realtime) {
          setSimParams({
            flowRate: response.data.realtime.Q,
            rpm: response.data.realtime.RPM,
            sbp: response.data.realtime.SBP,
            mudWeight: response.data.realtime.density_ref,
            bitDepth: response.data.realtime.bit_depth,
            inletTemp: response.data.realtime.T_inlet,
          });
        }
        setUploadMsg('Parsed successfully! ' + (response.data.drillstring ? response.data.drillstring.length : 0) + ' DS segments, ' + (response.data.fluids ? response.data.fluids.length : 0) + ' fluids loaded.');
      } else {
        setUploadMsg('Error: ' + (response.error || 'Unknown error'));
      }
    }).catch(function (err) {
      setUploading(false);
      setUploadMsg('Upload failed: ' + err.message);
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    var files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setDragging(false);
  }

  function handleClickUpload() {
    fileRef.current.click();
  }

  function handleFileInput(e) {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  }

  function handleRun() {
    if (!excelPath) {
      alert('Upload an Excel input file first');
      return;
    }
    runSolver();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 16, overflow: 'auto' }}>
      <div>
        {/* File Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClickUpload}
          style={{
            background: dragging ? C.blue + '15' : C.bg2,
            borderRadius: 8,
            border: '2px dashed ' + (dragging ? C.blue : fileName ? C.green : C.border),
            padding: 24,
            marginBottom: 16,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileInput} />
          
          {uploading ? (
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>...</div>
              <div style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>Parsing Excel file...</div>
            </div>
          ) : fileName ? (
            <div>
              <div style={{ fontSize: 24, marginBottom: 8, color: C.green }}>OK</div>
              <div style={{ fontSize: 13, color: C.t3, fontWeight: 700 }}>{fileName}</div>
              <div style={{ fontSize: 10, color: C.t0, marginTop: 4 }}>Click or drop another file to replace</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8, color: C.t0 }}>+</div>
              <div style={{ fontSize: 13, color: C.t2, fontWeight: 600 }}>Drop Excel input file here</div>
              <div style={{ fontSize: 10, color: C.t0, marginTop: 4 }}>or click to browse (.xlsx)</div>
            </div>
          )}
        </div>

        {/* Upload status message */}
        {uploadMsg && (
          <div style={{
            padding: '8px 12px', marginBottom: 12, borderRadius: 6, fontSize: 11,
            background: uploadMsg.includes('Error') || uploadMsg.includes('failed') ? C.red + '18' : C.green + '18',
            border: '1px solid ' + (uploadMsg.includes('Error') || uploadMsg.includes('failed') ? C.red + '40' : C.green + '40'),
            color: uploadMsg.includes('Error') || uploadMsg.includes('failed') ? C.red : C.green,
          }}>
            {uploadMsg}
          </div>
        )}

        {/* Server file path (read-only, set by upload) */}
        {excelPath && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.t0, marginBottom: 4 }}>Server file path</div>
            <div style={{ fontSize: 11, color: C.t2, fontFamily: 'monospace' }}>{excelPath}</div>
          </div>
        )}

        {/* Simulation parameters */}
        <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>PARAMETERS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { l: 'Flow Rate (gpm)', k: 'flowRate' },
              { l: 'RPM', k: 'rpm' },
              { l: 'SBP (psi)', k: 'sbp' },
              { l: 'Bit Depth (ft)', k: 'bitDepth' },
              { l: 'Mud Weight (ppg)', k: 'mudWeight' },
              { l: 'Inlet Temp (F)', k: 'inletTemp' },
            ].map(function (f) {
              return <div key={f.k}>
                <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>{f.l}</div>
                <input value={simParams[f.k]}
                  onChange={function (e) {
                    var obj = {};
                    obj[f.k] = parseFloat(e.target.value) || 0;
                    setSimParams(obj);
                  }}
                  style={{
                    width: '100%', background: C.bgIn, border: '1px solid ' + C.border,
                    borderRadius: 4, padding: '8px 10px', color: C.t3, fontSize: 12, outline: 'none',
                  }} />
              </div>;
            })}
          </div>
        </div>

        {/* Run button */}
        <button onClick={handleRun} disabled={running || !excelPath} style={{
          width: '100%', padding: 14, borderRadius: 8, border: 'none',
          background: running ? '#1e3a5f' : !excelPath ? C.bg3 : C.blue,
          color: !excelPath ? C.t0 : '#fff',
          fontSize: 14, fontWeight: 700, cursor: running || !excelPath ? 'not-allowed' : 'pointer',
        }}>
          {running ? 'RUNNING... ' + progress + '%' : !excelPath ? 'UPLOAD FILE FIRST' : 'RUN SIMULATION'}
        </button>

        {running && <div style={{ marginTop: 8, background: C.bgIn, borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: progress + '%', height: '100%', background: C.blue, borderRadius: 4, transition: 'width 0.2s' }} />
        </div>}

        {error && <div style={{ marginTop: 8, padding: 10, background: C.red + '18', border: '1px solid ' + C.red,
          borderRadius: 6, color: C.red, fontSize: 11 }}>Error: {error}</div>}
      </div>

      {/* Results panel */}
      <div>
        {results && results.success && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.t3, marginBottom: 16 }}>RESULTS</div>
            {Object.entries(results.scalars).map(function (entry) {
              var k = entry[0], v = entry[1];
              return <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid ' + C.border + '10', fontSize: 12 }}>
                <span style={{ color: C.t0 }}>{k}</span>
                <span style={{ color: C.t3, fontWeight: 700 }}>{v != null ? v.toFixed(2) : '--'}</span>
              </div>;
            })}
            <div style={{ marginTop: 12, fontSize: 10, color: C.t0 }}>
              {results.profiles.length} depth nodes computed
            </div>
          </div>
        )}

        {/* Run history with comparison table */}
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

        {/* Comparison table */}
        {history.length >= 2 && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>COMPARISON TABLE</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ background: C.bg1 }}>
                  <th style={{ textAlign: 'left', color: C.t0, padding: '6px 8px', borderBottom: '1px solid ' + C.border }}>Parameter</th>
                  {history.map(function (h) {
                    return <th key={h.id} style={{ textAlign: 'right', color: h.color, padding: '6px 8px',
                      borderBottom: '1px solid ' + C.border, fontWeight: 700 }}>{h.label}</th>;
                  })}
                  {history.length === 2 && <th style={{ textAlign: 'right', color: C.amber, padding: '6px 8px',
                    borderBottom: '1px solid ' + C.border, fontWeight: 700 }}>Delta</th>}
                </tr></thead>
                <tbody>
                  {[
                    { key: 'SPP', label: 'SPP (psi)', dec: 0 },
                    { key: 'BHP', label: 'BHP (psi)', dec: 0 },
                    { key: 'ECD', label: 'ECD (ppg)', dec: 3 },
                    { key: 'BHT', label: 'BHT (F)', dec: 1 },
                    { key: 'TotalAnFric', label: 'Ann Friction (psi)', dec: 1 },
                    { key: 'TotalDSFric', label: 'DS Friction (psi)', dec: 1 },
                    { key: 'BitLoss', label: 'Bit Loss (psi)', dec: 0 },
                  ].map(function (m) {
                    return <tr key={m.key}>
                      <td style={{ color: C.t1, padding: '5px 8px', borderBottom: '1px solid ' + C.border + '10' }}>{m.label}</td>
                      {history.map(function (h) {
                        var v = h.scalars ? h.scalars[m.key] : null;
                        return <td key={h.id} style={{ textAlign: 'right', color: h.color, padding: '5px 8px',
                          borderBottom: '1px solid ' + C.border + '10', fontWeight: 600 }}>
                          {v != null ? v.toFixed(m.dec) : '--'}</td>;
                      })}
                      {history.length === 2 && (function () {
                        var v1 = history[0].scalars ? history[0].scalars[m.key] : null;
                        var v2 = history[1].scalars ? history[1].scalars[m.key] : null;
                        if (v1 == null || v2 == null) return <td style={{ textAlign: 'right', color: C.t0, padding: '5px 8px' }}>--</td>;
                        var d = v2 - v1;
                        var sign = d >= 0 ? '+' : '';
                        return <td style={{ textAlign: 'right', color: d >= 0 ? C.green : C.red, padding: '5px 8px',
                          borderBottom: '1px solid ' + C.border + '10', fontWeight: 700 }}>
                          {sign}{d.toFixed(m.dec)}</td>;
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
