import { useState, useEffect, useRef } from 'react';
import { useProjectStore, useSimulateStore } from '../state/stores';
import { C } from '../theme';

function formatTime(s) { var m = Math.floor(s / 60); var sec = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec; }

// BMW gauge
function Gauge({ label, unit, value, min, max, color, onChange, step, size }) {
  var svgRef = useRef(null); var stDrag = useState(false); var dragging = stDrag[0], setDragging = stDrag[1];
  var stEditing = useState(false); var editing = stEditing[0], setEditing = stEditing[1];
  var stEditVal = useState(''); var editVal = stEditVal[0], setEditVal = stEditVal[1];
  var downPos = useRef(null);
  var S = size || 145; var cx = S / 2, cy = S / 2 + 6; var r = S * 0.32;
  var startDeg = 225, totalDeg = 270;
  var pct = Math.max(0, Math.min(1, (value - min) / ((max - min) || 1)));
  var valDeg = startDeg - pct * totalDeg; var valRad = valDeg * Math.PI / 180;
  var nx = cx + (r - 4) * Math.cos(valRad), ny = cy - (r - 4) * Math.sin(valRad);
  var tx = cx - 10 * Math.cos(valRad), ty = cy + 10 * Math.sin(valRad);
  function degXY(deg, rad) { return { x: cx + rad * Math.cos(deg * Math.PI / 180), y: cy - rad * Math.sin(deg * Math.PI / 180) }; }
  function arc(sd, ed, rad) { var s = degXY(sd, rad), e = degXY(ed, rad); var d = sd - ed; if (d < 0) d += 360;
    return 'M ' + s.x + ' ' + s.y + ' A ' + rad + ' ' + rad + ' 0 ' + (d > 180 ? 1 : 0) + ' 1 ' + e.x + ' ' + e.y; }
  function valFromMouse(ex, ey) { var rect = svgRef.current.getBoundingClientRect();
    var mx = ex - rect.left - cx, my = -(ey - rect.top - cy); var deg = Math.atan2(my, mx) * 180 / Math.PI;
    if (deg < 0) deg += 360; var p = (startDeg - deg) / totalDeg; if (deg > startDeg) p = 0;
    if (deg < startDeg - totalDeg + 360 && deg > 0 && deg < 90) p = 1;
    return min + Math.max(0, Math.min(1, p)) * (max - min); }
  function handleDown(e) { downPos.current = { x: e.clientX, y: e.clientY }; }
  function handleMove(e) { if (!downPos.current) return;
    if (!dragging && Math.abs(e.clientX - downPos.current.x) + Math.abs(e.clientY - downPos.current.y) > 5) setDragging(true);
    if (dragging) onChange(valFromMouse(e.clientX, e.clientY)); }
  function handleUp() { downPos.current = null; setDragging(false); }
  function handleEditSubmit() { var num = parseFloat(editVal);
    if (!isNaN(num)) onChange(Math.max(min, Math.min(max, num))); setEditing(false); }
  var ticks = [];
  for (var i = 0; i <= 50; i++) { var deg = startDeg - (i / 50) * totalDeg; var isMaj = i % 10 === 0;
    var p1 = degXY(deg, r + 2), p2 = degXY(deg, r + (isMaj ? 10 : 4));
    ticks.push(<line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isMaj ? C.t1 : C.t0 + '60'} strokeWidth={isMaj ? 1.2 : 0.3} />);
    if (isMaj) { var lp = degXY(deg, r + 18); var v = min + (i / 50) * (max - min);
      ticks.push(<text key={'l' + i} x={lp.x} y={lp.y + 3} fill={C.t1} fontSize="7" textAnchor="middle" fontWeight="600">
        {max > 100 ? Math.round(v) : v.toFixed(1)}</text>); } }
  var fid = 'g-' + label.replace(/\s/g, '');
  var btnStyle = { width: 24, height: 24, borderRadius: '50%', border: '1px solid ' + C.border,
    background: C.bg2, color: C.t2, fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg ref={svgRef} width={S} height={S - 10} style={{ cursor: dragging ? 'grabbing' : 'default' }}
        onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}>
        <defs>
          <filter id={fid}><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id={'ng-' + fid} x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#666" /><stop offset="50%" stopColor="#ddd" /><stop offset="100%" stopColor="#666" /></linearGradient>
          <radialGradient id={'bg-' + fid} cx="50%" cy="45%"><stop offset="0%" stopColor="#151a28" /><stop offset="100%" stopColor="#080a12" /></radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r + 20} fill={'url(#bg-' + fid + ')'} /><circle cx={cx} cy={cy} r={r + 20} fill="none" stroke={C.border} strokeWidth="0.8" />
        <path d={arc(startDeg, startDeg - totalDeg, r)} fill="none" stroke={C.border} strokeWidth="5" strokeLinecap="round" />
        <path d={arc(startDeg, valDeg, r)} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" filter={'url(#' + fid + ')'} />
        <path d={arc(startDeg, valDeg, r - 6)} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
        {ticks}
        <line x1={tx} y1={ty} x2={nx} y2={ny} stroke={'url(#ng-' + fid + ')'} strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="#2a2a3a" stroke="#555" strokeWidth="0.8" /><circle cx={cx} cy={cy} r={2.5} fill="#888" />
        <text x={cx} y={cy + r * 0.45} fill={color} fontSize="16" fontWeight="800" textAnchor="middle" filter={'url(#' + fid + ')'}>
          {max > 100 ? Math.round(value).toLocaleString() : value.toFixed(1)}</text>
        <text x={cx} y={cy + r * 0.45 + 12} fill={C.t0} fontSize="7" textAnchor="middle">{unit}</text>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -4 }}>
        <button onClick={function () { onChange(Math.max(min, value - (step || 1))); }} style={btnStyle}
          onMouseEnter={function (e) { e.target.style.background = color + '20'; }} onMouseLeave={function (e) { e.target.style.background = C.bg2; }}>−</button>
        {editing ? (
          <input autoFocus value={editVal} onChange={function (e) { setEditVal(e.target.value); }}
            onBlur={handleEditSubmit} onKeyDown={function (e) { if (e.key === 'Enter') handleEditSubmit(); if (e.key === 'Escape') setEditing(false); }}
            style={{ width: 50, background: C.bg2, border: '1px solid ' + color, borderRadius: 4, padding: '2px 4px', color: color, fontSize: 10, textAlign: 'center', outline: 'none' }} />
        ) : (
          <div onClick={function () { setEditing(true); setEditVal(String(max > 100 ? Math.round(value) : value.toFixed(1))); }}
            style={{ cursor: 'text', minWidth: 50, textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: C.t2, fontWeight: 700, letterSpacing: 1 }}>{label}</div></div>
        )}
        <button onClick={function () { onChange(Math.min(max, value + (step || 1))); }} style={btnStyle}
          onMouseEnter={function (e) { e.target.style.background = color + '20'; }} onMouseLeave={function (e) { e.target.style.background = C.bg2; }}>+</button>
      </div>
    </div>);
}

