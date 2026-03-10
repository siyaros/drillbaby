import { useState } from 'react';
import { C } from '../theme';

var MODES = [
  { id: 'drilling', label: 'Drilling', color: '#00cc66', desc: 'Forward circulation — flow through MPD choke' },
  { id: 'connection', label: 'Connection', color: '#ffaa22', desc: 'Pumps off — buffer holds backpressure' },
  { id: 'circulation', label: 'Circulation', color: '#00ccdd', desc: 'Circulating — choke fully open' },
  { id: 'wellcontrol', label: 'Well Control', color: '#cc3344', desc: 'Dual choke — both A and B active' },
];

var GREEN = '#00cc66';
var GLOW = '#00cc6650';
var PIPE = '#1e2d45';
var RED = '#cc3344';

// Default MPD equipment chain (between RCD output and return to tanks)
var DEFAULT_MPD_CHAIN = [
  { id: 'buffer', type: 'buffer', label: 'Buffer Manifold', removable: true },
  { id: 'jc', type: 'jc', label: 'Junk Catcher', removable: true },
  { id: 'chokes', type: 'chokes', label: 'Choke Manifold', removable: false },
  { id: 'fm', type: 'fm', label: 'Flow Meter', removable: true },
  { id: 'mgs', type: 'mgs', label: 'MGS', removable: true },
];

var ADDABLE = [
  { type: 'jc', label: 'Junk Catcher' },
  { type: 'fm', label: 'Coriolis Flow Meter' },
  { type: 'buffer', label: 'Buffer Manifold' },
  { type: 'separator', label: 'Gas Separator' },
  { type: 'valve', label: 'Manual Valve' },
  { type: 'tank', label: 'Trip Tank' },
];

function getFlow(mode) {
  return {
    pumpOn: mode === 'drilling' || mode === 'circulation',
    flowOut: true,
    chkA: { on: true, pct: mode === 'drilling' ? 83 : mode === 'connection' ? 95 : mode === 'circulation' ? 100 : 65 },
    chkB: { on: mode === 'wellcontrol', pct: mode === 'wellcontrol' ? 28 : 0 },
    boostOn: mode === 'connection',
  };
}

// SVG components
function PipePath({ d, on, w }) {
  return <g>
    {on && <path d={d} fill="none" stroke={GLOW} strokeWidth={(w || 3.5) + 5} strokeLinecap="round" strokeLinejoin="round" />}
    <path d={d} fill="none" stroke={on ? GREEN : PIPE} strokeWidth={w || 3.5} strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}

function ValveSym({ x, y, label, open, flow, s }) {
  s = s || 9;
  var col = open ? (flow ? GREEN : C.t1) : C.t0;
  var fl = open ? (flow ? GREEN + '30' : C.t1 + '10') : C.t0 + '10';
  return <g>
    <polygon points={(x - s) + ',' + (y - s) + ' ' + x + ',' + y + ' ' + (x - s) + ',' + (y + s)} fill={fl} stroke={col} strokeWidth="1.2" />
    <polygon points={(x + s) + ',' + (y - s) + ' ' + x + ',' + y + ' ' + (x + s) + ',' + (y + s)} fill={fl} stroke={col} strokeWidth="1.2" />
    {!open && <g>
      <line x1={x - s + 2} y1={y - s + 2} x2={x + s - 2} y2={y + s - 2} stroke={RED} strokeWidth="1.5" opacity="0.8" />
      <line x1={x + s - 2} y1={y - s + 2} x2={x - s + 2} y2={y + s - 2} stroke={RED} strokeWidth="1.5" opacity="0.8" />
    </g>}
    {label && <text x={x} y={y - s - 4} fill={col} fontSize="9" textAnchor="middle" fontWeight="700">{label}</text>}
  </g>;
}

function BoxEq({ x, y, w, h, label, sub, color, on }) {
  var cl = color || C.t1;
  return <g>
    <rect x={x} y={y} width={w || 90} height={h || 38} rx="5" fill={C.bg1}
      stroke={on ? cl : C.border} strokeWidth={on ? 1.8 : 1}
      style={on ? { filter: 'drop-shadow(0 0 4px ' + cl + '35)' } : {}} />
    <text x={x + (w || 90) / 2} y={y + (h || 38) / 2 + (sub ? -2 : 5)} fill={on ? cl : C.t0}
      fontSize="11" textAnchor="middle" fontWeight="700">{label}</text>
    {sub && <text x={x + (w || 90) / 2} y={y + (h || 38) / 2 + 12} fill={C.t0}
      fontSize="9" textAnchor="middle">{sub}</text>}
  </g>;
}

