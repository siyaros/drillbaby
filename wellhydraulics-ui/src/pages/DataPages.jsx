import { DataTable, FieldGroup } from '../components/shared/index.jsx';
import { useProjectStore } from '../state/stores';
import { C } from '../theme';

export function WellDataPage() {
  var wp = useProjectStore(function (s) { return s.wellpath; });
  var setWp = useProjectStore(function (s) { return s.setWellpath; });
  var cas = useProjectStore(function (s) { return s.casings; });
  var setCas = useProjectStore(function (s) { return s.setCasings; });
  var hole = useProjectStore(function (s) { return s.hole; });
  var setHole = useProjectStore(function (s) { return s.setHole; });
  var fms = useProjectStore(function (s) { return s.formations; });
  var setFms = useProjectStore(function (s) { return s.setFormations; });
  var temp = useProjectStore(function (s) { return s.temperature; });
  var setTemp = useProjectStore(function (s) { return s.setTemperature; });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 16, overflow: 'auto' }}>
      <div>
        <DataTable title="WELLPATH SURVEY" columns={[
          { key: 'md', label: 'MD (ft)' }, { key: 'inc', label: 'Incl (deg)' }, { key: 'azi', label: 'Azi (deg)' },
        ]} data={wp} onDataChange={setWp} />

        <DataTable title="CASING PROGRAM" columns={[
          { key: 'type', label: 'Type' }, { key: 'od', label: 'OD (in)' },
          { key: 'id', label: 'ID (in)' }, { key: 'sd', label: 'SD (ft)' }, { key: 'hd', label: 'HD (ft)' },
        ]} data={cas} onDataChange={setCas} />
      </div>
      <div>
        <DataTable title="OPEN HOLE" columns={[
          { key: 'md', label: 'MD (ft)' }, { key: 'dia', label: 'Diameter (in)' }, { key: 'ff', label: 'Friction Factor' },
        ]} data={hole} onDataChange={setHole} />

        <DataTable title="FORMATIONS" columns={[
          { key: 'name', label: 'Formation' }, { key: 'md', label: 'MD (ft)' },
          { key: 'ppg', label: 'PPG (ppg)' }, { key: 'fpg', label: 'FPG (ppg)' },
          { key: 'kth', label: 'K_thermal' }, { key: 'cp', label: 'Cp' },
        ]} data={fms} onDataChange={setFms} />

        <DataTable title="TEMPERATURE PROFILE" columns={[
          { key: 'tvd', label: 'TVD (ft)' }, { key: 'temp', label: 'Temp (F)' },
        ]} data={temp} onDataChange={setTemp} />
      </div>
    </div>
  );
}

export function SurfaceEquipPage() {
  var seIn = useProjectStore(function (s) { return s.seInlet; });
  var setSeIn = useProjectStore(function (s) { return s.setSeInlet; });
  var seOut = useProjectStore(function (s) { return s.seOutlet; });
  var setSeOut = useProjectStore(function (s) { return s.setSeOutlet; });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 16, overflow: 'auto' }}>
      <DataTable title="INLET PIPING (Pump to Swivel)" columns={[
        { key: 'type', label: 'Component' }, { key: 'len', label: 'Length (ft)' }, { key: 'id', label: 'ID (in)' },
      ]} data={seIn} onDataChange={setSeIn} />
      <DataTable title="OUTLET PIPING (Annulus to Pit)" columns={[
        { key: 'type', label: 'Component' }, { key: 'len', label: 'Length (ft)' }, { key: 'id', label: 'ID (in)' },
      ]} data={seOut} onDataChange={setSeOut} />
    </div>
  );
}

