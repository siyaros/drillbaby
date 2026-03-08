import { useState, useEffect, useRef } from 'react';
import { useSolverStore, useProjectStore } from '../state/stores';
import DepthTrack from '../components/charts/DepthTrack';
import TimeTrack from '../components/charts/TimeTrack';
import { C } from '../theme';

// Well schematic column
function WellColumn({ profiles, height, hdr }) {
  if (!profiles || !profiles.length) {
    return (
      <div style={{ width: 56, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
        <div style={{ height: hdr, padding: '4px', borderBottom: '1px solid ' + C.border,
          fontSize: 9, color: C.t0, textAlign: 'center' }}>Well</div>
        <div style={{ height: height }} />
      </div>
    );
  }
  var W = 56, H = height;
  var pad = { t: 0, b: 16 };
  var h = H - pad.t - pad.b;
  var dMin = profiles[0].MD;
  var dMax = profiles[profiles.length - 1].MD;
  var cx = W / 2;
  function toY(d) { return pad.t + ((d - dMin) / (dMax - dMin || 1)) * h; }
  var shoes = [];
  var lastHID = -1;
  profiles.forEach(function (p) {
    if (p.HID !== lastHID && lastHID > 0) shoes.push({ md: p.MD });
    lastHID = p.HID;
  });
  return (
    <div style={{ width: W, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      <div style={{ height: hdr, padding: '2px 4px', borderBottom: '1px solid ' + C.border, textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: C.t2, fontWeight: 700 }}>F/M</div>
        <div style={{ fontSize: 13, color: C.t3, fontWeight: 800, marginTop: 2 }}>{dMax ? dMax.toFixed(0) : '?'}</div>
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <rect x={3} y={pad.t} width={W - 6} height={h} fill="#0d1015" rx="1" />
        <rect x={cx - 10} y={pad.t} width={1.5} height={h * 0.9} fill="#556" />
        <rect x={cx + 9} y={pad.t} width={1.5} height={h * 0.9} fill="#556" />
        {shoes.map(function (s, i) {
          return <rect key={i} x={cx - 12} y={toY(s.md) - 1} width={24} height={2} fill="#778" rx="0.5" />;
        })}
        <rect x={cx - 2} y={pad.t} width={4} height={h * 0.95} fill="#7a8899" opacity="0.3" rx="0.5" />
        <rect x={cx - 6} y={toY(dMax) - 5} width={12} height={5}
          fill={C.amber} opacity="0.6" rx="1" stroke={C.amber} strokeWidth="0.5" />
        <line x1={3} x2={W - 3} y1={toY(dMax)} y2={toY(dMax)}
          stroke={C.amber} strokeWidth="0.5" strokeDasharray="2 2" />
        {[0, 0.25, 0.5, 0.75, 1].map(function (f, i) {
          var d = dMin + (dMax - dMin) * f;
          return <text key={i} x={cx} y={toY(d) + 3} fill={C.t0} fontSize="6" textAnchor="middle">{Math.round(d)}</text>;
        })}
      </svg>
    </div>
  );
}

function autoRange(arrays, padPct) {
  var all = [];
  arrays.forEach(function (a) {
    a.forEach(function (v) { if (v > 0 && isFinite(v)) all.push(v); });
  });
  if (!all.length) return [0, 1];
  var mn = Math.min.apply(null, all);
  var mx = Math.max.apply(null, all);
  var r = mx - mn || 1;
  var p = padPct || 0.05;
  return [Math.floor((mn - r * p) * 100) / 100, Math.ceil((mx + r * p) * 100) / 100];
}

function lastVal(arr) {
  return (arr && arr.length) ? arr[arr.length - 1] : null;
}

// Track config panel — shows hidden tracks with + to re-add
function TrackConfigBar({ allTracks, visible, onToggle }) {
  var hidden = allTracks.filter(function (t) { return !visible[t.id]; });
  if (hidden.length === 0) return null;
  return (
    <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 4, padding: '4px 8px', background: C.bg1,
      border: '1px solid ' + C.border, borderRadius: 6, zIndex: 10 }}>
      <span style={{ fontSize: 9, color: C.t0, marginRight: 4, alignSelf: 'center' }}>Add:</span>
      {hidden.map(function (t) {
        return <button key={t.id} onClick={function () { onToggle(t.id); }} style={{
          padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
          background: C.bg2, border: '1px solid ' + C.border, color: C.t1, cursor: 'pointer',
        }}>+ {t.label}</button>;
      })}
    </div>
  );
}

export default function Dashboard() {
  var results = useSolverStore(function (s) { return s.results; });
  var profiles = results ? results.profiles : [];
  var scalars = results ? results.scalars : {};
  var simParams = useProjectStore(function (s) { return s.simParams; });
  var formations = useProjectStore(function (s) { return s.formations; });

  // Track visibility state
  var stVis = useState({
    gradient: true, pressure: true, temperature: true,
    flow: true, density: true, sbp: true, spp: true,
  });
  var trackVis = stVis[0], setTrackVis = stVis[1];

  function toggleTrack(id) {
    setTrackVis(function (v) {
      var nv = {};
      Object.keys(v).forEach(function (k) { nv[k] = v[k]; });
      nv[id] = !nv[id];
      return nv;
    });
  }

  // All track definitions for the config bar
  var allTracks = [
    { id: 'gradient', label: 'Gradient', side: 'depth' },
    { id: 'pressure', label: 'Pressure', side: 'depth' },
    { id: 'temperature', label: 'Temperature', side: 'depth' },
    { id: 'flow', label: 'Flow', side: 'time' },
    { id: 'density', label: 'Density', side: 'time' },
    { id: 'sbp', label: 'SBP', side: 'time' },
    { id: 'spp', label: 'SPP', side: 'time' },
  ];

  // Responsive container
  var containerRef = useRef(null);
  var stSize = useState({ w: 1200, h: 600 });
  var size = stSize[0], setSize = stSize[1];
  useEffect(function () {
    function measure() {
      if (containerRef.current) {
        var rect = containerRef.current.getBoundingClientRect();
        setSize({ w: rect.width, h: rect.height });
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return function () { window.removeEventListener('resize', measure); };
  }, []);

  var hdr = 58;
  var closeBarH = 16;
  var trackH = Math.max(200, size.h - hdr - closeBarH - 4);
  var wellW = 56;

  // Count visible tracks and distribute width
  var visDepth = ['gradient', 'pressure', 'temperature'].filter(function (id) { return trackVis[id]; }).length;
  var visTime = ['flow', 'density', 'sbp', 'spp'].filter(function (id) { return trackVis[id]; }).length;
  var totalVis = visDepth + visTime;
  var availW = size.w - wellW;
  var depthShare = totalVis > 0 ? visDepth / totalVis : 0.5;
  var depthW = visDepth > 0 ? Math.floor((availW * Math.max(depthShare, 0.3)) / visDepth) : 0;
  var timeW = visTime > 0 ? Math.floor((availW * Math.max(1 - depthShare, 0.2)) / visTime) : 0;

  var depths = profiles.map(function (p) { return p.MD; });

  // === Depth data ===
  var ecdData = profiles.map(function (p) { return p.TVD > 0 ? p.Pa / (0.052 * p.TVD) : 0; });
  var mwData = profiles.map(function (p) { return p.rhoa || 0; });
  var ppgData = profiles.map(function (p) {
    var ppg = 8.5;
    formations.forEach(function (f) { if (p.MD >= (Number(f.md) || 0)) ppg = Number(f.ppg) || 8.5; });
    return ppg;
  });
  var fpgData = profiles.map(function (p) {
    var fpg = 16;
    formations.forEach(function (f) { if (p.MD >= (Number(f.md) || 0)) fpg = Number(f.fpg) || 16; });
    return fpg;
  });
  var paData = profiles.map(function (p) { return p.Pa || 0; });
  var porePresData = profiles.map(function (p, i) { return 0.052 * ppgData[i] * (p.TVD || 0); });
  var fracPresData = profiles.map(function (p, i) { return 0.052 * fpgData[i] * (p.TVD || 0); });
  var taData = profiles.map(function (p) { return p.Ta || 0; });
  var tpData = profiles.map(function (p) { return p.Tp || 0; });
  var tfData = profiles.map(function (p) { return p.Tf || 0; });

  var gradRange = profiles.length ? autoRange([ecdData, mwData, ppgData, fpgData], 0.1) : [8, 18];
  var presRange = profiles.length ? autoRange([paData, porePresData, fracPresData], 0.05) : [0, 10000];
  var tempRange = profiles.length ? autoRange([taData, tpData, tfData], 0.05) : [70, 300];

  var flowIn = simParams.flowRate || 0;
  var flowOut = flowIn;
  var sbp = simParams.sbp || 0;
  var spp = scalars.SPP || 0;

  // Close button — small bar above each track
  function TrackWrapper(props) {
    return (
      <div style={{ width: props.trackWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: closeBarH, background: C.bg1, borderBottom: '1px solid ' + C.border,
          borderRight: '1px solid ' + C.border, display: 'flex', alignItems: 'center',
          justifyContent: 'center' }}>
          <button onClick={function () { toggleTrack(props.trackId); }}
            style={{ background: 'transparent', border: 'none', color: C.t0, fontSize: 9,
              cursor: 'pointer', padding: '0 6px', lineHeight: 1 }}
            onMouseEnter={function (e) { e.target.style.color = C.red; }}
            onMouseLeave={function (e) { e.target.style.color = C.t0; }}
            title={'Remove ' + props.trackId}>x</button>
        </div>
        {props.children}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bg, position: 'relative' }}>
      <div style={{ display: 'flex', width: '100%', overflow: 'hidden' }}>

        {/* === DEPTH TRACKS === */}

        {trackVis.gradient && (
          <TrackWrapper trackWidth={depthW} trackId="gradient">
            <DepthTrack
              title="Gradient" unit="ppg" width={depthW} height={trackH} hdr={hdr}
              depths={depths} xMin={gradRange[0]} xMax={gradRange[1]}
              showDepthAxis={true}
              fillBetween={profiles.length ? [2, 0] : null}
              traces={profiles.length ? [
                { label: 'FPG', color: C.green, data: fpgData },
                { label: 'PPG', color: C.red, data: ppgData },
                { label: 'ECD', color: C.blue, data: ecdData },
                { label: 'MW', color: C.cyan, data: mwData, dash: true },
              ] : []}
              currentValues={[
                { label: 'FPG', value: lastVal(fpgData) ? lastVal(fpgData).toFixed(2) : '---', color: C.green },
                { label: 'PPG', value: lastVal(ppgData) ? lastVal(ppgData).toFixed(2) : '---', color: C.red },
                { label: 'ECD', value: lastVal(ecdData) ? lastVal(ecdData).toFixed(2) : '---', color: C.blue },
              ]}
            />
          </TrackWrapper>
        )}

        {trackVis.pressure && (
          <TrackWrapper trackWidth={depthW} trackId="pressure">
            <DepthTrack
              title="Pressure" unit="psi" width={depthW} height={trackH} hdr={hdr}
              depths={depths} xMin={presRange[0]} xMax={presRange[1]}
              fillBetween={profiles.length ? [2, 0] : null}
              traces={profiles.length ? [
                { label: 'Frac P', color: C.green, data: fracPresData },
                { label: 'Pore P', color: C.red, data: porePresData },
                { label: 'Ann P', color: C.blue, data: paData },
              ] : []}
              currentValues={[
                { label: 'Frac P', value: lastVal(fracPresData) ? lastVal(fracPresData).toFixed(0) : '---', color: C.green },
                { label: 'Pore P', value: lastVal(porePresData) ? lastVal(porePresData).toFixed(0) : '---', color: C.red },
                { label: 'Ann P', value: lastVal(paData) ? lastVal(paData).toFixed(0) : '---', color: C.blue },
              ]}
            />
          </TrackWrapper>
        )}

        {trackVis.temperature && (
          <TrackWrapper trackWidth={depthW} trackId="temperature">
            <DepthTrack
              title="Temperature" unit="F" width={depthW} height={trackH} hdr={hdr}
              depths={depths} xMin={tempRange[0]} xMax={tempRange[1]}
              traces={profiles.length ? [
                { label: 'Ann T', color: C.red, data: taData },
                { label: 'Pipe T', color: C.amber, data: tpData },
                { label: 'Form T', color: C.t0, data: tfData, dash: true },
              ] : []}
              currentValues={[
                { label: 'Ann T', value: lastVal(taData) ? lastVal(taData).toFixed(0) : '---', color: C.red },
                { label: 'Form T', value: lastVal(tfData) ? lastVal(tfData).toFixed(0) : '---', color: C.t0 },
              ]}
            />
          </TrackWrapper>
        )}

        {/* === WELL SCHEMATIC === */}
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ height: closeBarH, background: C.bg1, borderBottom: '1px solid ' + C.border,
            borderRight: '1px solid ' + C.border }} />
          <WellColumn profiles={profiles} height={trackH} hdr={hdr} />
        </div>

        {/* === TIME TRACKS === */}

        {trackVis.flow && (
          <TrackWrapper trackWidth={timeW} trackId="flow">
            <TimeTrack width={timeW} height={trackH} hdr={hdr}
              min={0} max={Math.max(1000, flowIn * 1.5)}
              traces={[
                { id: 'flowOut', label: 'Flow Out', color: C.red, unit: 'gpm', value: flowOut },
                { id: 'flowIn', label: 'Flow In', color: C.blue, unit: 'gpm', value: flowIn },
              ]}
            />
          </TrackWrapper>
        )}

        {trackVis.density && (
          <TrackWrapper trackWidth={timeW} trackId="density">
            <TimeTrack width={timeW} height={trackH} hdr={hdr}
              min={gradRange[0]} max={gradRange[1]}
              traces={[
                { id: 'densOut', label: 'Density Out', color: C.red, unit: 'ppg', value: scalars.ECD || null },
                { id: 'densIn', label: 'Density In', color: C.blue, unit: 'ppg', value: simParams.mudWeight },
              ]}
            />
          </TrackWrapper>
        )}

        {trackVis.sbp && (
          <TrackWrapper trackWidth={timeW} trackId="sbp">
            <TimeTrack width={timeW} height={trackH} hdr={hdr}
              min={0} max={Math.max(200, sbp * 3 || 200)}
              traces={[
                { id: 'sbpSP', label: 'SBP SP', color: C.amber, unit: 'psi', value: null, dash: true },
                { id: 'highLim', label: 'High Limit', color: C.red, unit: 'psi', value: null, dash: true },
                { id: 'sbp', label: 'SBP', color: C.green, unit: 'psi', value: sbp },
              ]}
            />
          </TrackWrapper>
        )}

        {trackVis.spp && (
          <TrackWrapper trackWidth={timeW} trackId="spp">
            <TimeTrack width={timeW} height={trackH} hdr={hdr}
              min={0} max={Math.ceil((spp || 5000) * 1.3)}
              traces={[
                { id: 'sppSP', label: 'SPP SP', color: C.amber, unit: 'psi', value: null, dash: true },
                { id: 'spp', label: 'SPP', color: C.blue, unit: 'psi', value: spp },
              ]}
            />
          </TrackWrapper>
        )}

      </div>

      {/* Add-back bar at bottom */}
      <TrackConfigBar allTracks={allTracks} visible={trackVis} onToggle={toggleTrack} />
    </div>
  );
}