function ChokeBox({ x, y, label, on, pct }) {
  var col = on ? GREEN : C.t0;
  return <g>
    <rect x={x - 28} y={y - 16} width={56} height={32} rx="4" fill={C.bg1}
      stroke={col} strokeWidth={on ? 2 : 1}
      style={on ? { filter: 'drop-shadow(0 0 4px ' + col + '40)' } : {}} />
    <text x={x} y={y - 2} fill={col} fontSize="10" textAnchor="middle" fontWeight="800">{label}</text>
    <text x={x} y={y + 12} fill={on ? col : C.t0} fontSize="9" textAnchor="middle" fontWeight="700">
      {on ? pct + '%' : 'STBY'}</text>
  </g>;
}

function FMSym({ x, y, label, on }) {
  var col = on ? '#00ccdd' : C.t0;
  return <g>
    <circle cx={x} cy={y} r={16} fill={C.bg2} stroke={col} strokeWidth={on ? 1.5 : 1}
      style={on ? { filter: 'drop-shadow(0 0 3px ' + col + '40)' } : {}} />
    <text x={x} y={y + 4} fill={col} fontSize="10" textAnchor="middle" fontWeight="700">{label}</text>
  </g>;
}

function Sensor({ x, y, label }) {
  return <g>
    <circle cx={x} cy={y} r={12} fill={C.bg1} stroke={C.t0} strokeWidth="0.8" />
    <text x={x} y={y + 4} fill={C.t1} fontSize="8" textAnchor="middle" fontWeight="600">{label}</text>
  </g>;
}

function Readout({ x, y, label, value, unit, color }) {
  return <g>
    <rect x={x} y={y} width={82} height={34} rx="4" fill={C.bg1} stroke={C.border} strokeWidth="0.8" />
    <text x={x + 5} y={y + 12} fill={color || C.t1} fontSize="9" fontWeight="600">{label}</text>
    <text x={x + 5} y={y + 27} fill={color || C.t3} fontSize="13" fontWeight="800">{value}</text>
    <text x={x + 76} y={y + 27} fill={C.t0} fontSize="8" textAnchor="end">{unit}</text>
  </g>;
}

function Arr({ x, y, dir, on }) {
  if (!on) return null;
  var p = dir === 'r' ? x + ',' + (y - 4) + ' ' + (x + 7) + ',' + y + ' ' + x + ',' + (y + 4)
    : dir === 'd' ? (x - 4) + ',' + y + ' ' + x + ',' + (y + 7) + ' ' + (x + 4) + ',' + y
    : dir === 'u' ? (x - 4) + ',' + y + ' ' + x + ',' + (y - 7) + ' ' + (x + 4) + ',' + y
    : x + ',' + (y - 4) + ' ' + (x - 7) + ',' + y + ' ' + x + ',' + (y + 4);
  return <polygon points={p} fill={GREEN} />;
}

