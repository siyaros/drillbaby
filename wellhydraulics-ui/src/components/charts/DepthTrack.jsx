import { useState, useRef } from 'react';
import { C } from '../../theme';

export default function DepthTrack({
  title, unit, traces, depths, xMin: xMinProp, xMax: xMaxProp,
  width = 140, height = 500, hdr = 78,
  showDepthAxis = false, fillBetween = null, currentValues = [],
}) {
  var dMinFull = depths && depths.length ? depths[0] : 0;
  var dMaxFull = depths && depths.length ? depths[depths.length - 1] : 1;

  var stZoomX = useState([xMinProp, xMaxProp]);
  var zoomX = stZoomX[0], setZoomX = stZoomX[1];
  var stZoomY = useState([dMinFull, dMaxFull]);
  var zoomY = stZoomY[0], setZoomY = stZoomY[1];
  var stHover = useState(null);
  var hover = stHover[0], setHover = stHover[1];
  var stDrag = useState(null);
  var drag = stDrag[0], setDrag = stDrag[1];
  var svgRef = useRef(null);

  var prevXMin = useRef(xMinProp);
  var prevXMax = useRef(xMaxProp);
  var prevDMax = useRef(dMaxFull);
  if (xMinProp !== prevXMin.current || xMaxProp !== prevXMax.current) {
    prevXMin.current = xMinProp; prevXMax.current = xMaxProp;
    setZoomX([xMinProp, xMaxProp]);
  }
  if (dMaxFull !== prevDMax.current) {
    prevDMax.current = dMaxFull;
    setZoomY([dMinFull, dMaxFull]);
  }

  if (!traces || !traces.length || !depths || !depths.length) {
    return (
      <div style={{ width: width, height: height + hdr, background: C.bg2,
        borderRight: '1px solid ' + C.border, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: C.t0, fontSize: 10 }}>No data</span>
      </div>
    );
  }

  var depthAxisW = showDepthAxis ? 42 : 6;
  var pad = { t: 0, b: 20, l: depthAxisW, r: 6 };
  var w = width - pad.l - pad.r;
  var h = height - pad.t - pad.b;
  var xMin = zoomX[0], xMax = zoomX[1];
  var dMin = zoomY[0], dMax = zoomY[1];
  var xR = (xMax - xMin) || 1;
  var dR = (dMax - dMin) || 1;

  function toX(v) { return pad.l + ((v - xMin) / xR) * w; }
  function toY(d) { return pad.t + ((d - dMin) / dR) * h; }
  function fromY(py) { return dMin + ((py - pad.t) / h) * dR; }
  function fromX(px) { return xMin + ((px - pad.l) / w) * xR; }

  function nearestIdx(py) {
    var d = fromY(py);
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < depths.length; i++) {
      var dist = Math.abs(depths[i] - d);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  function handleWheel(e) {
    e.preventDefault();
    var rect = svgRef.current.getBoundingClientRect();
    var py = e.clientY - rect.top;
    var px = e.clientX - rect.left;
    var factor = e.deltaY > 0 ? 1.15 : 0.87;
    if (e.shiftKey) {
      var xPivot = fromX(px);
      setZoomX([xPivot - (xPivot - xMin) * factor, xPivot + (xMax - xPivot) * factor]);
    } else {
      var dPivot = fromY(py);
      setZoomY([Math.max(dMinFull * 0.5, dPivot - (dPivot - dMin) * factor),
                Math.min(dMaxFull * 1.5, dPivot + (dMax - dPivot) * factor)]);
    }
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    setDrag({ startX: e.clientX, startY: e.clientY, origZoomX: [xMin, xMax], origZoomY: [dMin, dMax] });
  }
  function handleMouseMove(e) {
    var rect = svgRef.current.getBoundingClientRect();
    var py = e.clientY - rect.top;
    if (drag) {
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      var xShift = -(dx / w) * (drag.origZoomX[1] - drag.origZoomX[0]);
      var yShift = -(dy / h) * (drag.origZoomY[1] - drag.origZoomY[0]);
      setZoomX([drag.origZoomX[0] + xShift, drag.origZoomX[1] + xShift]);
      setZoomY([drag.origZoomY[0] + yShift, drag.origZoomY[1] + yShift]);
      setHover(null);
      return;
    }
    if (py < pad.t || py > pad.t + h) { setHover(null); return; }
    var idx = nearestIdx(py);
    var vals = traces.map(function (tr) {
      return { label: tr.label, color: tr.color, value: tr.data[idx] };
    });
    setHover({ y: toY(depths[idx]), depth: depths[idx], values: vals });
  }
  function handleMouseUp() { setDrag(null); }
  function handleMouseLeave() { setHover(null); setDrag(null); }
  function handleDblClick() { setZoomX([xMinProp, xMaxProp]); setZoomY([dMinFull, dMaxFull]); }

  // Editable scale inputs
  function handleScaleChange(axis, which, val) {
    var num = parseFloat(val);
    if (isNaN(num)) return;
    if (axis === 'x') {
      var nx = [zoomX[0], zoomX[1]];
      nx[which] = num;
      if (nx[0] < nx[1]) setZoomX(nx);
    } else {
      var ny = [zoomY[0], zoomY[1]];
      ny[which] = num;
      if (ny[0] < ny[1]) setZoomY(ny);
    }
  }

  // Grid
  var grids = [];
  var nYGrid = 6;
  for (var gi = 0; gi <= nYGrid; gi++) {
    var gd = dMin + dR * gi / nYGrid;
    var gy = toY(gd);
    grids.push(<line key={'gy' + gi} x1={pad.l} x2={width - pad.r} y1={gy} y2={gy} stroke={C.border} strokeWidth="0.4" />);
    if (showDepthAxis) {
      grids.push(<text key={'gt' + gi} x={pad.l - 5} y={gy + 4} fill={C.t1} fontSize="10" textAnchor="end">{Math.round(gd)}</text>);
    }
  }
  // X grid with tick labels at bottom
  for (var vi = 0; vi <= 4; vi++) {
    var vx = pad.l + w * vi / 4;
    var tickVal = xMin + xR * vi / 4;
    grids.push(<line key={'vg' + vi} x1={vx} x2={vx} y1={pad.t} y2={pad.t + h} stroke={C.border} strokeWidth="0.3" />);
    grids.push(<text key={'xt' + vi} x={vx} y={height - 4} fill={C.t1} fontSize="9" textAnchor="middle">
      {tickVal > 1000 ? Math.round(tickVal) : tickVal.toFixed(1)}
    </text>);
  }

  // Fill between
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

  var paths = traces.map(function (tr, ti) {
    var pts = tr.data.map(function (v, i) { return toX(v) + ',' + toY(depths[i]); }).join(' ');
    return <polyline key={ti} points={pts} fill="none" stroke={tr.color} strokeWidth={1.5}
      strokeDasharray={tr.dash ? '3 2' : ''} />;
  });

  var isZoomed = (xMin !== xMinProp || xMax !== xMaxProp || dMin !== dMinFull || dMax !== dMaxFull);
  var inputStyle = { width: 44, background: C.bgIn, border: '1px solid ' + C.border,
    borderRadius: 3, padding: '1px 3px', color: C.t2, fontSize: 9, outline: 'none', textAlign: 'center' };

  return (
    <div style={{ width: width, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      {/* Header */}
      <div style={{ height: hdr, padding: '3px 5px', borderBottom: '1px solid ' + C.border, overflow: 'hidden', position: 'relative' }}>
        {isZoomed && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8, color: C.amber, cursor: 'pointer', fontWeight: 700 }}
          onClick={handleDblClick}>RESET</span>}
        {hover ? (
          <div>
            <div style={{ fontSize: 9, color: C.amber, fontWeight: 700 }}>Depth: {hover.depth.toFixed(0)} ft</div>
            {hover.values.map(function (v, i) {
              return <div key={i} style={{ fontSize: 9, color: v.color, lineHeight: 1.4 }}>
                {v.label}: <span style={{ fontWeight: 700 }}>{v.value != null ? v.value.toFixed(2) : '---'}</span>
              </div>;
            })}
          </div>
        ) : (
          <div>
            {currentValues.map(function (cv, i) {
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', lineHeight: 1.4 }}>
                <span style={{ fontSize: 9, color: cv.color, fontWeight: 700 }}>{cv.label}</span>
                <span style={{ fontSize: 9, color: cv.color }}>{unit}</span>
              </div>;
            })}
            {/* Editable scale: X-axis */}
            <div style={{ display: 'flex', gap: 3, marginTop: 3, alignItems: 'center' }}>
              <input style={inputStyle} defaultValue={xMin.toFixed(1)} key={'xmin' + xMin.toFixed(1)}
                onBlur={function (e) { handleScaleChange('x', 0, e.target.value); }}
                onKeyDown={function (e) { if (e.key === 'Enter') e.target.blur(); }} />
              <span style={{ fontSize: 8, color: C.t0 }}>-</span>
              <input style={inputStyle} defaultValue={xMax.toFixed(1)} key={'xmax' + xMax.toFixed(1)}
                onBlur={function (e) { handleScaleChange('x', 1, e.target.value); }}
                onKeyDown={function (e) { if (e.key === 'Enter') e.target.blur(); }} />
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <svg ref={svgRef} width={width} height={height}
        style={{ display: 'block', cursor: drag ? 'grabbing' : 'crosshair' }}
        onWheel={handleWheel} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onDoubleClick={handleDblClick}>
        <defs>
          <clipPath id={'clip-' + title.replace(/\s/g, '')}>
            <rect x={pad.l} y={pad.t} width={w} height={h} />
          </clipPath>
        </defs>
        <g clipPath={'url(#clip-' + title.replace(/\s/g, '') + ')'}>
          {fillPath}
          {paths}
        </g>
        {grids}
        {/* Crosshair */}
        {hover && !drag && <g>
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
