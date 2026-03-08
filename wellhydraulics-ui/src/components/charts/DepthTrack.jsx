import { useState, useRef } from 'react';
import { C } from '../../theme';

export default function DepthTrack({
  title, unit, traces, depths, xMin, xMax,
  width = 140, height = 500, hdr = 58,
  showDepthAxis = false, fillBetween = null, currentValues = [],
}) {
  var stHover = useState(null);
  var hover = stHover[0], setHover = stHover[1];
  var svgRef = useRef(null);

  if (!traces || !traces.length || !depths || !depths.length) {
    return (
      <div style={{ width: width, height: height + hdr, background: C.bg2,
        borderRight: '1px solid ' + C.border, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: C.t0, fontSize: 9 }}>No data</span>
      </div>
    );
  }

  var pad = { t: 0, b: 16, l: showDepthAxis ? 36 : 4, r: 4 };
  var w = width - pad.l - pad.r;
  var h = height - pad.t - pad.b;
  var dMin = depths[0];
  var dMax = depths[depths.length - 1];
  var xR = (xMax - xMin) || 1;

  function toX(v) { return pad.l + ((v - xMin) / xR) * w; }
  function toY(d) { return pad.t + ((d - dMin) / (dMax - dMin || 1)) * h; }
  function fromY(py) { return dMin + ((py - pad.t) / h) * (dMax - dMin); }

  // Find nearest depth index for a given pixel Y
  function nearestIdx(py) {
    var d = fromY(py);
    var best = 0;
    var bestDist = Infinity;
    for (var i = 0; i < depths.length; i++) {
      var dist = Math.abs(depths[i] - d);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  function handleMouseMove(e) {
    var rect = svgRef.current.getBoundingClientRect();
    var py = e.clientY - rect.top;
    if (py < pad.t || py > pad.t + h) { setHover(null); return; }
    var idx = nearestIdx(py);
    var vals = traces.map(function (tr) {
      return { label: tr.label, color: tr.color, value: tr.data[idx] };
    });
    setHover({ y: toY(depths[idx]), depth: depths[idx], values: vals });
  }

  function handleMouseLeave() { setHover(null); }

  // Grid
  var grids = [];
  var nYGrid = 6;
  for (var gi = 0; gi <= nYGrid; gi++) {
    var gd = dMin + (dMax - dMin) * gi / nYGrid;
    var gy = toY(gd);
    grids.push(<line key={'gy' + gi} x1={pad.l} x2={width - pad.r} y1={gy} y2={gy} stroke={C.border} strokeWidth="0.4" />);
    if (showDepthAxis) {
      grids.push(<text key={'gt' + gi} x={pad.l - 4} y={gy + 3} fill={C.t0} fontSize="8" textAnchor="end">{Math.round(gd)}</text>);
    }
  }
  for (var vi = 0; vi <= 4; vi++) {
    var vx = pad.l + w * vi / 4;
    grids.push(<line key={'vg' + vi} x1={vx} x2={vx} y1={pad.t} y2={pad.t + h} stroke={C.border} strokeWidth="0.3" />);
  }

  // Fill between traces
  var fillPath = null;
  if (fillBetween && traces[fillBetween[0]] && traces[fillBetween[1]]) {
    var t1 = traces[fillBetween[0]].data;
    var t2 = traces[fillBetween[1]].data;
    var fwd = t1.map(function (v, i) { return toX(v) + ',' + toY(depths[i]); }).join(' ');
    var rev = t2.slice().reverse().map(function (v, i) {
      return toX(v) + ',' + toY(depths[depths.length - 1 - i]);
    }).join(' ');
    fillPath = <polygon points={fwd + ' ' + rev} fill={C.green} opacity="0.06" />;
  }

  // Trace paths
  var paths = traces.map(function (tr, ti) {
    var pts = tr.data.map(function (v, i) { return toX(v) + ',' + toY(depths[i]); }).join(' ');
    return <polyline key={ti} points={pts} fill="none" stroke={tr.color} strokeWidth={1.5} strokeDasharray={tr.dash ? '3 2' : ''} />;
  });

  // X-axis labels
  var xLabels = [];
  xLabels.push(<text key="xmin" x={pad.l} y={height - 2} fill={C.t0} fontSize="7" textAnchor="start">{xMin}</text>);
  xLabels.push(<text key="xmax" x={width - pad.r} y={height - 2} fill={C.t0} fontSize="7" textAnchor="end">{xMax}</text>);

  return (
    <div style={{ width: width, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      {/* Header */}
      <div style={{ height: hdr, padding: '4px 6px', borderBottom: '1px solid ' + C.border, overflow: 'hidden' }}>
        {hover ? (
          <div>
            <div style={{ fontSize: 8, color: C.amber, fontWeight: 700 }}>Depth: {hover.depth.toFixed(0)} ft</div>
            {hover.values.map(function (v, i) {
              return <div key={i} style={{ fontSize: 8, color: v.color, lineHeight: 1.3 }}>
                {v.label}: <span style={{ fontWeight: 700 }}>{v.value != null ? v.value.toFixed(2) : '---'}</span>
              </div>;
            })}
          </div>
        ) : (
          <div>
            {currentValues.map(function (cv, i) {
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', lineHeight: 1.3 }}>
                <span style={{ fontSize: 8, color: cv.color, fontWeight: 700 }}>{cv.label}</span>
                <span style={{ fontSize: 8, color: cv.color }}>{unit}</span>
              </div>;
            })}
            {currentValues.map(function (cv, i) {
              return <div key={'v' + i} style={{ fontSize: 9, color: cv.color }}>
                <span style={{ fontSize: 7, color: C.t0 }}>{xMin} </span>
                <span style={{ fontWeight: 700 }}>{cv.value}</span>
              </div>;
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        {grids}
        {fillPath}
        {paths}
        {xLabels}

        {/* Crosshair */}
        {hover && <g>
          <line x1={pad.l} x2={width - pad.r} y1={hover.y} y2={hover.y} stroke={C.amber} strokeWidth="0.8" strokeDasharray="3 2" />
          {hover.values.map(function (v, i) {
            if (v.value == null) return null;
            var cx = toX(v.value);
            return <circle key={i} cx={cx} cy={hover.y} r={3} fill={v.color} stroke={C.bg} strokeWidth="1" />;
          })}
        </g>}
      </svg>
    </div>
  );
}
