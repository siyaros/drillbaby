import { C } from '../../theme';

export default function WellSchematic({ width = 200, height = 480, profiles, scalars }) {
  if (!profiles || !profiles.length) {
    return (
      <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + C.border, fontSize: 11, fontWeight: 700, color: C.t2 }}>
          WELL SCHEMATIC</div>
        <div style={{ padding: 20, textAlign: 'center', color: C.t0, fontSize: 11 }}>No data</div>
      </div>
    );
  }

  var bitNode = profiles[profiles.length - 1];
  var totalD = bitNode.MD * 1.05 || 11000;
  var cx = width / 2;
  function toY(d) { return 24 + (d / totalD) * (height - 40); }
  function sc(d) { return Math.max(2, d * 2.5); }

  // Extract geometry changes from profiles
  var casings = [];
  var lastHID = 0;
  profiles.forEach(function (p, i) {
    if (p.HID !== lastHID && p.HID > 0) {
      casings.push({ topD: i === 0 ? 0 : profiles[i - 1].MD, botD: p.MD, hid: p.HID, pod: p.POD });
      lastHID = p.HID;
    }
  });
  // If uniform geometry, just use first node
  if (casings.length === 0 && profiles[0].HID > 0) {
    casings.push({ topD: 0, botD: bitNode.MD, hid: profiles[0].HID, pod: profiles[0].POD });
  }

  var bhp = scalars ? scalars.BHP : null;
  var ecd = scalars ? scalars.ECD : null;
  var bht = scalars ? scalars.BHT : null;
  var bitD = scalars ? scalars.BitDepth : bitNode.MD;

  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, overflow: 'hidden' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + C.border, fontSize: 11, fontWeight: 700, color: C.t2 }}>
        WELL SCHEMATIC</div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <rect x={20} y={24} width={width - 40} height={height - 40} fill="#0d1015" rx="2" />

        {/* Depth ticks */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(function (f, i) {
          var d = Math.round(totalD * f);
          return <text key={i} x={18} y={toY(d) + 3} fill={C.t0} fontSize="7" textAnchor="end">{d > 0 ? (d / 1000).toFixed(0) + 'k' : '0'}</text>;
        })}

        {/* Casing walls */}
        {casings.map(function (c, i) {
          var hw = sc(c.hid) / 2;
          return (
            <g key={i}>
              <rect x={cx - hw} y={toY(c.topD)} width={2} height={toY(c.botD) - toY(c.topD)} fill="#556" />
              <rect x={cx + hw - 2} y={toY(c.topD)} width={2} height={toY(c.botD) - toY(c.topD)} fill="#556" />
              <rect x={cx - hw - 1} y={toY(c.botD) - 2} width={hw * 2 + 2} height={3} fill="#667" rx="1" />
            </g>
          );
        })}

        {/* Drill string */}
        <rect x={cx - 4} y={toY(0)} width={8} height={toY(bitD * 0.95) - toY(0)} fill="#7a8899" opacity="0.25" rx="1" stroke="#7a8899" strokeWidth="0.5" />

        {/* Bit */}
        <rect x={cx - 8} y={toY(bitD * 0.95)} width={16} height={toY(bitD) - toY(bitD * 0.95)} fill={C.amber} opacity="0.5" rx="2" stroke={C.amber} />

        {/* Bit depth line */}
        <line x1={25} x2={width - 25} y1={toY(bitD)} y2={toY(bitD)} stroke={C.amber} strokeWidth="1" strokeDasharray="2 2" />

        {/* Sensor markers */}
        <circle cx={cx + 18} cy={toY(bitD * 0.98)} r={3.5} fill={C.cyan} opacity="0.8" />
        <text x={cx + 25} y={toY(bitD * 0.98) + 3} fill={C.cyan} fontSize="7" fontWeight="700">PWD</text>

        <circle cx={cx + 18} cy={toY(0)} r={3.5} fill={C.amber} opacity="0.8" />
        <text x={cx + 25} y={toY(0) + 3} fill={C.amber} fontSize="7" fontWeight="700">SPP</text>

        <text x={cx} y={16} fill={C.t2} fontSize="9" fontWeight="700" textAnchor="middle">
          Bit: {bitD ? bitD.toLocaleString() : '?'} ft
        </text>
      </svg>

      {/* Live values */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid ' + C.border }}>
        {[
          ['BHP', bhp ? bhp.toFixed(0) + ' psi' : '--', C.green],
          ['ECD', ecd ? ecd.toFixed(2) + ' ppg' : '--', C.amber],
          ['BHT', bht ? bht.toFixed(0) + ' F' : '--', C.red],
        ].map(function (r) {
          return <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
            <span style={{ color: C.t0 }}>{r[0]}</span>
            <span style={{ color: r[2], fontWeight: 600 }}>{r[1]}</span>
          </div>;
        })}
      </div>
    </div>
  );
}
