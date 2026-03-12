import { useState, useEffect } from 'react';
import { C } from './theme';
import { useProjectStore, useSolverStore } from './state/stores';
import { healthCheck } from './api/client';
import { KPI, AlarmBadge } from './components/shared/index.jsx';
import Dashboard from './pages/Dashboard';
import SimulationPage from './pages/SimulationPage';
import SimulatePage from './pages/SimulatePage';
import ControlPage from './pages/ControlPage';
import { WellDataPage, SurfaceEquipPage, FluidPage, DrillstringPage, SettingsPage } from './pages/DataPages';

var PAGES = [
  { id: 'dash', label: 'Dashboard', icon: 'D' },
  { id: 'well', label: 'Well Data', icon: 'W' },
  { id: 'surface', label: 'Surface Equip', icon: 'S' },
  { id: 'fluid', label: 'Fluids', icon: 'F' },
  { id: 'string', label: 'Drill String', icon: 'P' },
  { id: 'sim', label: 'Simulation', icon: 'R' },
  { id: 'settings', label: 'Settings', icon: 'G' },
];

function fmt(v, dec) {
  if (v == null) return '--';
  if (dec === 0) return Math.round(v).toLocaleString();
  return v.toFixed(dec != null ? dec : 2);
}

export default function App() {
  var stPage = useState('dash');
  var page = stPage[0], setPage = stPage[1];
  var stMode = useState('Plan');
  var mode = stMode[0], setMode = stMode[1];
  var stConn = useState('checking');
  var connected = stConn[0], setConnected = stConn[1];

  var results = useSolverStore(function (s) { return s.results; });
  var status = useSolverStore(function (s) { return s.status; });
  var runSolver = useSolverStore(function (s) { return s.run; });
  var dirty = useProjectStore(function (s) { return s.dirty; });
  var excelPath = useProjectStore(function (s) { return s.excelPath; });
  var sc = results && results.success ? results.scalars : {};
  var running = status === 'running';

  // Check API connection on mount
  useEffect(function () {
    healthCheck()
      .then(function () { setConnected('ok'); })
      .catch(function () { setConnected('error'); });
  }, []);

  function renderPage() {
    if (page === 'dash' && mode === 'Simulate') return <SimulatePage />;
    if (page === 'dash' && mode === 'Control') return <ControlPage />;
    switch (page) {
      case 'dash': return <Dashboard />;
      case 'well': return <WellDataPage />;
      case 'surface': return <SurfaceEquipPage />;
      case 'fluid': return <FluidPage />;
      case 'string': return <DrillstringPage />;
      case 'sim': return <SimulationPage />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  }

  var modes = ['Monitor', 'Plan', 'Simulate', 'Replay', 'Control'];
  var isDash = page === 'dash';
  var pageLabel = '';
  PAGES.forEach(function (p) { if (p.id === page) pageLabel = p.label; });

  var stNav = useState(false);
  var navOpen = stNav[0], setNavOpen = stNav[1];
  var navW = navOpen ? 180 : 52;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'monospace', color: C.t1 }}>
      {/* NAV SIDEBAR */}
      <div style={{
        width: navW, background: C.bg1, borderRight: '1px solid ' + C.border,
        display: 'flex', flexDirection: 'column', paddingTop: 12, gap: 2, flexShrink: 0,
        transition: 'width 0.2s ease', overflow: 'hidden',
      }}>
        {/* Logo + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 12, cursor: 'pointer' }}
          onClick={function () { setNavOpen(!navOpen); }}>
          <img src="/logo.png" alt="NextEnergie" style={{
            width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
          }} />
          {navOpen && <div style={{ whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.t3 }}>DrillBaby</div>
            <div style={{ fontSize: 8, color: C.t0 }}>by NextEnergie</div>
          </div>}
        </div>

        {/* Nav items */}
        {PAGES.map(function (p) {
          var isActive = page === p.id;
          return <button key={p.id} onClick={function () { setPage(p.id); }} title={p.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: navOpen ? navW - 16 : 38, height: 38, borderRadius: 6,
            margin: navOpen ? '0 8px' : '0 auto',
            padding: navOpen ? '0 10px' : 0,
            justifyContent: navOpen ? 'flex-start' : 'center',
            background: isActive ? C.blue + '18' : 'transparent',
            border: isActive ? '1px solid ' + C.blue + '30' : '1px solid transparent',
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? C.blue : C.t0, flexShrink: 0, width: 18, textAlign: 'center' }}>{p.icon}</span>
            {navOpen && <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? C.blue : C.t0 }}>{p.label}</span>}
          </button>;
        })}

        <div style={{ flex: 1 }} />
        <div style={{ padding: '8px 0 12px', fontSize: 8, color: C.t0, textAlign: 'center', lineHeight: 1.6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3, margin: '0 auto 4px',
            background: connected === 'ok' ? C.green : connected === 'error' ? C.red : C.amber,
          }} />
          {navOpen ? 'API ' + (connected === 'ok' ? 'Connected' : 'Offline') : 'v0.1'}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* TOP BAR */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid ' + C.border, background: C.bg1, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.t3 }}>DrillBaby</div>
              <div style={{ fontSize: 9, color: C.t0 }}>Autonomous MPD Platform</div>
            </div>
            <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 6, padding: 2, border: '1px solid ' + C.border }}>
              {modes.map(function (m) {
                return <button key={m} onClick={function () { setMode(m); }} style={{
                  padding: '5px 12px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: mode === m ? C.blue : 'transparent', border: 'none', cursor: 'pointer',
                  color: mode === m ? '#fff' : C.t0,
                }}>{m}</button>;
              })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlarmBadge text={connected === 'ok' ? 'API Connected' : 'API Disconnected'} level={connected === 'ok' ? 'ok' : 'crit'} />
            {dirty && <AlarmBadge text="Inputs Modified" level="warn" />}
            {status === 'complete' && !dirty && <AlarmBadge text="Results Current" level="ok" />}
            {status === 'running' && <AlarmBadge text="Running..." level="warn" />}
            {excelPath && (
              <button onClick={function () { if (!running) runSolver(); }} disabled={running} style={{
                padding: '6px 16px', borderRadius: 5, border: 'none', cursor: running ? 'wait' : 'pointer',
                background: dirty ? C.amber : C.blue, color: '#fff', fontSize: 11, fontWeight: 700,
                animation: dirty ? 'none' : 'none',
              }}>{running ? 'Running...' : dirty ? 'Re-run' : 'Run'}</button>
            )}
          </div>
        </div>

        {/* KPI BAR — hide in Simulate mode (SimulatePage has its own) */}
        {mode !== 'Simulate' && <div style={{
          display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid ' + C.border,
          background: C.bg1, overflowX: 'auto', flexShrink: 0,
        }}>
          <KPI label="SPP" value={fmt(sc.SPP, 0)} unit="psi" color={C.cyan} min={0} max={20000} />
          <KPI label="BHP" value={fmt(sc.BHP, 0)} unit="psi" color={C.blue} min={0} max={10000} />
          <KPI label="ECD" value={fmt(sc.ECD, 2)} unit="ppg" color={C.green} min={8} max={18} />
          <KPI label="Bit Loss" value={fmt(sc.BitLoss, 0)} unit="psi" color={C.amber} min={0} max={20000} />
          <KPI label="DS Friction" value={fmt(sc.TotalDSFric, 0)} unit="psi" color={C.purple} min={0} max={20000} />
          <KPI label="An Friction" value={fmt(sc.TotalAnFric, 0)} unit="psi" color={C.pink} min={0} max={1000} />
          <KPI label="BHT" value={fmt(sc.BHT, 0)} unit="F" color={C.orange} min={70} max={350} />
        </div>}

        {/* PAGE HEADER (non-dashboard) */}
        {!isDash && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid ' + C.border,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.t3 }}>{pageLabel}</div>
            <button onClick={function () { setPage('sim'); }} style={{
              padding: '8px 16px', background: C.blue, border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>Go to Simulation</button>
          </div>
        )}

        {/* PAGE BODY */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