// Strip chart
function Strip({ label, unit, color, data, dataKey, width, height, tMin, tMax, hoverTime, onHover, onRemove }) {
  var pad = { t: 4, b: 4, l: 72, r: 10 }; var w = width - pad.l - pad.r; var h = height - pad.t - pad.b; var tR = tMax - tMin || 1;
  var vals = data.map(function (d) { return d[dataKey] || 0; });
  var yMin = vals.length ? Math.min.apply(null, vals) : 0; var yMax = vals.length ? Math.max.apply(null, vals) : 1;
  var yR = yMax - yMin || 1; yMin -= yR * 0.1; yMax += yR * 0.1; yR = yMax - yMin;
  var latest = data.length ? data[data.length - 1][dataKey] : null;
  function toX(t) { return pad.l + ((t - tMin) / tR) * w; }
  function toY(v) { return pad.t + h - ((v - yMin) / yR) * h; }
  function fromX(px) { return tMin + ((px - pad.l) / w) * tR; }
  var pts = data.map(function (d) { return toX(d.time) + ',' + toY(d[dataKey] || 0); }).join(' ');
  var fillPts = data.length > 1 ? pts + ' ' + toX(data[data.length - 1].time) + ',' + (pad.t + h) + ' ' + toX(data[0].time) + ',' + (pad.t + h) : '';
  var hv = null, hx = null, hy = null;
  if (hoverTime != null && data.length) { var best = 0, bd = Infinity;
    for (var i = 0; i < data.length; i++) { var d = Math.abs(data[i].time - hoverTime); if (d < bd) { bd = d; best = i; } }
    hv = data[best][dataKey]; hx = toX(data[best].time); hy = toY(hv || 0); }
  function handleMove(e) { var rect = e.currentTarget.getBoundingClientRect(); var px = e.clientX - rect.left;
    if (px < pad.l || px > pad.l + w) return; onHover(fromX(px)); }
  var yGrids = [];
  for (var gi = 0; gi <= 4; gi++) { var y = pad.t + h * (1 - gi / 4); var v = yMin + yR * gi / 4;
    yGrids.push(<g key={gi}><line x1={pad.l} x2={pad.l + w} y1={y} y2={y} stroke={C.border} strokeWidth="0.4" />
      <text x={pad.l - 4} y={y + 3} fill={C.t1} fontSize="9" textAnchor="end">{v > 100 ? Math.round(v) : v.toFixed(1)}</text></g>); }
  return (
    <div style={{ position: 'relative', borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
      {onRemove && <button onClick={onRemove} style={{ position: 'absolute', top: 2, right: 4, zIndex: 2,
        background: 'transparent', border: 'none', color: C.t0, fontSize: 9, cursor: 'pointer', padding: '2px 4px' }}
        onMouseEnter={function (e) { e.target.style.color = C.red; }} onMouseLeave={function (e) { e.target.style.color = C.t0; }}>✕</button>}
      <svg width={width} height={height} style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMove} onMouseLeave={function () { onHover(null); }}>
        <rect x={pad.l} y={pad.t} width={w} height={h} fill={C.bg2} />{yGrids}
        <rect x={0} y={0} width={pad.l - 2} height={height} fill={C.bg1} />
        <text x={5} y={14} fill={color} fontSize="10" fontWeight="700">{label}</text>
        <text x={5} y={32} fill={color} fontSize="16" fontWeight="800">
          {latest != null ? (latest > 100 ? Math.round(latest).toLocaleString() : latest.toFixed(2)) : '---'}</text>
        <text x={5} y={44} fill={C.t0} fontSize="8">{unit}</text>
        {data.length > 1 && <polygon points={fillPts} fill={color} opacity="0.04" />}
        {data.length > 0 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />}
        {data.length > 0 && <circle cx={toX(data[data.length - 1].time)} cy={toY(latest || 0)} r={3} fill={color} stroke={C.bg} strokeWidth="1" />}
        {hoverTime != null && hx != null && <g>
          <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + h} stroke={C.amber} strokeWidth="0.7" strokeDasharray="3 2" />
          {hv != null && <g><circle cx={hx} cy={hy} r={3.5} fill={color} stroke={C.bg} strokeWidth="1.5" />
            <rect x={hx + 6} y={hy - 8} width={50} height={15} fill={C.bg1} rx="2" stroke={color} strokeWidth="0.5" />
            <text x={hx + 10} y={hy + 3} fill={color} fontSize="9" fontWeight="700">{hv > 100 ? Math.round(hv) : hv.toFixed(2)}</text></g>}
        </g>}
      </svg>
    </div>);
}

