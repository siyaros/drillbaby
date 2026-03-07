import { C } from '../../theme';

export default function DepthPlot({ title, series, xLabel, width = 340, height = 440 }) {
  if (!series || !series.length || !series[0].data || !series[0].data.length) {
    return (
      <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 20,
        width: width, height: height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.t0, fontSize: 12 }}>No data - run simulation</span>
      </div>
    );
  }

  var depths = series[0].depths || [];
  var p = { t: 28, b: 24, l: 48, r: 10 };
  var w = width - p.l - p.r;
  var h = height - p.t - p.b;

  var allV = [];
  series.forEach(function (s) { allV = allV.concat(s.data); });
  var xMin = Math.min.apply(null, allV);
  var xMax = Math.max.apply(null, allV);
  var xR = xMax - xMin || 1;
  var dMax = Math.max.apply(null, depths);

  function toX(v) { return p.l + ((v - xMin) / xR) * w; }
  function toY(d) { return p.t + (d / dMax) * h; }

  // Drilling window shading
  var poreS = series.find(function (s) { return s.id === 'pore'; });
  var fracS = series.find(function (s) { return s.id === 'frac'; });
  var winPath = '';
  if (poreS && fracS && poreS.data.length === fracS.data.length) {
    var fwd = poreS.data.map(function (v, i) { return toX(v) + ',' + toY(depths[i]); }).join(' ');
    var rev = fracS.data.slice().reverse().map(function (v, i) {
      return toX(v) + ',' + toY(depths[depths.length - 1 - i]);
    }).join(' ');
    winPath = fwd + ' ' + rev;
  }

  var gridLines = [];
  [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (f, i) {
    gridLines.push(
      <line key={'gy' + i} x1={p.l} x2={width - p.r} y1={p.t + f * h} y2={p.t + f * h} stroke={C.border} strokeWidth="0.5" />
    );
    gridLines.push(
      <text key={'gt' + i} x={p.l - 5} y={p.t + f * h + 3} fill={C.t0} fontSize="8" textAnchor="end">{Math.round(dMax * f)}</text>
    );
  });

  var paths = series.map(function (s) {
    var pts = s.data.map(function (v, i) { return toX(v) + ',' + toY(depths[i]); }).join(' ');
    return <polyline key={s.id} points={pts} fill="none" stroke={s.color}
      strokeWidth={s.primary ? 2 : 1.2} strokeDasharray={s.dash ? '4 3' : ''} />;
  });

  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, overflow: 'hidden' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={'wg-' + title.replace(/\s/g, '')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.green} stopOpacity="0.06" />
            <stop offset="100%" stopColor={C.green} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines}
        {winPath && <polygon points={winPath} fill={'url(#wg-' + title.replace(/\s/g, '') + ')'} />}
        {paths}
        <text x={width / 2} y={16} fill={C.t2} fontSize="11" fontWeight="700" textAnchor="middle">{title}</text>
        <text x={width / 2} y={height - 5} fill={C.t0} fontSize="8" textAnchor="middle">{xLabel}</text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderTop: '1px solid ' + C.border }}>
        {series.map(function (s) {
          return <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 2, background: s.color, borderRadius: 1 }} />
            <span style={{ fontSize: 8, color: C.t1 }}>{s.label}</span>
          </div>;
        })}
      </div>
    </div>
  );
}