export default function ControlPage() {
  var stMode = useState('drilling');
  var mode = stMode[0], setMode = stMode[1];
  var stChain = useState(DEFAULT_MPD_CHAIN);
  var chain = stChain[0], setChain = stChain[1];
  var stEditor = useState(false);
  var showEditor = stEditor[0], setShowEditor = stEditor[1];
  var stDragIdx = useState(null);
  var dragIdx = stDragIdx[0], setDragIdx = stDragIdx[1];
  var stDragOver = useState(null);
  var dragOver = stDragOver[0], setDragOver = stDragOver[1];

  var fl = getFlow(mode);
  var mc = MODES.find(function (m) { return m.id === mode; }).color;

  // Layout constants
  var W = 1060, H = 460;

  // BOP/RCD stack on left
  var stackX = 50, bopY = 280, rcdY = 220, rcdOutY = 240;

  // Surface equipment row (top)
  var surfY = 40;

  // MPD flow line Y
  var flowY = rcdOutY;

  // MPD chain positioned horizontally from RCD output going right
  var mpdStartX = 200;
  var eqW = 85, eqGap = 25;
  var positions = [];
  var cx = mpdStartX;
  chain.forEach(function (eq, i) {
    if (eq.type === 'chokes') {
      positions.push({ x: cx, w: 180, eq: eq, idx: i });
      cx += 180 + eqGap;
    } else {
      positions.push({ x: cx, w: eqW, eq: eq, idx: i });
      cx += eqW + eqGap;
    }
  });
  var mpdEndX = cx;

  // Drag reorder in sidebar
  function handleDrop(toIdx) {
    if (dragIdx === null || toIdx === dragIdx) { setDragIdx(null); setDragOver(null); return; }
    var nc = chain.slice();
    var item = nc.splice(dragIdx, 1)[0];
    nc.splice(toIdx, 0, item);
    setChain(nc);
    setDragIdx(null); setDragOver(null);
  }

  function removeEquip(idx) {
    if (chain[idx].removable === false) return;
    setChain(chain.filter(function (_, i) { return i !== idx; }));
  }

  function addEquip(type, label) {
    var insertIdx = 0;
    for (var i = 0; i < chain.length; i++) {
      if (chain[i].type === 'chokes') { insertIdx = i; break; }
    }
    setChain(chain.slice(0, insertIdx).concat([{ id: type + '_' + Date.now(), type: type, label: label, removable: true }]).concat(chain.slice(insertIdx)));
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: '#06090f', fontFamily: "'JetBrains Mono','Fira Code',monospace", color: C.t1 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 20px', background: C.bg1, borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: C.t3, letterSpacing: 2 }}>P&ID CONTROL</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: '4px 14px', borderRadius: 4, border: '2px solid ' + mc,
            background: mc + '15', boxShadow: '0 0 8px ' + mc + '30' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: mc, letterSpacing: 2 }}>
              {MODES.find(function (m) { return m.id === mode; }).label.toUpperCase()}</span>
          </div>
          <button onClick={function () { setShowEditor(!showEditor); }} style={{
            padding: '5px 12px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: showEditor ? '#3388ff20' : 'transparent',
            border: '1px solid ' + (showEditor ? '#3388ff' : C.border),
            color: showEditor ? '#3388ff' : C.t0 }}>{showEditor ? 'CLOSE' : 'EDIT P&ID'}</button>
        </div>
      </div>

      {/* Mode bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 20px',
        background: C.bg1, borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: C.t0, fontWeight: 600, marginRight: 6 }}>OPERATION:</span>
        {MODES.map(function (m) { var a = mode === m.id; return <button key={m.id}
          onClick={function () { setMode(m.id); }} style={{
            padding: '6px 16px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: a ? m.color + '20' : 'transparent', border: '2px solid ' + (a ? m.color : C.border),
            color: a ? m.color : C.t0, boxShadow: a ? '0 0 8px ' + m.color + '30' : 'none',
          }}>{m.label.toUpperCase()}</button>; })}
        <span style={{ fontSize: 9, color: C.t0, marginLeft: 14, fontStyle: 'italic' }}>
          {MODES.find(function (m) { return m.id === mode; }).desc}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H}
            style={{ background: '#111822', borderRadius: 8, border: '1px solid ' + C.border }}>

            {/* ===== SURFACE EQUIPMENT (top row) ===== */}
            <BoxEq x={120} y={surfY} w={80} h={34} label="Rig Pumps" color="#3388ff" on={fl.pumpOn} />
            <Sensor x={110} y={surfY + 17} label="F" />
            <Sensor x={110} y={surfY + 42} label="SPP" />

            <BoxEq x={250} y={surfY} w={130} h={34} label="Rig Mud Tanks" color={C.t1} on={true} />
            <BoxEq x={430} y={surfY} w={85} h={34} label="Degasser" color={C.t1} on={fl.flowOut} />

            {/* Shaker */}
            <BoxEq x={550} y={surfY} w={80} h={34} label="Shaker" color={C.t1} on={fl.flowOut} />

            {/* Return pipe: from MPD end → up → along top → to tanks */}
            <PipePath d={'M' + mpdEndX + ',' + flowY + ' L' + mpdEndX + ',' + (surfY + 17) + ' L630,' + (surfY + 17)}
              on={fl.flowOut} w={2.5} />
            <Arr x={mpdEndX} y={surfY + 50} dir="u" on={fl.flowOut} />

            {/* Shaker → Degasser → Tanks */}
            <PipePath d={'M550,' + (surfY + 17) + ' L515,' + (surfY + 17)} on={fl.flowOut} w={2} />
            <PipePath d={'M430,' + (surfY + 17) + ' L380,' + (surfY + 17)} on={fl.flowOut} w={2} />

            {/* Tanks → Pump */}
            <PipePath d={'M250,' + (surfY + 17) + ' L200,' + (surfY + 17)} on={fl.pumpOn} w={2} />

            {/* ===== FLOW IN: Pump → down to well ===== */}
            <PipePath d={'M160,' + (surfY + 34) + ' L160,' + (rcdY - 10) + ' L' + (stackX + 30) + ',' + (rcdY - 10)}
              on={fl.pumpOn} w={3} />
            <Arr x={160} y={surfY + 60} dir="d" on={fl.pumpOn} />
            <text x={170} y={surfY + 55} fill={fl.pumpOn ? GREEN : C.t0} fontSize="10" fontWeight="700">Flow In</text>

            {/* ===== BOP / RCD STACK (left, vertical) ===== */}
            {/* RCD on top */}
            <rect x={stackX - 5} y={rcdY} width={60} height={30} rx="4" fill={C.bg1}
              stroke={fl.flowOut ? '#00ccdd' : C.border} strokeWidth={fl.flowOut ? 1.8 : 1}
              style={fl.flowOut ? { filter: 'drop-shadow(0 0 4px #00ccdd35)' } : {}} />
            <text x={stackX + 25} y={rcdY + 19} fill={fl.flowOut ? '#00ccdd' : C.t0}
              fontSize="12" textAnchor="middle" fontWeight="800">RCD</text>

            {/* BOP below RCD */}
            <rect x={stackX - 5} y={bopY} width={60} height={40} rx="4" fill={C.bg1}
              stroke={C.t1} strokeWidth="1" />
            <text x={stackX + 25} y={bopY + 24} fill={C.t1} fontSize="11" textAnchor="middle" fontWeight="700">BOP</text>

            {/* Vertical pipe connecting BOP to RCD */}
            <PipePath d={'M' + (stackX + 25) + ',' + (rcdY + 30) + ' L' + (stackX + 25) + ',' + bopY}
              on={fl.flowOut} w={3} />

            {/* Pipe going down from BOP (to well, not shown) */}
            <PipePath d={'M' + (stackX + 25) + ',' + (bopY + 40) + ' L' + (stackX + 25) + ',' + (H - 20)}
              on={fl.flowOut} w={2} />
            <text x={stackX + 25} y={H - 8} fill={C.t0} fontSize="8" textAnchor="middle">To Well ↓</text>

            {/* ===== FLOW OUT: RCD → right to MPD system ===== */}
            <PipePath d={'M' + (stackX + 55) + ',' + flowY + ' L' + mpdStartX + ',' + flowY}
              on={fl.flowOut} w={4} />
            <Arr x={stackX + 80} y={flowY} dir="r" on={fl.flowOut} />
            <text x={stackX + 75} y={flowY - 10} fill={fl.flowOut ? GREEN : C.t0}
              fontSize="10" fontWeight="700">Flow Out</text>

            {/* Sensor at RCD outlet */}
            <Sensor x={stackX + 75} y={flowY + 18} label="SBP" />

            {/* ===== MPD EQUIPMENT CHAIN ===== */}
            {positions.map(function (pos, i) {
              var eq = pos.eq;
              var isChokes = eq.type === 'chokes';

              // Pipe from previous
              var pipeEl = null;
              if (i > 0) {
                var prev = positions[i - 1];
                var prevEnd = prev.x + prev.w;
                pipeEl = <PipePath key={'p' + i} d={'M' + prevEnd + ',' + flowY + ' L' + pos.x + ',' + flowY} on={fl.flowOut} />;
              }

              if (isChokes) {
                var chkX = pos.x;
                var aY = flowY - 32, bY = flowY + 32;
                var splitX = chkX + 15, mergeX = chkX + 165;
                return <g key={eq.id}>
                  {pipeEl}
                  {/* Split */}
                  <PipePath d={'M' + chkX + ',' + flowY + ' L' + splitX + ',' + aY} on={fl.chkA.on} />
                  <PipePath d={'M' + chkX + ',' + flowY + ' L' + splitX + ',' + bY} on={fl.chkB.on} />
                  {/* Line A */}
                  <PipePath d={'M' + splitX + ',' + aY + ' L' + (splitX + 20) + ',' + aY} on={fl.chkA.on} />
                  <ValveSym x={splitX + 33} y={aY} label="N1" open={fl.chkA.on} flow={fl.chkA.on} s={8} />
                  <PipePath d={'M' + (splitX + 46) + ',' + aY + ' L' + (splitX + 60) + ',' + aY} on={fl.chkA.on} />
                  <ChokeBox x={splitX + 90} y={aY} label="CHK-A" on={fl.chkA.on} pct={fl.chkA.pct} />
                  <PipePath d={'M' + (splitX + 118) + ',' + aY + ' L' + mergeX + ',' + aY} on={fl.chkA.on} />
                  {/* Line B */}
                  <PipePath d={'M' + splitX + ',' + bY + ' L' + (splitX + 20) + ',' + bY} on={fl.chkB.on} />
                  <ValveSym x={splitX + 33} y={bY} label="N2" open={fl.chkB.on} flow={fl.chkB.on} s={8} />
                  <PipePath d={'M' + (splitX + 46) + ',' + bY + ' L' + (splitX + 60) + ',' + bY} on={fl.chkB.on} />
                  <ChokeBox x={splitX + 90} y={bY} label="CHK-B" on={fl.chkB.on} pct={fl.chkB.pct} />
                  <PipePath d={'M' + (splitX + 118) + ',' + bY + ' L' + mergeX + ',' + bY} on={fl.chkB.on} />
                  {/* Merge */}
                  <PipePath d={'M' + mergeX + ',' + aY + ' L' + mergeX + ',' + flowY} on={fl.chkA.on} />
                  <PipePath d={'M' + mergeX + ',' + bY + ' L' + mergeX + ',' + flowY} on={fl.chkB.on} />
                  <PipePath d={'M' + mergeX + ',' + flowY + ' L' + (chkX + 180) + ',' + flowY} on={fl.flowOut} />
                  <Arr x={mergeX + 8} y={flowY} dir="r" on={fl.flowOut} />
                </g>;
              }

              // Regular equipment
              var eqEl = eq.type === 'fm'
                ? <FMSym x={pos.x + eqW / 2} y={flowY} label="FM" on={fl.flowOut} />
                : <BoxEq x={pos.x} y={flowY - 19} w={eqW} h={38} label={eq.label}
                    color={eq.type === 'buffer' ? (fl.boostOn ? GREEN : C.t1) : eq.type === 'jc' ? '#00ccdd' : C.t1}
                    on={fl.flowOut} />;

              return <g key={eq.id}>
                {pipeEl}
                {eqEl}
                {i > 0 && <Arr x={pos.x - 8} y={flowY} dir="r" on={fl.flowOut} />}
              </g>;
            })}

            {/* Pipe from last item to end */}
            {positions.length > 0 && <PipePath
              d={'M' + (positions[positions.length - 1].x + positions[positions.length - 1].w) + ',' + flowY + ' L' + mpdEndX + ',' + flowY}
              on={fl.flowOut} />}

            {/* Booster pump (connection mode) */}
            {fl.boostOn && chain.some(function (e) { return e.type === 'buffer'; }) && (function () {
              var bufPos = positions.find(function (p) { return p.eq.type === 'buffer'; });
              if (!bufPos) return null;
              var bpY = flowY + 55;
              return <g>
                <BoxEq x={bufPos.x} y={bpY} w={eqW} h={30} label="Boost Pump" color="#3388ff" on={true} />
                <PipePath d={'M' + (bufPos.x + eqW / 2) + ',' + bpY + ' L' + (bufPos.x + eqW / 2) + ',' + (flowY + 19)} on={true} w={2} />
                <Arr x={bufPos.x + eqW / 2} y={flowY + 40} dir="u" on={true} />
              </g>;
            })()}

            {/* Rig choke (bottom right) */}
            <BoxEq x={mpdEndX - 100} y={bopY + 20} w={80} h={34} label="Rig Choke" color={C.t0} on={false} />
            <PipePath d={'M' + (stackX + 55) + ',' + (bopY + 37) + ' L' + (mpdEndX - 100) + ',' + (bopY + 37)} on={false} w={2} />

            {/* ===== READOUTS ===== */}
            <Readout x={W - 150} y={30} label="SBP" value={mode === 'connection' ? '250' : '16'} unit="psi" color={GREEN} />
            <Readout x={W - 150} y={72} label="SPP" value={fl.pumpOn ? '3,294' : '0'} unit="psi" color="#00ccdd" />
            <Readout x={W - 150} y={114} label="BHP" value="15,782" unit="psi" color="#3388ff" />
            <Readout x={W - 150} y={164} label="Flow In" value={fl.pumpOn ? '1,008' : '0'} unit="gpm" color={GREEN} />
            <Readout x={W - 150} y={206} label="Flow Out" value={fl.pumpOn ? '1,003' : '0'} unit="gpm" color="#ffaa22" />
            <Readout x={W - 150} y={248} label="ECD" value="12.35" unit="ppg" color="#00ccdd" />
            <Readout x={W - 150} y={298} label="CHK-A" value={fl.chkA.on ? fl.chkA.pct + '%' : 'STBY'} unit="" color={fl.chkA.on ? GREEN : C.t0} />
            <Readout x={W - 150} y={340} label="CHK-B" value={fl.chkB.on ? fl.chkB.pct + '%' : 'STBY'} unit="" color={fl.chkB.on ? GREEN : C.t0} />

            {/* Legend */}
            <g transform={'translate(' + (W - 150) + ',390)'}>
              <line x1={0} x2={20} y1={2} y2={2} stroke={GREEN} strokeWidth="3" />
              <text x={26} y={5} fill={C.t1} fontSize="8">Active</text>
              <line x1={60} x2={80} y1={2} y2={2} stroke={PIPE} strokeWidth="3" />
              <text x={86} y={5} fill={C.t1} fontSize="8">Inactive</text>
            </g>

          </svg>
        </div>

        {/* Editor sidebar */}
        {showEditor && (
          <div style={{ width: 210, background: C.bg1, borderLeft: '1px solid ' + C.border,
            padding: 12, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 8 }}>EDIT P&ID</div>
            <div style={{ fontSize: 8, color: C.t0, lineHeight: 1.6, padding: '4px 6px',
              background: C.bg2, borderRadius: 4, marginBottom: 10 }}>
              Drag ≡ to reorder. ✕ to remove. Pipes auto-reconnect.
            </div>

            <div style={{ fontSize: 10, fontWeight: 600, color: C.t0, marginBottom: 4 }}>MPD Equipment</div>
            {chain.map(function (eq, i) {
              return <div key={eq.id}
                draggable={eq.removable !== false}
                onDragStart={function () { setDragIdx(i); }}
                onDragOver={function (e) { e.preventDefault(); setDragOver(i); }}
                onDrop={function () { handleDrop(i); }}
                onDragEnd={function () { setDragIdx(null); setDragOver(null); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 6px', marginBottom: 2, background: dragOver === i ? '#3388ff15' : C.bg2,
                  borderRadius: 4, border: '1px solid ' + (dragOver === i ? '#3388ff' : C.border),
                  cursor: eq.removable !== false ? 'grab' : 'default',
                  opacity: dragIdx === i ? 0.4 : 1,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {eq.removable !== false && <span style={{ fontSize: 10, color: C.t0 }}>≡</span>}
                  <span style={{ fontSize: 9, color: C.t2 }}>{eq.label}</span>
                </div>
                {eq.removable !== false
                  ? <button onClick={function () { removeEquip(i); }} style={{
                      background: 'transparent', border: 'none', color: RED, fontSize: 10,
                      cursor: 'pointer', padding: '0 3px' }}>✕</button>
                  : <span style={{ fontSize: 7, color: C.t0 }}>FIXED</span>}
              </div>;
            })}

            <div style={{ fontSize: 10, fontWeight: 600, color: C.t0, marginTop: 12, marginBottom: 4 }}>Add</div>
            {ADDABLE.map(function (a) {
              return <button key={a.type + a.label} onClick={function () { addEquip(a.type, a.label); }}
                style={{ display: 'block', width: '100%', padding: '4px 6px', marginBottom: 2,
                  borderRadius: 4, background: C.bg2, border: '1px solid ' + C.border,
                  color: C.t1, fontSize: 9, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: GREEN, marginRight: 5 }}>+</span>{a.label}</button>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