function TimeAxis({ width, tMin, tMax, hoverTime, height }) {
  var pad = { l: 72, r: 10 }; var w = width - pad.l - pad.r; var tR = tMax - tMin || 1;
  function toX(t) { return pad.l + ((t - tMin) / tR) * w; }
  var labels = []; for (var i = 0; i <= 10; i++) { var t = tMin + tR * i / 10; labels.push({ x: toX(t), label: formatTime(t) }); }
  return (<svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
    <rect x={pad.l} y={0} width={w} height={height} fill={C.bg1} />
    {labels.map(function (tl, i) { return <g key={i}>
      <line x1={tl.x} x2={tl.x} y1={0} y2={5} stroke={C.t0} strokeWidth="0.8" />
      <text x={tl.x} y={16} fill={C.t1} fontSize="9" textAnchor="middle" fontWeight="600">{tl.label}</text></g>; })}
    {hoverTime != null && <g>
      <line x1={toX(hoverTime)} x2={toX(hoverTime)} y1={0} y2={height} stroke={C.amber} strokeWidth="1" />
      <rect x={toX(hoverTime) - 20} y={1} width={40} height={14} fill={C.bg1} rx="2" stroke={C.amber} strokeWidth="0.5" />
      <text x={toX(hoverTime)} y={11} fill={C.amber} fontSize="8" fontWeight="700" textAnchor="middle">{formatTime(hoverTime)}</text></g>}
  </svg>);
}

