import { useSolverStore } from '../state/stores';
import DepthPlot from '../components/charts/DepthPlot';
import TimeSeriesChart from '../components/charts/TimeSeriesChart';
import WellSchematic from '../components/well/WellSchematic';
import { C } from '../theme';

export default function Dashboard() {
  var results = useSolverStore(function (s) { return s.results; });
  var profiles = results ? results.profiles : [];
  var scalars = results ? results.scalars : {};

  // Build chart data from profiles
  var depths = profiles.map(function (p) { return p.MD; });

  var pressureSeries = profiles.length ? [
    { id: 'ann', label: 'Annular Pressure', color: C.blue, data: profiles.map(function (p) { return p.Pa; }), depths: depths, primary: true },
    { id: 'ds', label: 'DS Pressure', color: C.cyan, data: profiles.map(function (p) { return p.Pp; }), depths: depths },
  ] : [];

  // Build gradient series (ECD at each depth = Pa / (0.052 * TVD))
  var gradientSeries = profiles.length ? [
    { id: 'ecd', label: 'ECD', color: C.amber, data: profiles.map(function (p) {
      return p.TVD > 0 ? p.Pa / (0.052 * p.TVD) : 0;
    }), depths: depths, primary: true },
    { id: 'rhoa', label: 'Mud Weight', color: C.blue, data: profiles.map(function (p) { return p.rhoa; }), depths: depths, dash: true },
  ] : [];

  // Temperature series
  var tempSeries = profiles.length ? [
    { id: 'ta', label: 'Annular Temp', color: C.red, data: profiles.map(function (p) { return p.Ta; }), depths: depths, primary: true },
    { id: 'tp', label: 'Pipe Temp', color: C.amber, data: profiles.map(function (p) { return p.Tp; }), depths: depths },
    { id: 'tf', label: 'Formation', color: C.t0, data: profiles.map(function (p) { return p.Tf; }), depths: depths, dash: true },
  ] : [];

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Profile charts as pseudo-time series */}
        <TimeSeriesChart height={180} data={profiles} />

        {/* Depth plots */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <DepthPlot title="Pressure vs Depth" xLabel="Pressure (psi)" width={350} height={420} series={pressureSeries} />
          <DepthPlot title="Gradient vs Depth" xLabel="Density (ppg)" width={350} height={420} series={gradientSeries} />
          <DepthPlot title="Temperature vs Depth" xLabel="Temperature (F)" width={350} height={420} series={tempSeries} />
        </div>
      </div>

      {/* Right panel - well schematic */}
      <div style={{ width: 210, borderLeft: '1px solid ' + C.border, padding: '12px 6px', flexShrink: 0, overflow: 'auto' }}>
        <WellSchematic profiles={profiles} scalars={scalars} />
      </div>
    </div>
  );
}
