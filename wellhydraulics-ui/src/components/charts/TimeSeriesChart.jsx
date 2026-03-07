import { useState } from 'react';
import { C } from '../../theme';

export default function TimeSeriesChart({ height = 200, data }) {
  var defaultTraces = [
    { id: 'Pa', label: 'BHP', color: C.blue, key: 'Pa', unit: 'psi', vis: true },
    { id: 'Pp', label: 'SPP', color: C.cyan, key: 'Pp', unit: 'psi', vis: true },
    { id: 'Ta', label: 'BHT', color: C.red, key: 'Ta', unit: 'F', vis: false },
    { id: 'Va', label: 'An. Vel', color: C.amber, key: 'Va', unit: 'fpm', vis: false },
  ];

  var [vis, setVis] = useState(function () {
    var obj = {};
    defaultTraces.forEach(function (t) { obj[t.id] = t.vis; });
    return obj;
  });

  // If no time-series data, show depth-profile as pseudo-time
  var plotData = data || [];
  if (!plotData.length) {
    return (
      <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 20,
        height: height + 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.t0, fontSize: 12 }}>No time data - run simulation</span>
      </div>
    );
  }

  var W = 880, H = height;
  var pad = { t: 20, b: 20, l: 52, r: 52 };
  var w = W - pad.l - pad.r;
  var h = H - pad.t - pad.b;

  var active = defaultTraces.filter(function (t) { return vis[t.id]; });
  var allV = [];
  active.forEach(function (t) {
    plotData.forEach(function (d) { if (d[t.key] != null) allV.push(d[t.key]); });
  });

  var yMin = allV.length ? Math.min.apply(null, allV) : 0;
  var yMax = allV.length ? Math.max.apply(null, allV) : 1;
  var yR = yMax - yMin || 1;
  var nPts = plotData.length;

  function toX(i) { return pad.l + (i / (nPts - 1)) * w; }
  function toY(v) { return pad.t + h - ((v - yMin) / yR) * h; }

  var gridLines = [];
  [0, 0.25, 0.5, 0.75, 1].forEach(function (f, i) {
    gridLines.push(<line key={'h' + i} x1={pad.l} x2={W - pad.r} y1={pad.t + f * h} y2={pad.t + f * h} stroke={C.border} strokeWidth="0.4" />);
  });

  var traces = active.map(function (t) {
    var pts = plotData.map(function (d, i) {
      return toX(i) + ',' + toY(d[t.key] || 0);
    }).join(' ');
    return <polyline key={t.id} points={pts} fill="none" stroke={t.color} strokeWidth="1.5" />;
  });

  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderBottom: '1px solid ' + C.border, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginRight: 8 }}>DEPTH PROFILE</span>
        {defaultTraces.map(function (t) {
          return <button key={t.id}
            onClick={function () { setVis(function (v) { var nv = Object.assign({}, v); nv[t.id] = !nv[t.id]; return nv; }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4,
              background: vis[t.id] ? t.color + '15' : 'transparent',
              border: '1px solid ' + (vis[t.id] ? t.color + '40' : C.border), cursor: 'pointer',
            }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: vis[t.id] ? t.color : C.t0 }} />
            <span style={{ fontSize: 9, color: vis[t.id] ? t.color : C.t0, fontWeight: 600 }}>{t.label}</span>
          </button>;
        })}
      </div>
      <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block', width: '100%', height: H }}>
        {gridLines}
        {traces}
        {/* Y axis labels */}
        <text x={pad.l - 4} y={pad.t + 4} fill={C.t0} fontSize="8" textAnchor="end">{yMax.toFixed(0)}</text>
        <text x={pad.l - 4} y={pad.t + h + 3} fill={C.t0} fontSize="8" textAnchor="end">{yMin.toFixed(0)}</text>
      </svg>
    </div>
  );
}