function AddBar({ allCharts, visible, onToggle }) {
  var hidden = allCharts.filter(function (c) { return !visible[c.key]; });
  if (!hidden.length) return null;
  return (<div style={{ display: 'flex', gap: 4, padding: '4px 12px', background: C.bg1, borderTop: '1px solid ' + C.border, flexShrink: 0 }}>
    <span style={{ fontSize: 9, color: C.t0, alignSelf: 'center', marginRight: 4 }}>Add:</span>
    {hidden.map(function (c) { return <button key={c.key} onClick={function () { onToggle(c.key); }} style={{
      padding: '3px 10px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: C.bg2,
      border: '1px solid ' + C.border, color: c.color, cursor: 'pointer' }}>+ {c.label}</button>; })}
  </div>);
}

export default function SimulatePage() {
  // ALL state from Zustand store — persists across navigation
  var connected = useSimulateStore(function (s) { return s.connected; });
  var running = useSimulateStore(function (s) { return s.running; });
  var step = useSimulateStore(function (s) { return s.step; });
  var cycleTime = useSimulateStore(function (s) { return s.cycleTime; });
  var error = useSimulateStore(function (s) { return s.error; });
  var gaugeMode = useSimulateStore(function (s) { return s.gaugeMode; });
  var setGaugeMode = useSimulateStore(function (s) { return s.setGaugeMode; });
  var history = useSimulateStore(function (s) { return s.history; });
  var liveParams = useSimulateStore(function (s) { return s.liveParams; });
  var chartVis = useSimulateStore(function (s) { return s.chartVis; });
  var toggleChart = useSimulateStore(function (s) { return s.toggleChart; });
  var updateParam = useSimulateStore(function (s) { return s.updateParam; });
  var start = useSimulateStore(function (s) { return s.start; });
  var pause = useSimulateStore(function (s) { return s.pause; });
  var stop = useSimulateStore(function (s) { return s.stop; });
  var initParams = useSimulateStore(function (s) { return s.initParams; });
  var excelPath = useProjectStore(function (s) { return s.excelPath; });

  var stHover = useState(null); var hoverTime = stHover[0], setHoverTime = stHover[1];

  // Init params from project on first mount (only if not already running)
  useEffect(function () { if (!connected && !running) initParams(); }, []);

  // Responsive
  var containerRef = useRef(null);
  var stSize = useState({ w: 1200, h: 600 }); var size = stSize[0], setSize = stSize[1];
  useEffect(function () {
    function measure() { if (containerRef.current) { var r = containerRef.current.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); } }
    measure(); window.addEventListener('resize', measure); return function () { window.removeEventListener('resize', measure); };
  }, []);

  function rnd(v, s) { return s >= 1 ? Math.round(v / s) * s : Math.round(v * 10) / 10; }

  var controls = [
    { label: 'FLOW RATE', unit: 'gpm', color: C.blue, key: 'flow_rate', min: 0, max: 1500, step: 10 },
    { label: 'SBP', unit: 'psi', color: C.green, key: 'sbp', min: 0, max: 500, step: 5 },
    { label: 'RPM', unit: 'rpm', color: C.cyan, key: 'rpm', min: 0, max: 200, step: 5 },
    { label: 'MUD WT', unit: 'ppg', color: C.amber, key: 'mud_weight', min: 7, max: 18, step: 0.1 },
    { label: 'INLET T', unit: 'F', color: C.red, key: 'inlet_temp', min: 50, max: 200, step: 5 },
  ];

  var allCharts = [
    { label: 'SPP', unit: 'psi', color: C.cyan, key: 'SPP' },
    { label: 'BHP', unit: 'psi', color: C.blue, key: 'BHP' },
    { label: 'ECD', unit: 'ppg', color: C.green, key: 'ECD' },
    { label: 'BHT', unit: 'F', color: C.red, key: 'BHT' },
    { label: 'Flow', unit: 'gpm', color: C.amber, key: 'flow_rate' },
    { label: 'SBP', unit: 'psi', color: C.purple, key: 'sbp' },
    { label: 'RPM', unit: 'rpm', color: C.cyan, key: 'rpm' },
    { label: 'An Fric', unit: 'psi', color: C.orange, key: 'AnFric' },
  ];
  var visibleCharts = allCharts.filter(function (c) { return chartVis[c.key]; });

  var tMin = history.length ? history[0].time : 0;
  var tMax = history.length ? history[history.length - 1].time : 60;
  if (tMax <= tMin) tMax = tMin + 60;

  var gaugeH = gaugeMode ? 175 : 90;
  var headerH = 38; var timeAxisH = 22; var addBarH = 28;
  var availH = size.h - headerH - gaugeH - timeAxisH - addBarH - 4;
  var stripH = Math.max(70, Math.floor(availH / Math.max(visibleCharts.length, 1)));
  var chartW = size.w;

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#050810' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px',
        background: C.bg1, borderBottom: '1px solid ' + C.border, flexShrink: 0, height: headerH }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: running ? C.green : connected ? C.amber : C.red,
            boxShadow: running ? '0 0 8px ' + C.green : 'none' }} />
          <span style={{ fontSize: 12, color: running ? C.green : C.t0, fontWeight: 700 }}>
            {running ? 'LIVE' : connected ? 'PAUSED' : 'STOPPED'}</span>
        </div>
        {!excelPath ? <span style={{ fontSize: 10, color: C.red }}>Go to Plan → upload Excel first</span> : (
          <div style={{ display: 'flex', gap: 6 }}>
            {!running && <button onClick={start} style={{ padding: '5px 16px', borderRadius: 4, border: 'none',
              background: C.green, color: '#050810', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>START</button>}
            {running && <button onClick={pause} style={{ padding: '5px 16px', borderRadius: 4, border: 'none',
              background: C.amber, color: '#050810', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>PAUSE</button>}
            <button onClick={stop} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid ' + C.border,
              background: 'transparent', color: C.t0, fontSize: 10, cursor: 'pointer' }}>STOP</button>
          </div>)}
        <button onClick={function () { setGaugeMode(!gaugeMode); }} style={{ padding: '4px 10px', borderRadius: 4,
          fontSize: 9, fontWeight: 600, cursor: 'pointer', background: gaugeMode ? C.blue + '20' : 'transparent',
          border: '1px solid ' + (gaugeMode ? C.blue : C.border), color: gaugeMode ? C.blue : C.t0 }}>
          {gaugeMode ? 'Gauges' : 'Sliders'}</button>
        <span style={{ fontSize: 9, color: C.t0, marginLeft: 'auto' }}>
          Step: <span style={{ color: C.t3, fontWeight: 700 }}>{step}</span>
          {' | '}Time: <span style={{ color: C.t3, fontWeight: 700 }}>{formatTime(step)}</span>
          {' | '}Cycle: <span style={{ color: C.t3 }}>{cycleTime}s</span>
          {' | '}<span style={{ color: C.t3 }}>{history.length}</span>/300</span>
        {error && <span style={{ fontSize: 9, color: C.red, marginLeft: 8 }}>{error}</span>}
      </div>

      {/* Controls */}
      <div style={{ padding: gaugeMode ? '6px 0' : '6px 16px', background: C.bg1,
        borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
        {gaugeMode ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {controls.map(function (c) { return <Gauge key={c.key} label={c.label} unit={c.unit}
              color={c.color} value={liveParams[c.key]} min={c.min} max={c.max} step={c.step} size={145}
              onChange={function (v) { updateParam(c.key, rnd(Math.max(c.min, Math.min(c.max, v)), c.step)); }} />; })}
          </div>
        ) : (
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            {controls.map(function (c) { return <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <span style={{ fontSize: 9, color: C.t0, width: 65, flexShrink: 0 }}>{c.label}</span>
              <input type="range" min={c.min} max={c.max} step={c.step} value={liveParams[c.key]}
                onChange={function (e) { updateParam(c.key, e.target.value); }}
                style={{ flex: 1, accentColor: c.color, height: 3, cursor: 'pointer' }} />
              <span style={{ fontSize: 11, color: c.color, fontWeight: 700, width: 50, textAlign: 'right' }}>
                {liveParams[c.key] > 100 ? Math.round(liveParams[c.key]) : liveParams[c.key].toFixed(1)}</span>
              <span style={{ fontSize: 7, color: C.t0, width: 25 }}>{c.unit}</span>
            </div>; })}
          </div>
        )}
      </div>

      {/* Charts */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {visibleCharts.map(function (ch) { return <Strip key={ch.key} label={ch.label} unit={ch.unit} color={ch.color}
          data={history} dataKey={ch.key} width={chartW} height={stripH}
          tMin={tMin} tMax={tMax} hoverTime={hoverTime} onHover={setHoverTime}
          onRemove={function () { toggleChart(ch.key); }} />; })}
        <TimeAxis width={chartW} tMin={tMin} tMax={tMax} hoverTime={hoverTime} height={timeAxisH} />
      </div>
      <AddBar allCharts={allCharts} visible={chartVis} onToggle={toggleChart} />
    </div>
  );
}
