import { useState } from 'react';
import { C } from '../../theme';

export function KPI({ label, value, unit, color = C.blue, alarm = false, min = 0, max = 100 }) {
  var stGauge = useState(false);
  var showGauge = stGauge[0], setShowGauge = stGauge[1];
  var col = alarm ? C.redB : color;
  var numVal = parseFloat(String(value).replace(/,/g, '')) || 0;
  var pct = Math.max(0, Math.min(1, (numVal - min) / ((max - min) || 1)));

  if (showGauge) {
    var r = 28, cx = 40, cy = 38;
    var startA = Math.PI * 0.8, endA = Math.PI * 0.2;
    var range = (2 * Math.PI) - (startA - endA);
    var angle = startA - pct * range;
    var x1 = cx + r * Math.cos(startA), y1 = cy - r * Math.sin(startA);
    var x2 = cx + r * Math.cos(endA), y2 = cy - r * Math.sin(endA);
    var ax = cx + r * Math.cos(angle), ay = cy - r * Math.sin(angle);
    var nx = cx + (r - 8) * Math.cos(angle), ny = cy - (r - 8) * Math.sin(angle);
    return (
      <div onClick={function () { setShowGauge(false); }} style={{
        padding: '6px 8px', background: alarm ? C.redB + '18' : C.bg2,
        border: '1px solid ' + (alarm ? C.red : C.border), borderRadius: 6,
        minWidth: 90, borderLeft: '3px solid ' + col, cursor: 'pointer', textAlign: 'center',
      }}>
        <div style={{ fontSize: 9, color: C.t0, letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
        <svg width={80} height={52} viewBox="0 0 80 52" style={{ display: 'block', margin: '0 auto' }}>
          <path d={'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 1 1 ' + x2 + ' ' + y2}
            fill="none" stroke={C.border} strokeWidth="4" strokeLinecap="round" />
          <path d={'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + (pct > 0.5 ? '1' : '0') + ' 1 ' + ax + ' ' + ay}
            fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={3} fill={C.t3} />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.t3 }}>{value} <span style={{ fontSize: 9, color: C.t0 }}>{unit}</span></div>
      </div>
    );
  }

  return (
    <div onClick={function () { setShowGauge(true); }} style={{
      display: 'flex', flexDirection: 'column', padding: '8px 12px',
      background: alarm ? C.redB + '18' : C.bg2,
      border: '1px solid ' + (alarm ? C.red : C.border), borderRadius: 6,
      minWidth: 100, borderLeft: '3px solid ' + col, cursor: 'pointer',
    }}>
      <span style={{ fontSize: 9, color: C.t0, letterSpacing: 0.5 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: alarm ? C.redB : C.t3 }}>{value}</span>
        <span style={{ fontSize: 9, color: C.t0 }}>{unit}</span>
      </div>
    </div>
  );
}

export function AlarmBadge({ text, level = 'warn' }) {
  var col = level === 'crit' ? C.redB : level === 'warn' ? C.amber : C.green;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      background: col + '18', border: '1px solid ' + col + '40', borderRadius: 4,
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />
      <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

export function DataTable({ columns, data, title, onDataChange, onAddRow, onDeleteRow }) {
  function handleCellChange(rowIndex, colKey, newValue) {
    if (!onDataChange) return;
    // Try to parse as number, keep as string if not
    var parsed = newValue;
    if (newValue !== '' && !isNaN(Number(newValue))) {
      parsed = Number(newValue);
    }
    var newData = data.map(function (row, i) {
      if (i !== rowIndex) return row;
      var updated = {};
      Object.keys(row).forEach(function (k) { updated[k] = row[k]; });
      updated[colKey] = parsed;
      return updated;
    });
    onDataChange(newData);
  }

  function handleAdd() {
    if (onAddRow) {
      onAddRow();
    } else if (onDataChange) {
      // Create empty row from column keys
      var newRow = {};
      columns.forEach(function (c) { newRow[c.key] = ''; });
      onDataChange(data.concat([newRow]));
    }
  }

  function handleDelete(rowIndex) {
    if (onDeleteRow) {
      onDeleteRow(rowIndex);
    } else if (onDataChange) {
      onDataChange(data.filter(function (_, i) { return i !== rowIndex; }));
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 8 }}>{title}</div>}
      <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid ' + C.border }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr style={{ background: C.bg1 }}>
            {columns.map(function (c) {
              return <th key={c.key} style={{
                padding: '8px 10px', textAlign: 'left', color: C.t0, fontWeight: 600,
                borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap',
              }}>{c.label}</th>;
            })}
            {onDataChange && <th style={{ width: 30, padding: '8px 4px', borderBottom: '1px solid ' + C.border }}></th>}
          </tr></thead>
          <tbody>{data.map(function (row, ri) {
            return <tr key={ri} style={{ borderBottom: '1px solid ' + C.border + '10' }}>
              {columns.map(function (c) {
                return <td key={c.key} style={{ padding: '6px 10px' }}>
                  <input type="text"
                    value={row[c.key] != null ? String(row[c.key]) : ''}
                    onChange={function (e) { handleCellChange(ri, c.key, e.target.value); }}
                    style={{
                      width: '100%', background: C.bgIn, border: '1px solid ' + C.border,
                      borderRadius: 4, padding: '4px 8px', color: C.t3, fontSize: 11, outline: 'none',
                    }}
                    onFocus={function (e) { e.target.style.borderColor = C.bFocus; }}
                    onBlur={function (e) { e.target.style.borderColor = C.border; }}
                  />
                </td>;
              })}
              {onDataChange && <td style={{ padding: '6px 2px', textAlign: 'center' }}>
                <button onClick={function () { handleDelete(ri); }} style={{
                  background: 'transparent', border: 'none', color: C.t0, cursor: 'pointer',
                  fontSize: 12, padding: '2px 6px', borderRadius: 4,
                }} title="Delete row">x</button>
              </td>}
            </tr>;
          })}</tbody>
        </table>
      </div>
      {onDataChange && <button onClick={handleAdd} style={{
        marginTop: 8, padding: '4px 12px', background: 'transparent', border: '1px solid ' + C.border,
        borderRadius: 4, color: C.t0, fontSize: 10, cursor: 'pointer',
      }}>+ Add Row</button>}
    </div>
  );
}

export function FieldGroup({ title, fields, onFieldChange }) {
  return (
    <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {fields.map(function (f, fi) {
          return <div key={f.l}>
            <div style={{ fontSize: 10, color: C.t0, marginBottom: 3 }}>{f.l}</div>
            <input
              value={f.v != null ? String(f.v) : ''}
              onChange={function (e) {
                if (onFieldChange) onFieldChange(fi, f.k || f.l, e.target.value);
              }}
              style={{
                width: '100%', background: C.bgIn, border: '1px solid ' + C.border,
                borderRadius: 4, padding: '5px 8px', color: C.t3, fontSize: 11, outline: 'none',
              }}
              onFocus={function (e) { e.target.style.borderColor = C.bFocus; }}
              onBlur={function (e) { e.target.style.borderColor = C.border; }}
            />
          </div>;
        })}
      </div>
    </div>
  );
}