export function FluidPage() {
  var fluids = useProjectStore(function (s) { return s.fluids; });
  var setFluids = useProjectStore(function (s) { return s.setFluids; });

  // Build field array from first fluid for FieldGroup
  var fl = fluids[0] || {};
  var fields = [
    { l: 'Base Type', k: 'base', v: fl.base },
    { l: 'Mud Weight (ppg)', k: 'mw', v: fl.mw },
    { l: 'PVT Enabled', k: 'pvt', v: fl.pvt ? 'Yes' : 'No' },
    { l: 'Yield Stress (ty)', k: 'ty', v: fl.ty },
    { l: 'n (flow index)', k: 'n', v: fl.n },
    { l: 'K (consistency)', k: 'K', v: fl.K },
    { l: 'K_thermal', k: 'kth', v: fl.kth },
    { l: 'Cp', k: 'cp', v: fl.cp },
  ];

  function handleFieldChange(fieldIndex, key, newValue) {
    var parsed = newValue;
    if (key === 'pvt') {
      parsed = newValue.toLowerCase() === 'yes' || newValue === 'true' || newValue === '1';
    } else if (key !== 'base' && newValue !== '' && !isNaN(Number(newValue))) {
      parsed = Number(newValue);
    }
    var updated = fluids.map(function (f, i) {
      if (i !== 0) return f;
      var nf = {};
      Object.keys(f).forEach(function (k) { nf[k] = f[k]; });
      nf[key] = parsed;
      return nf;
    });
    setFluids(updated);
  }

  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
      <FieldGroup title="FLUID 1 -- Active Mud" fields={fields} onFieldChange={handleFieldChange} />
      {fluids.length > 1 && (
        <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 8 }}>
            Additional Fluids ({fluids.length - 1})
          </div>
          <div style={{ fontSize: 10, color: C.t0 }}>
            {fluids.slice(1).map(function (f, i) {
              return <div key={i}>Fluid {i + 2}: n={f.n}, K={f.K}, ty={f.ty}, PVT={f.pvt ? 'Yes' : 'No'}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DrillstringPage() {
  var ds = useProjectStore(function (s) { return s.drillstring; });
  var setDs = useProjectStore(function (s) { return s.setDrillstring; });

  // Summary
  var totalLen = 0;
  ds.forEach(function (s) { totalLen += (Number(s.len) || 0); });

  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
      <DataTable title="DRILL STRING & BHA" columns={[
        { key: 'desc', label: 'Description' }, { key: 'od', label: 'OD (in)' }, { key: 'id', label: 'ID (in)' },
        { key: 'len', label: 'Length (ft)' }, { key: 'wt', label: 'Weight (lb/ft)' },
      ]} data={ds} onDataChange={setDs} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
        <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>STRING SUMMARY</div>
          <div style={{ fontSize: 11, color: C.t0, lineHeight: 1.8 }}>
            <div>Components: <span style={{ color: C.t3 }}>{ds.length}</span></div>
            <div>Total Length: <span style={{ color: C.t3 }}>{totalLen.toLocaleString()} ft</span></div>
          </div>
        </div>
        {ds.length > 0 && ds[ds.length - 1].nozzles > 0 && (
          <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12 }}>BIT NOZZLES</div>
            <div style={{ fontSize: 11, color: C.t0, lineHeight: 1.8 }}>
              <div>Nozzles: <span style={{ color: C.t3 }}>{ds[ds.length - 1].nozzles}</span></div>
              <div>Size: <span style={{ color: C.t3 }}>{ds[ds.length - 1].nozzleSize}/32 in</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 16, overflow: 'auto' }}>
      <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t3, marginBottom: 16 }}>UNIT SYSTEM</div>
        {[['Depth', 'ft'], ['Pressure', 'psi'], ['Temperature', 'F'], ['Density', 'ppg'],
          ['Flow Rate', 'gpm'], ['Velocity', 'ft/min']].map(function (r) {
          return <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid ' + C.border + '10', padding: '6px 0', fontSize: 11 }}>
            <span style={{ color: C.t0 }}>{r[0]}</span>
            <span style={{ color: C.t3, fontWeight: 600 }}>{r[1]}</span>
          </div>;
        })}
      </div>
      <div style={{ background: C.bg2, borderRadius: 8, border: '1px solid ' + C.border, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t3, marginBottom: 16 }}>IMPORT / EXPORT</div>
        {['Import Input (Excel)', 'Export Results (Excel)', 'Export Results (JSON)'].map(function (t) {
          return <button key={t} style={{
            display: 'block', width: '100%', marginBottom: 8, padding: 10, background: C.bgIn,
            border: '1px solid ' + C.border, borderRadius: 6, color: C.t1, fontSize: 11, cursor: 'pointer', textAlign: 'left',
          }}>{t}</button>;
        })}
      </div>
    </div>
  );
}
