import { useState, useRef } from 'react';
import { C } from '../../theme';

export default function TimeTrack({
  traces = [], min = 0, max = 100, width = 100, height = 500, hdr = 58,
}) {
  var stVis = useState(function () {
    var obj = {};
    traces.forEach(function (t) { obj[t.id] = true; });
    return obj;
  });
  var vis = stVis[0], setVis = stVis[1];
  var stHover = useState(null);
  var hover = stHover[0], setHover = stHover[1];
  var svgRef = useRef(null);

  function toggle(id) {
    setVis(function (v) {
      var nv = {};
      Object.keys(v).forEach(function (k) { nv[k] = v[k]; });
      nv[id] = !nv[id];
      return nv;
    });
  }

  var pad = { t: 0, b: 16, l: 4, r: 4 };
  var w = width - pad.l - pad.r;
  var h = height - pad.t - pad.b;
  var xR = (max - min) || 1;

  function toX(v) { return pad.l + (((v || 0) - min) / xR) * w; }
  function fromX(px) { return min + ((px - pad.l) / w) * (max - min); }

  var activeTraces = traces.filter(function (t) { return vis[t.id]; });

  function handleMouseMove(e) {
    var rect = svgRef.current.getBoundingClientRect();
    var px = e.clientX - rect.left;
    if (px < pad.l || px > pad.l + w) { setHover(null); return; }
    var val = fromX(px);
    setHover({ x: px, value: val });
  }

  function handleMouseLeave() { setHover(null); }

  return (
    <div style={{ width: width, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      {/* Header */}
      <div style={{ height: hdr, padding: '3px 5px', borderBottom: '1px solid ' + C.border, overflow: 'hidden' }}>
        {traces.map(function (t) {
          var active = vis[t.id];
          return <div key={t.id} onClick={function () { toggle(t.id); }}
            style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer',
              opacity: active ? 1 : 0.35, lineHeight: 1.3 }}>
            <span style={{ fontSize: 8, color: t.color, fontWeight: 700,
              textDecoration: active ? 'none' : 'line-through' }}>{t.label}</span>
            <span style={{ fontSize: 8, color: t.color }}>{t.unit}</span>
          </div>;
        })}
        {hover ? (
          <div style={{ fontSize: 9, fontWeight: 800, color: C.amber, marginTop: 1 }}>
            {hover.value.toFixed(1)}
          </div>
        ) : (
          <div style={{ marginTop: 1 }}>
            {activeTraces.map(function (t) {
              return <span key={t.id} style={{ fontSize: 9, fontWeight: 800, color: t.color, marginRight: 6 }}>
                {t.value != null ? (typeof t.value === 'number' ? t.value.toFixed(1) : t.value) : '---'}
              </span>;
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(function (f, i) {
          var x = pad.l + w * f;
          return <line key={'v' + i} x1={x} x2={x} y1={pad.t} y2={pad.t + h} stroke={C.border} strokeWidth="0.3" />;
        })}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(function (f, i) {
          var y = pad.t + h * f;
          return <line key={'h' + i} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={C.border} strokeWidth="0.3" />;
        })}

        {/* Value lines */}
        {activeTraces.map(function (t, ti) {
          var vx = toX(t.value);
          return <g key={t.id}>
            <rect x={pad.l} y={pad.t} width={Math.max(0, vx - pad.l)} height={h}
              fill={t.color} opacity={0.04 + ti * 0.02} />
            <line x1={vx} x2={vx} y1={pad.t} y2={pad.t + h}
              stroke={t.color} strokeWidth={t.dash ? 1 : 1.5}
              strokeDasharray={t.dash ? '3 2' : ''} />
          </g>;
        })}

        {/* Crosshair */}
        {hover && <g>
          <line x1={hover.x} x2={hover.x} y1={pad.t} y2={pad.t + h}
            stroke={C.amber} strokeWidth="0.8" strokeDasharray="3 2" />
        </g>}

        {/* X-axis */}
        <text x={pad.l} y={height - 2} fill={C.t0} fontSize="7" textAnchor="start">{min}</text>
        <text x={width - pad.r} y={height - 2} fill={C.t0} fontSize="7" textAnchor="end">{max}</text>
      </svg>
    </div>
  );
}
