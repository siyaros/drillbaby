import { create } from 'zustand';
import { runSolver, importExcel } from '../api/client';

var RUN_COLORS = ['#4a9eff', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

export const useProjectStore = create((set, get) => ({
  projectName: 'New Project',
  wellName: '',
  dirty: false,

  wellpath: [{ md: 0, inc: 0, azi: 0 }, { md: 10000, inc: 0, azi: 0 }],
  casings: [{ type: 'Surface', od: 13.375, id: 12.415, sd: 5000, hd: 0 }],
  hole: [{ md: 10000, dia: 8.5, ff: 0.25 }],
  drillstring: [
    { desc: '5" DP', od: 5, id: 4, len: 9999, wt: 19.5 },
    { desc: 'Bit', od: 7.5, id: 4, len: 1, wt: 23 },
  ],
  fluids: [{ base: 'WBM', mw: 8.35, ty: 0, n: 1, K: 0.0501, pvt: false, kth: 0.347, cp: 1.0 }],
  formations: [{ name: 'Default', md: 10000, ppg: 8.5, fpg: 16, kth: 0.98, cp: 0.22 }],
  temperature: [{ tvd: 0, temp: 70 }, { tvd: 10000, temp: 70 }],
  seInlet: [{ type: 'SP', len: 10, id: 4 }, { type: 'Hose', len: 10, id: 3 },
            { type: 'Swivel', len: 5, id: 2.5 }, { type: 'Kelly', len: 10, id: 3.25 }],
  seOutlet: [{ type: 'Segment1', len: 0, id: 3 }],

  simParams: {
    flowRate: 500, rpm: 0, sbp: 1, mudWeight: 8.35,
    bitDepth: 10000, inletTemp: 90, mudIndex: 1,
  },

  excelPath: '',

  setWellpath: (data) => set({ wellpath: data, dirty: true }),
  setCasings: (data) => set({ casings: data, dirty: true }),
  setHole: (data) => set({ hole: data, dirty: true }),
  setDrillstring: (data) => set({ drillstring: data, dirty: true }),
  setFluids: (data) => set({ fluids: data, dirty: true }),
  setFormations: (data) => set({ formations: data, dirty: true }),
  setTemperature: (data) => set({ temperature: data, dirty: true }),
  setSeInlet: (data) => set({ seInlet: data, dirty: true }),
  setSeOutlet: (data) => set({ seOutlet: data, dirty: true }),
  setSimParams: (params) => set((s) => ({ simParams: { ...s.simParams, ...params }, dirty: true })),
  setExcelPath: (path) => set({ excelPath: path }),
  clearDirty: () => set({ dirty: false }),

  loadFromImport: (data) => {
    const updates = { dirty: false };
    if (data.wellpath) {
      updates.wellpath = data.wellpath.md.map((md, i) => ({
        md, inc: data.wellpath.inclination[i] || 0, azi: 0,
      }));
    }
    if (data.casings) {
      updates.casings = data.casings.od.map((od, i) => ({
        type: 'Casing', od, id: data.casings.hid[i], sd: data.casings.sd[i], hd: data.casings.hd[i] || 0,
      }));
    }
    if (data.hole) {
      updates.hole = data.hole.md.map((md, i) => ({
        md, dia: data.hole.diameter[i], ff: 0.25,
      }));
    }
    if (data.drillstring) {
      updates.drillstring = data.drillstring.map((s) => ({
        desc: s.description, od: s.od, id: s.id, len: s.total_length, wt: 0,
        nozzles: s.num_nozzles || 0, nozzleSize: s.nozzle_size || 0,
      }));
    }
    if (data.fluids) {
      updates.fluids = data.fluids.map((f) => ({
        base: f.base, mw: 0, ty: f.tau_y, n: f.n, K: f.K,
        pvt: f.pvt_enabled, kth: f.k_thermal, cp: f.cp,
      }));
    }
    if (data.formations) {
      updates.formations = data.formations.md.map((md, i) => ({
        name: 'Fm ' + (i + 1), md, ppg: data.formations.ppg[i], fpg: data.formations.fpg[i],
        kth: 0.98, cp: 0.22,
      }));
    }
    if (data.temperature) {
      updates.temperature = data.temperature.tvd.map((tvd, i) => ({
        tvd, temp: data.temperature.temp[i],
      }));
    }
    if (data.realtime) {
      updates.simParams = {
        ...get().simParams,
        flowRate: data.realtime.Q,
        rpm: data.realtime.RPM,
        sbp: data.realtime.SBP,
        mudWeight: data.realtime.density_ref,
        bitDepth: data.realtime.bit_depth,
        inletTemp: data.realtime.T_inlet,
        mudIndex: data.realtime.mud_index,
      };
    }
    set(updates);
  },
}));


export const useSolverStore = create((set, get) => ({
  status: 'idle',
  progress: 0,
  results: null,
  history: [],       // [{id, label, color, params, scalars, profiles, timestamp}]
  runCounter: 0,
  error: null,

  // Comparison state
  compareOn: false,
  selectedRuns: [],   // array of run IDs to overlay

  setCompareOn: (on) => set({ compareOn: on }),

  toggleRunSelection: (runId) => set((s) => {
    const idx = s.selectedRuns.indexOf(runId);
    if (idx >= 0) {
      return { selectedRuns: s.selectedRuns.filter((id) => id !== runId) };
    }
    if (s.selectedRuns.length >= 4) return {};
    return { selectedRuns: [...s.selectedRuns, runId] };
  }),

  renameRun: (runId, newLabel) => set((s) => ({
    history: s.history.map((h) => h.id === runId ? { ...h, label: newLabel } : h),
  })),

  deleteRun: (runId) => set((s) => ({
    history: s.history.filter((h) => h.id !== runId),
    selectedRuns: s.selectedRuns.filter((id) => id !== runId),
  })),

  run: async () => {
    set({ status: 'running', progress: 10, error: null });
    try {
      const project = useProjectStore.getState();
      const params = {
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

      set({ progress: 30 });
      const response = await runSolver(params);
      set({ progress: 90 });

      if (response.success) {
        useProjectStore.getState().clearDirty();
        const newId = get().runCounter + 1;
        const paramLabel = 'Q=' + project.simParams.flowRate +
          ', MW=' + project.simParams.mudWeight +
          ', RPM=' + project.simParams.rpm;
        const runEntry = {
          ...response,
          id: newId,
          label: 'Run ' + newId,
          color: RUN_COLORS[(newId - 1) % RUN_COLORS.length],
          paramLabel: paramLabel,
          params: { ...project.simParams },
          timestamp: new Date().toISOString(),
        };

        set((s) => ({
          status: 'complete',
          progress: 100,
          results: response,
          runCounter: newId,
          history: [...s.history, runEntry],
          selectedRuns: [...s.selectedRuns.filter((id) =>
            s.history.some((h) => h.id === id)
          ), newId].slice(-4),
        }));
      } else {
        set({ status: 'error', error: response.error, progress: 0 });
      }
    } catch (err) {
      set({ status: 'error', error: err.message, progress: 0 });
    }
  },

  clear: () => set({ status: 'idle', results: null, progress: 0, error: null }),
}));


// ── Simulate Store: persistent across page navigation ─────────────

var MAX_SIM_HISTORY = 300;
var _ws = null;  // WebSocket lives outside React

export const useSimulateStore = create((set, get) => ({
  connected: false,
  running: false,
  step: 0,
  cycleTime: 0,
  error: null,
  gaugeMode: true,
  history: [],        // [{step, time, SPP, BHP, ECD, BHT, AnFric, flow_rate, sbp, rpm}]
  liveParams: {
    flow_rate: 500, rpm: 0, sbp: 1, mud_weight: 8.35, inlet_temp: 90,
  },
  chartVis: { SPP: true, BHP: true, ECD: true, BHT: true, flow_rate: true, sbp: true, rpm: false, AnFric: false },

  setGaugeMode: (v) => set({ gaugeMode: v }),
  toggleChart: (key) => set((s) => {
    var nv = { ...s.chartVis }; nv[key] = !nv[key]; return { chartVis: nv };
  }),

  // Initialize live params from project
  initParams: () => {
    var sp = useProjectStore.getState().simParams;
    set({ liveParams: {
      flow_rate: sp.flowRate || 500, rpm: sp.rpm || 0, sbp: sp.sbp || 1,
      mud_weight: sp.mudWeight || 8.35, inlet_temp: sp.inletTemp || 90,
    }});
  },

  updateParam: (key, value) => {
    var num = parseFloat(value); if (isNaN(num)) return;
    set((s) => ({ liveParams: { ...s.liveParams, [key]: num } }));
    // Send to server
    if (_ws && _ws.readyState === 1) {
      var msg = { cmd: 'update' }; msg[key] = num;
      _ws.send(JSON.stringify(msg));
    }
  },

  connect: () => {
    if (_ws && _ws.readyState <= 1) return; // already open or connecting
    var excelPath = useProjectStore.getState().excelPath;
    if (!excelPath) { set({ error: 'No Excel file loaded' }); return; }

    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsUrl = protocol + '//' + window.location.host + '/ws/simulate';
    var ws = new WebSocket(wsUrl);

    ws.onopen = function () {
      set({ connected: true, error: null });
      var lp = get().liveParams;
      ws.send(JSON.stringify({
        cmd: 'init', excel_path: excelPath,
        flow_rate: lp.flow_rate, rpm: lp.rpm, sbp: lp.sbp,
        mud_weight: lp.mud_weight, inlet_temp: lp.inlet_temp,
      }));
    };

    ws.onmessage = function (e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'result') {
        set((s) => {
          var nh = s.history.concat([{
            step: msg.step, time: msg.time,
            SPP: msg.scalars.SPP, BHP: msg.scalars.BHP, ECD: msg.scalars.ECD,
            BHT: msg.scalars.BHT, AnFric: msg.scalars.TotalAnFric,
            flow_rate: msg.params.flow_rate, sbp: msg.params.sbp, rpm: msg.params.rpm,
          }]);
          if (nh.length > MAX_SIM_HISTORY) nh = nh.slice(nh.length - MAX_SIM_HISTORY);
          return { step: msg.step, cycleTime: msg.cycle_time, history: nh };
        });
      } else if (msg.type === 'status') {
        if (msg.running != null) set({ running: msg.running });
      } else if (msg.type === 'error') {
        set({ error: msg.message });
      }
    };

    ws.onclose = function () { set({ connected: false, running: false }); _ws = null; };
    ws.onerror = function () { set({ error: 'WebSocket failed', connected: false }); };
    _ws = ws;
  },

  start: () => {
    var state = get();
    if (!state.connected) {
      get().connect();
      setTimeout(function () {
        if (_ws && _ws.readyState === 1) _ws.send(JSON.stringify({ cmd: 'start', interval: 1.0 }));
      }, 800);
    } else if (_ws && _ws.readyState === 1) {
      _ws.send(JSON.stringify({ cmd: 'start', interval: 1.0 }));
    }
    set({ running: true });
  },

  pause: () => {
    if (_ws && _ws.readyState === 1) _ws.send(JSON.stringify({ cmd: 'pause' }));
    set({ running: false });
  },

  stop: () => {
    if (_ws && _ws.readyState === 1) _ws.send(JSON.stringify({ cmd: 'stop' }));
    set({ running: false, step: 0, history: [] });
  },

  disconnect: () => {
    if (_ws) { _ws.close(); _ws = null; }
    set({ connected: false, running: false });
  },
}));

