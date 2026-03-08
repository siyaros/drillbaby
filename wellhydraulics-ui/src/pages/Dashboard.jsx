import { useState, useEffect, useRef } from 'react';
import { useSolverStore, useProjectStore } from '../state/stores';
import DepthTrack from '../components/charts/DepthTrack';
import TimeTrack from '../components/charts/TimeTrack';
import { C } from '../theme';

var FLUID_COLORS = {
  WBM: { fill: "#2266cc", op: 0.3 },
  OBM: { fill: "#8B5E3C", op: 0.35 },
  SBM: { fill: "#C4A830", op: 0.3 },
};
var FM_COLORS = ["#4a4a3a","#3a4a4a","#5a5540","#404a55","#3a4a4a","#4a3a4a","#3a5a4a"];

// Full well schematic column
function WellColumn({ profiles, scalars, height, hdr, formations, fluids, casingsData, holeData, dsData, simParams }) {
  var W = 140;
  if (!profiles || !profiles.length) {
    return (
      <div style={{ width: W, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
        <div style={{ height: hdr, padding: '4px', borderBottom: '1px solid ' + C.border, fontSize: 9, color: C.t0, textAlign: 'center' }}>Well</div>
        <div style={{ height: height }} />
      </div>
    );
  }

  var H = height;
  var pad = { t: 0, b: 16 };
  var h = H - pad.t - pad.b;
  var dMin = profiles[0].MD || 0;
  var dMax = profiles[profiles.length - 1].MD || 10000;
  if (dMax <= dMin) dMax = dMin + 1;
  var dR = dMax - dMin;
  var cx = W / 2;

  function toY(d) {
    var y = pad.t + ((d - dMin) / dR) * h;
    return Math.max(pad.t, Math.min(pad.t + h, y));
  }
  function sc(dia) { return Math.max(2, (Number(dia) || 5) * 3); }

  // Determine fluid color from fluid type
  var flBase = fluids && fluids[0] ? fluids[0].base : 'WBM';
  var flKey = 'WBM';
  if (typeof flBase === 'number') {
    if (flBase === 1 || flBase === 3) flKey = 'OBM';
    else if (flBase === 2) flKey = 'SBM';
    else flKey = 'WBM';
  } else {
    var bs = String(flBase).toUpperCase();
    if (bs.indexOf('OBM') >= 0 || bs.indexOf('OIL') >= 0 || bs.indexOf('MOBM') >= 0) flKey = 'OBM';
    else if (bs.indexOf('SBM') >= 0 || bs.indexOf('SYN') >= 0) flKey = 'SBM';
  }
  var fc = FLUID_COLORS[flKey] || FLUID_COLORS.WBM;

  // Extract casing geometry — prefer store data (casingsData) over profile detection
  var casings = [];
  if (casingsData && casingsData.length) {
    casingsData.forEach(function (c) {
      var sd = Number(c.sd) || 0;
      var id = Number(c.id) || 8;
      var od = Number(c.od) || 9.625;
      if (sd > 0) casings.push({ shoe: sd, hid: id, od: od, name: c.type || 'Casing' });
    });
  }
  // Fallback: detect from profiles if no store data
  if (casings.length === 0) {
    var lastHID = -1;
    profiles.forEach(function (p) {
      if (p.HID !== lastHID && p.HID > 0 && lastHID > 0) {
        casings.push({ shoe: p.MD, hid: lastHID, od: lastHID + 1 });
      }
      lastHID = p.HID;
    });
    if (casings.length === 0 && profiles[0].HID > 0) {
      casings.push({ shoe: dMax, hid: profiles[0].HID, od: profiles[0].HID + 1 });
    }
  }
  // Sort by shoe depth
  casings.sort(function (a, b) { return a.shoe - b.shoe; });

  // DS segments from profiles (detect OD changes)
  var dsSegs = [];
  var lastPID = -1;
  var segStart = 0;
  var lastPOD2 = 0;
  profiles.forEach(function (p, i) {
    if (p.PID !== lastPID && lastPID > 0) {
      dsSegs.push({ top: segStart, bot: p.MD, od: lastPOD2, pid: lastPID });
      segStart = p.MD;
    }
    lastPID = p.PID;
    lastPOD2 = p.POD;
  });
  if (lastPID > 0) dsSegs.push({ top: segStart, bot: dMax, od: lastPOD2, pid: lastPID });

  var bhp = scalars ? scalars.BHP : null;
  var ecd = scalars ? scalars.ECD : null;
  var spp = scalars ? scalars.SPP : null;
  var bht = scalars ? scalars.BHT : null;

  // ECD at shoe
  var ecdShoe = null;
  if (casings.length > 0 && profiles.length > 1) {
    var shoeD = casings[casings.length - 1].shoe;
    for (var si = 0; si < profiles.length; si++) {
      if (profiles[si].MD >= shoeD && profiles[si].TVD > 0) {
        ecdShoe = profiles[si].Pa / (0.052 * profiles[si].TVD);
        break;
      }
    }
  }

  // ECD at TD
  var ecdTD = null;
  var lastP = profiles[profiles.length - 1];
  if (lastP && lastP.TVD > 0) ecdTD = lastP.Pa / (0.052 * lastP.TVD);

  // Formation bands
  var fmBands = formations && formations.length ? formations.map(function (f, i) {
    var top = Number(f.md) || 0;
    var bot = (i < formations.length - 1) ? (Number(formations[i + 1].md) || dMax) : dMax;
    return { name: f.name || ('Fm ' + (i + 1)), top: top, bot: bot, color: FM_COLORS[i % FM_COLORS.length] };
  }) : [];

  return (
    <div style={{ width: W, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      <div style={{ height: hdr, padding: '2px 4px', borderBottom: '1px solid ' + C.border, textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: C.t2, fontWeight: 700 }}>Well Schematic</div>
        <div style={{ fontSize: 11, color: C.t3, fontWeight: 800 }}>TD: {dMax.toFixed(0)} ft</div>
        <div style={{ fontSize: 8, color: fc.fill, fontWeight: 600 }}>{(simParams.mudWeight || '--') + ' ppg ' + flKey}</div>
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Background */}
        <rect x={2} y={pad.t} width={W - 4} height={h} fill="#0d1015" rx="1" />

        {/* Formation bands */}
        {fmBands.map(function (fm, i) {
          var y1 = toY(Math.max(fm.top, dMin));
          var y2 = toY(Math.min(fm.bot, dMax));
          if (y2 <= y1) return null;
          return <g key={i}>
            <rect x={3} y={y1} width={W - 6} height={y2 - y1} fill={fm.color} opacity="0.35" />
            <text x={W - 4} y={(y1 + y2) / 2 + 3} fill={C.t0} fontSize="7" textAnchor="end" fontStyle="italic">{fm.name}</text>
            {fm.top > dMin && <line x1={3} x2={W - 3} y1={y1} y2={y1} stroke={C.t0} strokeWidth="0.4" strokeDasharray="3 3" />}
          </g>;
        })}

        {/* Depth ticks */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(function (f, i) {
          var d = dMin + dR * f;
          var y = toY(d);
          return <g key={i}>
            <line x1={2} x2={8} y1={y} y2={y} stroke={C.t0} strokeWidth="0.6" />
            <text x={10} y={y + 3} fill={C.t1} fontSize="8">{Math.round(d)}</text>
          </g>;
        })}

        {/* Casings — walls only, no crossing lines */}
        {casings.map(function (cas, ci) {
          var ihw = sc(cas.hid) / 2;
          var wallW = 2.5;
          var y1 = toY(dMin);
          var y2 = toY(cas.shoe);
          var color = ci === 0 ? '#5a5a6a' : ci === 1 ? '#6a6a7a' : '#7a7a8a';
          return <g key={ci}>
            {/* Left wall */}
            <rect x={cx - ihw - wallW} y={y1} width={wallW} height={y2 - y1} fill={color} opacity="0.85" />
            {/* Right wall */}
            <rect x={cx + ihw} y={y1} width={wallW} height={y2 - y1} fill={color} opacity="0.85" />
            {/* Shoe notches — inward only */}
            <rect x={cx - ihw - wallW} y={y2 - 2} width={wallW + 2} height={3} fill={color} rx="0.5" />
            <rect x={cx + ihw - 2} y={y2 - 2} width={wallW + 2} height={3} fill={color} rx="0.5" />
          </g>;
        })}

        {/* Annular fluid fill */}
        {(function () {
          var els = [];
          var innerHw = casings.length ? sc(casings[casings.length - 1].hid) / 2 : sc(8) / 2;
          var dpHw = sc(5) / 2; // approximate DP OD
          var shoeD = casings.length ? casings[casings.length - 1].shoe : dMax;

          // Cased section
          els.push(<rect key="fl-l" x={cx - innerHw + 1} y={toY(dMin)} width={innerHw - dpHw - 1}
            height={toY(shoeD) - toY(dMin)} fill={fc.fill} opacity={fc.op} />);
          els.push(<rect key="fl-r" x={cx + dpHw} y={toY(dMin)} width={innerHw - dpHw - 1}
            height={toY(shoeD) - toY(dMin)} fill={fc.fill} opacity={fc.op} />);

          // Open hole section
          if (shoeD < dMax) {
            var ohw = sc(8.5) / 2;
            els.push(<rect key="oh-l" x={cx - ohw + 1} y={toY(shoeD)} width={ohw - dpHw - 1}
              height={toY(dMax) - toY(shoeD)} fill={fc.fill} opacity={fc.op + 0.05} />);
            els.push(<rect key="oh-r" x={cx + dpHw} y={toY(shoeD)} width={ohw - dpHw - 1}
              height={toY(dMax) - toY(shoeD)} fill={fc.fill} opacity={fc.op + 0.05} />);
          }
          return els;
        })()}

        {/* Drill string — walls + bore */}
        {(function () {
          var dpHw = sc(5) / 2;
          var dpIhw = sc(4.276) / 2;
          var wallW = dpHw - dpIhw;
          return <g>
            <rect x={cx - dpHw} y={toY(dMin)} width={wallW} height={toY(dMax * 0.96) - toY(dMin)} fill="#5a6a7a" opacity="0.8" rx="0.5" />
            <rect x={cx + dpIhw} y={toY(dMin)} width={wallW} height={toY(dMax * 0.96) - toY(dMin)} fill="#5a6a7a" opacity="0.8" rx="0.5" />
            <rect x={cx - dpIhw + 0.5} y={toY(dMin)} width={dpIhw * 2 - 1} height={toY(dMax * 0.96) - toY(dMin)}
              fill={fc.fill} opacity={fc.op * 0.5} rx="0.5" />
          </g>;
        })()}

        {/* Bit */}
        {(function () {
          var bitTop = dMax * 0.96;
          var pipeW = sc(5) / 2;
          var bitW = sc(8.5) / 2;
          var y1 = toY(bitTop);
          var y2 = toY(dMax);
          return <g>
            <polygon points={[
              (cx - pipeW) + ',' + y1, (cx + pipeW) + ',' + y1,
              (cx + bitW) + ',' + y2, (cx - bitW) + ',' + y2,
            ].join(' ')} fill={C.amber} opacity="0.7" stroke={C.amber} strokeWidth="0.8" />
            {[-0.3, 0, 0.3].map(function (f, ni) {
              return <circle key={ni} cx={cx + f * bitW} cy={(y1 + y2) / 2} r={1.5} fill={C.bg} stroke={C.amber} strokeWidth="0.6" />;
            })}
          </g>;
        })()}

        {/* Bit depth line */}
        <line x1={3} x2={W - 3} y1={toY(dMax)} y2={toY(dMax)} stroke={C.amber} strokeWidth="0.8" strokeDasharray="3 2" />

        {/* === PRESSURE ANNOTATIONS === */}
        {/* SBP at surface */}
        {spp != null && <g>
          <rect x={1} y={toY(dMin)} width={38} height={12} fill={C.bg1} rx="2" stroke={C.amber} strokeWidth="0.5" />
          <text x={20} y={toY(dMin) + 9} fill={C.amber} fontSize="7" fontWeight="700" textAnchor="middle">
            SPP {Math.round(spp)}
          </text>
        </g>}

        {/* ECD at casing shoe */}
        {ecdShoe != null && casings.length > 0 && <g>
          <rect x={1} y={toY(casings[casings.length - 1].shoe) - 6} width={48} height={12} fill={C.bg1} rx="2" stroke={C.green} strokeWidth="0.5" />
          <text x={25} y={toY(casings[casings.length - 1].shoe) + 2} fill={C.green} fontSize="7" fontWeight="700" textAnchor="middle">
            ECD {ecdShoe.toFixed(2)}
          </text>
        </g>}

        {/* BHP at TD — left side, above bit line */}
        {bhp != null && <g>
          <rect x={1} y={toY(dMax) - 28} width={46} height={12} fill={C.bg1} rx="2" stroke={C.blue} strokeWidth="0.5" />
          <text x={24} y={toY(dMax) - 20} fill={C.blue} fontSize="7" fontWeight="700" textAnchor="middle">
            BHP {Math.round(bhp)}
          </text>
        </g>}

        {/* ECD at TD — left side, just above bit line */}
        {ecdTD != null && <g>
          <rect x={1} y={toY(dMax) - 14} width={48} height={12} fill={C.bg1} rx="2" stroke={C.green} strokeWidth="0.5" />
          <text x={25} y={toY(dMax) - 6} fill={C.green} fontSize="7" fontWeight="700" textAnchor="middle">
            ECD {ecdTD.toFixed(2)}
          </text>
        </g>}

        {/* Sensor markers */}
        <circle cx={cx + sc(8) / 2 + 6} cy={toY(dMax * 0.95)} r={3} fill={C.cyan} opacity="0.9" />
        <text x={cx + sc(8) / 2 + 12} y={toY(dMax * 0.95) + 3} fill={C.cyan} fontSize="7" fontWeight="700">PWD</text>
      </svg>
    </div>
  );
}

function autoRange(arrays, padPct) {
  var all = [];
  arrays.forEach(function (a) { a.forEach(function (v) { if (v > 0 && isFinite(v)) all.push(v); }); });
  if (!all.length) return [0, 1];
  var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
  var r = mx - mn || 1, p = padPct || 0.05;
  return [Math.floor((mn - r * p) * 100) / 100, Math.ceil((mx + r * p) * 100) / 100];
}
function lastVal(arr) { return (arr && arr.length) ? arr[arr.length - 1] : null; }

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
  var fluids = useProjectStore(function (s) { return s.fluids; });
  var casingsData = useProjectStore(function (s) { return s.casings; });
  var holeData = useProjectStore(function (s) { return s.hole; });
  var dsData = useProjectStore(function (s) { return s.drillstring; });

  var stVis = useState({ gradient: true, pressure: true, temperature: true, flow: true, density: true, sbp: true, spp: true });
  var trackVis = stVis[0], setTrackVis = stVis[1];
  function toggleTrack(id) { setTrackVis(function (v) { var nv = {}; Object.keys(v).forEach(function (k) { nv[k] = v[k]; }); nv[id] = !nv[id]; return nv; }); }

  var allTracks = [
    { id: 'gradient', label: 'Gradient' }, { id: 'pressure', label: 'Pressure' },
    { id: 'temperature', label: 'Temperature' }, { id: 'flow', label: 'Flow' },
    { id: 'density', label: 'Density' }, { id: 'sbp', label: 'SBP' }, { id: 'spp', label: 'SPP' },
  ];

  var containerRef = useRef(null);
  var stSize = useState({ w: 1200, h: 600 });
  var size = stSize[0], setSize = stSize[1];
  useEffect(function () {
    function measure() { if (containerRef.current) { var r = containerRef.current.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); } }
    measure(); window.addEventListener('resize', measure);
    return function () { window.removeEventListener('resize', measure); };
  }, []);

  var hdr = 78;
  var closeBarH = 16;
  var trackH = Math.max(200, size.h - hdr - closeBarH - 4);
  var wellW = 140;

  var visDepth = ['gradient', 'pressure', 'temperature'].filter(function (id) { return trackVis[id]; }).length;
  var visTime = ['flow', 'density', 'sbp', 'spp'].filter(function (id) { return trackVis[id]; }).length;
  var totalVis = visDepth + visTime;
  var availW = size.w - wellW;
  var depthShare = totalVis > 0 ? visDepth / totalVis : 0.5;
  var depthW = visDepth > 0 ? Math.floor((availW * Math.max(depthShare, 0.3)) / visDepth) : 0;
  var timeW = visTime > 0 ? Math.floor((availW * Math.max(1 - depthShare, 0.2)) / visTime) : 0;

  var depths = profiles.map(function (p) { return p.MD; });
  var ecdData = profiles.map(function (p) { return p.TVD > 0 ? p.Pa / (0.052 * p.TVD) : 0; });
  var mwData = profiles.map(function (p) { return p.rhoa || 0; });
  var ppgData = profiles.map(function (p) { var ppg = 8.5; formations.forEach(function (f) { if (p.MD >= (Number(f.md) || 0)) ppg = Number(f.ppg) || 8.5; }); return ppg; });
  var fpgData = profiles.map(function (p) { var fpg = 16; formations.forEach(function (f) { if (p.MD >= (Number(f.md) || 0)) fpg = Number(f.fpg) || 16; }); return fpg; });
  var paData = profiles.map(function (p) { return p.Pa || 0; });
  var porePresData = profiles.map(function (p, i) { return 0.052 * ppgData[i] * (p.TVD || 0); });
  var fracPresData = profiles.map(function (p, i) { return 0.052 * fpgData[i] * (p.TVD || 0); });
  var taData = profiles.map(function (p) { return p.Ta || 0; });
  var tpData = profiles.map(function (p) { return p.Tp || 0; });
  var tfData = profiles.map(function (p) { return p.Tf || 0; });

  var gradRange = profiles.length ? autoRange([ecdData, mwData, ppgData, fpgData], 0.1) : [8, 18];
  var presRange = profiles.length ? autoRange([paData, porePresData, fracPresData], 0.05) : [0, 10000];
  var tempRange = profiles.length ? autoRange([taData, tpData, tfData], 0.05) : [70, 300];
  var flowIn = simParams.flowRate || 0, flowOut = flowIn, sbp = simParams.sbp || 0, spp = scalars.SPP || 0;

  function TrackWrapper(props) {
    return (
      <div style={{ width: props.trackWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: closeBarH, background: C.bg1, borderBottom: '1px solid ' + C.border,
          borderRight: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={function () { toggleTrack(props.trackId); }}
            style={{ background: 'transparent', border: 'none', color: C.t0, fontSize: 9, cursor: 'pointer', padding: '0 6px' }}
            onMouseEnter={function (e) { e.target.style.color = C.red; }}
            onMouseLeave={function (e) { e.target.style.color = C.t0; }}>x</button>
        </div>
        {props.children}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bg, position: 'relative' }}>
      <div style={{ display: 'flex', width: '100%', overflow: 'hidden' }}>

        {trackVis.gradient && <TrackWrapper trackWidth={depthW} trackId="gradient">
          <DepthTrack title="Gradient" unit="ppg" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={gradRange[0]} xMax={gradRange[1]} showDepthAxis={true}
            fillBetween={profiles.length ? [2, 0] : null}
            traces={profiles.length ? [
              { label: 'FPG', color: C.green, data: fpgData }, { label: 'PPG', color: C.red, data: ppgData },
              { label: 'ECD', color: C.blue, data: ecdData }, { label: 'MW', color: C.cyan, data: mwData, dash: true },
            ] : []}
            currentValues={[
              { label: 'FPG', value: lastVal(fpgData) ? lastVal(fpgData).toFixed(2) : '---', color: C.green },
              { label: 'PPG', value: lastVal(ppgData) ? lastVal(ppgData).toFixed(2) : '---', color: C.red },
              { label: 'ECD', value: lastVal(ecdData) ? lastVal(ecdData).toFixed(2) : '---', color: C.blue },
            ]} />
        </TrackWrapper>}

        {trackVis.pressure && <TrackWrapper trackWidth={depthW} trackId="pressure">
          <DepthTrack title="Pressure" unit="psi" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={presRange[0]} xMax={presRange[1]}
            fillBetween={profiles.length ? [2, 0] : null}
            traces={profiles.length ? [
              { label: 'Frac P', color: C.green, data: fracPresData }, { label: 'Pore P', color: C.red, data: porePresData },
              { label: 'Ann P', color: C.blue, data: paData },
            ] : []}
            currentValues={[
              { label: 'Frac P', value: lastVal(fracPresData) ? lastVal(fracPresData).toFixed(0) : '---', color: C.green },
              { label: 'Pore P', value: lastVal(porePresData) ? lastVal(porePresData).toFixed(0) : '---', color: C.red },
              { label: 'Ann P', value: lastVal(paData) ? lastVal(paData).toFixed(0) : '---', color: C.blue },
            ]} />
        </TrackWrapper>}

        {trackVis.temperature && <TrackWrapper trackWidth={depthW} trackId="temperature">
          <DepthTrack title="Temperature" unit="F" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={tempRange[0]} xMax={tempRange[1]}
            traces={profiles.length ? [
              { label: 'Ann T', color: C.red, data: taData }, { label: 'Pipe T', color: C.amber, data: tpData },
              { label: 'Form T', color: C.t0, data: tfData, dash: true },
            ] : []}
            currentValues={[
              { label: 'Ann T', value: lastVal(taData) ? lastVal(taData).toFixed(0) : '---', color: C.red },
              { label: 'Form T', value: lastVal(tfData) ? lastVal(tfData).toFixed(0) : '---', color: C.t0 },
            ]} />
        </TrackWrapper>}

        {/* WELL SCHEMATIC */}
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ height: closeBarH, background: C.bg1, borderBottom: '1px solid ' + C.border, borderRight: '1px solid ' + C.border }} />
          <WellColumn profiles={profiles} scalars={scalars} height={trackH} hdr={hdr}
            formations={formations} fluids={fluids} casingsData={casingsData}
            holeData={holeData} dsData={dsData} simParams={simParams} />
        </div>

        {trackVis.flow && <TrackWrapper trackWidth={timeW} trackId="flow">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.max(1000, flowIn * 1.5)}
            traces={[
              { id: 'flowOut', label: 'Flow Out', color: C.red, unit: 'gpm', value: flowOut },
              { id: 'flowIn', label: 'Flow In', color: C.blue, unit: 'gpm', value: flowIn },
            ]} />
        </TrackWrapper>}

        {trackVis.density && <TrackWrapper trackWidth={timeW} trackId="density">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={gradRange[0]} max={gradRange[1]}
            traces={[
              { id: 'densOut', label: 'Density Out', color: C.red, unit: 'ppg', value: scalars.ECD || null },
              { id: 'densIn', label: 'Density In', color: C.blue, unit: 'ppg', value: simParams.mudWeight },
            ]} />
        </TrackWrapper>}

        {trackVis.sbp && <TrackWrapper trackWidth={timeW} trackId="sbp">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.max(200, sbp * 3 || 200)}
            traces={[
              { id: 'sbpSP', label: 'SBP SP', color: C.amber, unit: 'psi', value: null, dash: true },
              { id: 'highLim', label: 'High Limit', color: C.red, unit: 'psi', value: null, dash: true },
              { id: 'sbp', label: 'SBP', color: C.green, unit: 'psi', value: sbp },
            ]} />
        </TrackWrapper>}

        {trackVis.spp && <TrackWrapper trackWidth={timeW} trackId="spp">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.ceil((spp || 5000) * 1.3)}
            traces={[
              { id: 'sppSP', label: 'SPP SP', color: C.amber, unit: 'psi', value: null, dash: true },
              { id: 'spp', label: 'SPP', color: C.blue, unit: 'psi', value: spp },
            ]} />
        </TrackWrapper>}
      </div>
      <TrackConfigBar allTracks={allTracks} visible={trackVis} onToggle={toggleTrack} />
    </div>
  );
}
