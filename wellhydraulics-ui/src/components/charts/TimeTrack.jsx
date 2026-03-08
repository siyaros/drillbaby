import { useState, useRef } from 'react';
import { C } from '../../theme';

export default function TimeTrack({
  traces = [], min: minProp = 0, max: maxProp = 100,
  width = 100, height = 500, hdr = 78,
}) {
  var stVis = useState(function () {
    var obj = {};
    traces.forEach(function (t) { obj[t.id] = true; });
    return obj;
  });
  var vis = stVis[0], setVis = stVis[1];

  var stZoomX = useState([minProp, maxProp]);
  var zoomX = stZoomX[0], setZoomX = stZoomX[1];
  var stHover = useState(null);
  var hover = stHover[0], setHover = stHover[1];
  var stDrag = useState(null);
  var drag = stDrag[0], setDrag = stDrag[1];
  var svgRef = useRef(null);

  var prevMin = useRef(minProp);
  var prevMax = useRef(maxProp);
  if (minProp !== prevMin.current || maxProp !== prevMax.current) {
    prevMin.current = minProp; prevMax.current = maxProp;
    setZoomX([minProp, maxProp]);
  }

  function toggle(id) {
    setVis(function (v) {
      var nv = {};
      Object.keys(v).forEach(function (k) { nv[k] = v[k]; });
      nv[id] = !nv[id];
      return nv;
    });
  }

  var pad = { t: 0, b: 20, l: 6, r: 6 };
  var w = width - pad.l - pad.r;
  var h = height - pad.t - pad.b;
  var xMin = zoomX[0], xMax = zoomX[1];
  var xR = (xMax - xMin) || 1;

  function toX(v) { return pad.l + (((v || 0) - xMin) / xR) * w; }
  function fromX(px) { return xMin + ((px - pad.l) / w) * xR; }

  var activeTraces = traces.filter(function (t) { return vis[t.id]; });

  function handleWheel(e) {
    e.preventDefault();
    var rect = svgRef.current.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var factor = e.deltaY > 0 ? 1.15 : 0.87;
    var pivot = fromX(px);
    setZoomX([pivot - (pivot - xMin) * factor, pivot + (xMax - pivot) * factor]);
  }
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    setDrag({ startX: e.clientX, origZoom: [xMin, xMax] });
  }
  function handleMouseMove(e) {
    var rect = svgRef.current.getBoundingClientRect();
    var px = e.clientX - rect.left;
    if (drag) {
      var dx = e.clientX - drag.startX;
      var xShift = -(dx / w) * (drag.origZoom[1] - drag.origZoom[0]);
      setZoomX([drag.origZoom[0] + xShift, drag.origZoom[1] + xShift]);
      setHover(null);
      return;
    }
    if (px < pad.l || px > pad.l + w) { setHover(null); return; }
    setHover({ x: px, value: fromX(px) });
  }
  function handleMouseUp() { setDrag(null); }
  function handleMouseLeave() { setHover(null); setDrag(null); }
  function handleDblClick() { setZoomX([minProp, maxProp]); }

  function handleScaleChange(which, val) {
    var num = parseFloat(val);
    if (isNaN(num)) return;
    var nx = [zoomX[0], zoomX[1]];
    nx[which] = num;
    if (nx[0] < nx[1]) setZoomX(nx);
  }

  var isZoomed = (xMin !== minProp || xMax !== maxProp);
  var inputStyle = { width: 40, background: C.bgIn, border: '1px solid ' + C.border,
    borderRadius: 3, padding: '1px 3px', color: C.t2, fontSize: 9, outline: 'none', textAlign: 'center' };

  return (
    <div style={{ width: width, flexShrink: 0, background: C.bg2, borderRight: '1px solid ' + C.border }}>
      {/* Header */}
      <div style={{ height: hdr, padding: '3px 5px', borderBottom: '1px solid ' + C.border, overflow: 'hidden', position: 'relative' }}>
        {isZoomed && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8, color: C.amber, cursor: 'pointer', fontWeight: 700 }}
          onClick={handleDblClick}>RESET</span>}
        {traces.map(function (t) {
          var active = vis[t.id];
          return <div key={t.id} onClick={function () { toggle(t.id); }}
            style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer',
              opacity: active ? 1 : 0.35, lineHeight: 1.4 }}>
            <span style={{ fontSize: 9, color: t.color, fontWeight: 700,
              textDecoration: active ? 'none' : 'line-through' }}>{t.label}</span>
            <span style={{ fontSize: 9, color: t.color }}>{t.unit}</span>
          </div>;
        })}
        {hover ? (
          <div style={{ fontSize: 10, fontWeight: 800, color: C.amber, marginTop: 2 }}>
            {hover.value.toFixed(1)}
          </div>
        ) : (
          <div>
            <div style={{ marginTop: 1 }}>
              {activeTraces.map(function (t) {
                return <span key={t.id} style={{ fontSize: 10, fontWeight: 800, color: t.color, marginRight: 6 }}>
                  {t.value != null ? (typeof t.value === 'number' ? t.value.toFixed(1) : t.value) : '---'}
                </span>;
              })}
            </div>
            {/* Editable scale */}
            <div style={{ display: 'flex', gap: 3, marginTop: 2, alignItems: 'center' }}>
              <input style={inputStyle} defaultValue={xMin.toFixed(1)} key={'tmin' + xMin.toFixed(1)}
                onBlur={function (e) { handleScaleChange(0, e.target.value); }}
                onKeyDown={function (e) { if (e.key === 'Enter') e.target.blur(); }} />
              <span style={{ fontSize: 8, color: C.t0 }}>-</span>
              <input style={inputStyle} defaultValue={xMax.toFixed(1)} key={'tmax' + xMax.toFixed(1)}
                onBlur={function (e) { handleScaleChange(1, e.target.value); }}
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
          <clipPath id={'tclip-' + traces.map(function (t) { return t.id; }).join('')}>
            <rect x={pad.l} y={pad.t} width={w} height={h} />
          </clipPath>
        </defs>

        {/* Grid with tick labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(function (f, i) {
          var x = pad.l + w * f;
          var tickVal = xMin + xR * f;
          return <g key={'v' + i}>
            <line x1={x} x2={x} y1={pad.t} y2={pad.t + h} stroke={C.border} strokeWidth="0.3" />
            <text x={x} y={height - 4} fill={C.t1} fontSize="9" textAnchor="middle">
              {tickVal > 1000 ? Math.round(tickVal) : tickVal.toFixed(1)}
            </text>
          </g>;
        })}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(function (f, i) {
          var y = pad.t + h * f;
          return <line key={'h' + i} x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={C.border} strokeWidth="0.3" />;
        })}

        <g clipPath={'url(#tclip-' + traces.map(function (t) { return t.id; }).join('') + ')'}>
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
        </g>

        {/* Crosshair */}
        {hover && !drag && <line x1={hover.x} x2={hover.x} y1={pad.t} y2={pad.t + h}
          stroke={C.amber} strokeWidth="0.8" strokeDasharray="3 2" />}
      </svg>
    </div>
  );
}
