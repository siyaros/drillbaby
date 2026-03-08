import { useState, useEffect, useRef } from 'react';
import { useSolverStore, useProjectStore } from '../state/stores';
import DepthTrack from '../components/charts/DepthTrack';
import TimeTrack from '../components/charts/TimeTrack';
import { C } from '../theme';

var FLUID_COLORS = { WBM:{fill:"#2266cc",op:0.3}, OBM:{fill:"#8B5E3C",op:0.35}, SBM:{fill:"#C4A830",op:0.3} };
var FM_COLORS = ["#4a4a3a","#3a4a4a","#5a5540","#404a55","#3a4a4a","#4a3a4a"];

// Compare bar component
function CompareBar() {
  var history = useSolverStore(function(s){return s.history});
  var compareOn = useSolverStore(function(s){return s.compareOn});
  var setCompareOn = useSolverStore(function(s){return s.setCompareOn});
  var selectedRuns = useSolverStore(function(s){return s.selectedRuns});
  var toggleRun = useSolverStore(function(s){return s.toggleRunSelection});

  if (!history.length) return null;

  return (
    <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',
      background:C.bg1,borderBottom:'1px solid '+C.border,flexShrink:0,flexWrap:'wrap'}}>
      <button onClick={function(){setCompareOn(!compareOn)}} style={{
        display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:4,
        background:compareOn?C.blue+'20':'transparent',
        border:'1px solid '+(compareOn?C.blue:C.border),cursor:'pointer'}}>
        <span style={{fontSize:10,fontWeight:700,color:compareOn?C.blue:C.t0}}>Compare {compareOn?'ON':'OFF'}</span>
      </button>
      {compareOn && history.map(function(run){
        var isOn = selectedRuns.indexOf(run.id)>=0;
        return <button key={run.id} onClick={function(){toggleRun(run.id)}} style={{
          display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:4,
          background:isOn?run.color+'15':'transparent',
          border:'1px solid '+(isOn?run.color+'60':C.border),cursor:'pointer'}}>
          <div style={{width:8,height:8,borderRadius:2,background:isOn?run.color:C.t0}}/>
          <span style={{fontSize:9,fontWeight:600,color:isOn?run.color:C.t0,
            textDecoration:isOn?'none':'line-through'}}>{run.label}</span>
          <span style={{fontSize:7,color:C.t0}}>{run.paramLabel}</span>
        </button>;
      })}
    </div>
  );
}

// Comparison summary table
// Well schematic column
function WellColumn({profiles,scalars,height,hdr,formations,fluids,casingsData,simParams}) {
  var W=140;
  if(!profiles||!profiles.length) return (
    <div style={{width:W,flexShrink:0,background:C.bg2,borderRight:'1px solid '+C.border}}>
      <div style={{height:hdr,padding:'4px',borderBottom:'1px solid '+C.border,fontSize:9,color:C.t0,textAlign:'center'}}>Well</div>
      <div style={{height:height}}/>
    </div>
  );
  var H=height,pad={t:0,b:16},h=H-pad.t-pad.b;
  var dMin=profiles[0].MD||0,dMax=profiles[profiles.length-1].MD||10000;
  if(dMax<=dMin)dMax=dMin+1;var dR=dMax-dMin,cx=W/2;
  function toY(d){var y=pad.t+((d-dMin)/dR)*h;return Math.max(pad.t,Math.min(pad.t+h,y))}
  function sc(dia){return Math.max(2,(Number(dia)||5)*3)}

  var flBase=fluids&&fluids[0]?fluids[0].base:'WBM';var flKey='WBM';
  if(typeof flBase==='number'){if(flBase===1||flBase===3)flKey='OBM';else if(flBase===2)flKey='SBM'}
  else{var bs=String(flBase).toUpperCase();if(bs.indexOf('OBM')>=0||bs.indexOf('OIL')>=0||bs.indexOf('MOBM')>=0)flKey='OBM';else if(bs.indexOf('SBM')>=0)flKey='SBM'}
  var fc=FLUID_COLORS[flKey]||FLUID_COLORS.WBM;

  var casings=[];
  if(casingsData&&casingsData.length){casingsData.forEach(function(c){
    var sd=Number(c.sd)||0,id=Number(c.id)||8,od=Number(c.od)||9.625;
    if(sd>0)casings.push({shoe:sd,hid:id,od:od});
  })}
  casings.sort(function(a,b){return a.shoe-b.shoe});

  var bhp=scalars?scalars.BHP:null,ecd=scalars?scalars.ECD:null,spp=scalars?scalars.SPP:null;
  var ecdShoe=null,ecdTD=null;
  if(casings.length>0&&profiles.length>1){var shoeD=casings[casings.length-1].shoe;
    for(var si=0;si<profiles.length;si++){if(profiles[si].MD>=shoeD&&profiles[si].TVD>0){
      ecdShoe=profiles[si].Pa/(0.052*profiles[si].TVD);break}}}
  var lastP=profiles[profiles.length-1];
  if(lastP&&lastP.TVD>0)ecdTD=lastP.Pa/(0.052*lastP.TVD);

  var fmBands=formations&&formations.length?formations.map(function(f,i){
    var top=Number(f.md)||0,bot=(i<formations.length-1)?(Number(formations[i+1].md)||dMax):dMax;
    return {name:f.name||'Fm '+(i+1),top:top,bot:bot,color:FM_COLORS[i%FM_COLORS.length]};
  }):[];

  var wellSvgH = H;

  return (
    <div style={{width:W,flexShrink:0,background:C.bg2,borderRight:'1px solid '+C.border,overflow:'hidden'}}>
      <div style={{height:hdr,padding:'2px 4px',borderBottom:'1px solid '+C.border,textAlign:'center'}}>
        <div style={{fontSize:9,color:C.t2,fontWeight:700}}>Well Schematic</div>
        <div style={{fontSize:11,color:C.t3,fontWeight:800}}>TD: {dMax.toFixed(0)} ft</div>
        <div style={{fontSize:8,color:fc.fill,fontWeight:600}}>{(simParams.mudWeight||'--')+' ppg '+flKey}</div>
      </div>
      <svg width={W} height={wellSvgH} style={{display:'block'}}>
        <rect x={2} y={0} width={W-4} height={wellSvgH-pad.b} fill="#0d1015" rx="1"/>
        {fmBands.map(function(fm,i){var y1=toY(Math.max(fm.top,dMin)),y2=toY(Math.min(fm.bot,dMax));
          if(y2<=y1)return null;return <g key={i}>
            <rect x={3} y={y1} width={W-6} height={y2-y1} fill={fm.color} opacity="0.35"/>
            <text x={W-4} y={(y1+y2)/2+3} fill={C.t0} fontSize="7" textAnchor="end" fontStyle="italic">{fm.name}</text>
            {fm.top>dMin&&<line x1={3} x2={W-3} y1={y1} y2={y1} stroke={C.t0} strokeWidth="0.4" strokeDasharray="3 3"/>}
          </g>})}
        {[0,0.2,0.4,0.6,0.8,1].map(function(f,i){var d=dMin+dR*f,y=toY(d);return <g key={i}>
          <line x1={2} x2={8} y1={y} y2={y} stroke={C.t0} strokeWidth="0.6"/>
          <text x={10} y={y+3} fill={C.t1} fontSize="8">{Math.round(d)}</text></g>})}
        {casings.map(function(cas,ci){var ihw=sc(cas.hid)/2,wallW=2.5,y1=toY(dMin),y2=toY(cas.shoe);
          var color=ci===0?'#5a5a6a':ci===1?'#6a6a7a':'#7a7a8a';return <g key={ci}>
            <rect x={cx-ihw-wallW} y={y1} width={wallW} height={y2-y1} fill={color} opacity="0.85"/>
            <rect x={cx+ihw} y={y1} width={wallW} height={y2-y1} fill={color} opacity="0.85"/>
            <rect x={cx-ihw-wallW} y={y2-2} width={wallW+2} height={3} fill={color} rx="0.5"/>
            <rect x={cx+ihw-2} y={y2-2} width={wallW+2} height={3} fill={color} rx="0.5"/>
          </g>})}
        {(function(){var els=[],innerHw=casings.length?sc(casings[casings.length-1].hid)/2:sc(8)/2;
          var dpHw=sc(5)/2,shoeD=casings.length?casings[casings.length-1].shoe:dMax;
          els.push(<rect key="fl" x={cx-innerHw+1} y={toY(dMin)} width={innerHw-dpHw-1} height={toY(shoeD)-toY(dMin)} fill={fc.fill} opacity={fc.op}/>);
          els.push(<rect key="fr" x={cx+dpHw} y={toY(dMin)} width={innerHw-dpHw-1} height={toY(shoeD)-toY(dMin)} fill={fc.fill} opacity={fc.op}/>);
          if(shoeD<dMax){var ohw=sc(8.5)/2;
            els.push(<rect key="ol" x={cx-ohw+1} y={toY(shoeD)} width={ohw-dpHw-1} height={toY(dMax)-toY(shoeD)} fill={fc.fill} opacity={fc.op+0.05}/>);
            els.push(<rect key="or" x={cx+dpHw} y={toY(shoeD)} width={ohw-dpHw-1} height={toY(dMax)-toY(shoeD)} fill={fc.fill} opacity={fc.op+0.05}/>);
          }return els})()}
        {(function(){var dpHw=sc(5)/2,dpIhw=sc(4.276)/2,wallW=dpHw-dpIhw;return <g>
          <rect x={cx-dpHw} y={toY(dMin)} width={wallW} height={toY(dMax*0.96)-toY(dMin)} fill="#5a6a7a" opacity="0.8" rx="0.5"/>
          <rect x={cx+dpIhw} y={toY(dMin)} width={wallW} height={toY(dMax*0.96)-toY(dMin)} fill="#5a6a7a" opacity="0.8" rx="0.5"/>
          <rect x={cx-dpIhw+0.5} y={toY(dMin)} width={dpIhw*2-1} height={toY(dMax*0.96)-toY(dMin)} fill={fc.fill} opacity={fc.op*0.5} rx="0.5"/>
        </g>})()}
        {(function(){var bt=dMax*0.96,pW=sc(5)/2,bW=sc(8.5)/2,y1=toY(bt),y2=toY(dMax);return <g>
          <polygon points={(cx-pW)+','+y1+' '+(cx+pW)+','+y1+' '+(cx+bW)+','+y2+' '+(cx-bW)+','+y2}
            fill={C.amber} opacity="0.7" stroke={C.amber} strokeWidth="0.8"/>
        </g>})()}
        <line x1={3} x2={W-3} y1={toY(dMax)} y2={toY(dMax)} stroke={C.amber} strokeWidth="0.8" strokeDasharray="3 2"/>
        {spp!=null&&<g><rect x={1} y={toY(dMin)} width={38} height={12} fill={C.bg1} rx="2" stroke={C.amber} strokeWidth="0.5"/>
          <text x={20} y={toY(dMin)+9} fill={C.amber} fontSize="7" fontWeight="700" textAnchor="middle">SPP {Math.round(spp)}</text></g>}
        {ecdShoe!=null&&casings.length>0&&<g><rect x={1} y={toY(casings[casings.length-1].shoe)-6} width={48} height={12} fill={C.bg1} rx="2" stroke={C.green} strokeWidth="0.5"/>
          <text x={25} y={toY(casings[casings.length-1].shoe)+2} fill={C.green} fontSize="7" fontWeight="700" textAnchor="middle">ECD {ecdShoe.toFixed(2)}</text></g>}
        {bhp!=null&&<g><rect x={1} y={toY(dMax)-28} width={46} height={12} fill={C.bg1} rx="2" stroke={C.blue} strokeWidth="0.5"/>
          <text x={24} y={toY(dMax)-20} fill={C.blue} fontSize="7" fontWeight="700" textAnchor="middle">BHP {Math.round(bhp)}</text></g>}
        {ecdTD!=null&&<g><rect x={1} y={toY(dMax)-14} width={48} height={12} fill={C.bg1} rx="2" stroke={C.green} strokeWidth="0.5"/>
          <text x={25} y={toY(dMax)-6} fill={C.green} fontSize="7" fontWeight="700" textAnchor="middle">ECD {ecdTD.toFixed(2)}</text></g>}
      </svg>
    </div>
  );
}

function autoRange(arrays,p){var all=[];arrays.forEach(function(a){a.forEach(function(v){if(v>0&&isFinite(v))all.push(v)})});
  if(!all.length)return[0,1];var mn=Math.min.apply(null,all),mx=Math.max.apply(null,all),r=mx-mn||1;p=p||0.05;
  return[Math.floor((mn-r*p)*100)/100,Math.ceil((mx+r*p)*100)/100]}
function lastVal(a){return(a&&a.length)?a[a.length-1]:null}

function TrackConfigBar({allTracks,visible,onToggle}){
  var hidden=allTracks.filter(function(t){return!visible[t.id]});
  if(!hidden.length)return null;
  return(<div style={{position:'absolute',bottom:8,left:'50%',transform:'translateX(-50%)',
    display:'flex',gap:4,padding:'4px 8px',background:C.bg1,border:'1px solid '+C.border,borderRadius:6,zIndex:10}}>
    <span style={{fontSize:9,color:C.t0,marginRight:4,alignSelf:'center'}}>Add:</span>
    {hidden.map(function(t){return <button key={t.id} onClick={function(){onToggle(t.id)}} style={{
      padding:'3px 8px',borderRadius:4,fontSize:9,fontWeight:600,background:C.bg2,border:'1px solid '+C.border,color:C.t1,cursor:'pointer'
    }}>+ {t.label}</button>})}</div>);
}

export default function Dashboard(){
  var results=useSolverStore(function(s){return s.results});
  var profiles=results?results.profiles:[];
  var scalars=results?results.scalars:{};
  var simParams=useProjectStore(function(s){return s.simParams});
  var formations=useProjectStore(function(s){return s.formations});
  var fluids=useProjectStore(function(s){return s.fluids});
  var casingsData=useProjectStore(function(s){return s.casings});

  // Comparison state
  var compareOn=useSolverStore(function(s){return s.compareOn});
  var selectedRuns=useSolverStore(function(s){return s.selectedRuns});
  var history=useSolverStore(function(s){return s.history});
  var compareRuns=compareOn?history.filter(function(r){return selectedRuns.indexOf(r.id)>=0}):[];

  var stVis=useState({gradient:true,pressure:true,temperature:true,flow:true,density:true,sbp:true,spp:true});
  var trackVis=stVis[0],setTrackVis=stVis[1];
  function toggleTrack(id){setTrackVis(function(v){var nv={};Object.keys(v).forEach(function(k){nv[k]=v[k]});nv[id]=!nv[id];return nv})}
  var allTracks=[{id:'gradient',label:'Gradient'},{id:'pressure',label:'Pressure'},{id:'temperature',label:'Temperature'},
    {id:'flow',label:'Flow'},{id:'density',label:'Density'},{id:'sbp',label:'SBP'},{id:'spp',label:'SPP'}];

  var containerRef=useRef(null);
  var stSize=useState({w:1200,h:600});
  var size=stSize[0],setSize=stSize[1];
  useEffect(function(){
    function measure(){if(containerRef.current){var r=containerRef.current.getBoundingClientRect();setSize({w:r.width,h:r.height})}}
    measure();window.addEventListener('resize',measure);return function(){window.removeEventListener('resize',measure)};
  },[]);

  var hdr=78,closeBarH=16,compareBarH=(history.length)?30:0;
  var trackH=Math.max(200,size.h-closeBarH-compareBarH-hdr-4);
  var wellW=140;
  var visDepth=['gradient','pressure','temperature'].filter(function(id){return trackVis[id]}).length;
  var visTime=['flow','density','sbp','spp'].filter(function(id){return trackVis[id]}).length;
  var totalVis=visDepth+visTime;
  var availW=size.w-wellW;
  var depthShare=totalVis>0?visDepth/totalVis:0.5;
  var depthW=visDepth>0?Math.floor((availW*Math.max(depthShare,0.3))/visDepth):0;
  var timeW=visTime>0?Math.floor((availW*Math.max(1-depthShare,0.2))/visTime):0;

  var depths=profiles.map(function(p){return p.MD});

  // Build depth data — for current run AND comparison runs
  function buildTraceData(prof){
    var d=prof.map(function(p){return p.MD});
    return {
      depths:d,
      ecd:prof.map(function(p){return p.TVD>0?p.Pa/(0.052*p.TVD):0}),
      mw:prof.map(function(p){return p.rhoa||0}),
      ppg:prof.map(function(p){var ppg=8.5;formations.forEach(function(f){if(p.MD>=(Number(f.md)||0))ppg=Number(f.ppg)||8.5});return ppg}),
      fpg:prof.map(function(p){var fpg=16;formations.forEach(function(f){if(p.MD>=(Number(f.md)||0))fpg=Number(f.fpg)||16});return fpg}),
      pa:prof.map(function(p){return p.Pa||0}),
      porePres:prof.map(function(p,i){var ppg=8.5;formations.forEach(function(f){if(p.MD>=(Number(f.md)||0))ppg=Number(f.ppg)||8.5});return 0.052*ppg*(p.TVD||0)}),
      fracPres:prof.map(function(p,i){var fpg=16;formations.forEach(function(f){if(p.MD>=(Number(f.md)||0))fpg=Number(f.fpg)||16});return 0.052*fpg*(p.TVD||0)}),
      ta:prof.map(function(p){return p.Ta||0}),
      tp:prof.map(function(p){return p.Tp||0}),
      tf:prof.map(function(p){return p.Tf||0}),
    };
  }

  var currentData=profiles.length?buildTraceData(profiles):null;

  // Build comparison traces for depth tracks
  function buildCompareTraces(dataKey,label,baseColor){
    if(!compareOn||!compareRuns.length){
      if(!currentData)return[];
      return[{label:label,color:baseColor,data:currentData[dataKey]}];
    }
    return compareRuns.map(function(run,ri){
      var d=buildTraceData(run.profiles);
      return{label:run.label,color:run.color,data:d[dataKey],dash:ri>0};
    });
  }

  // Auto-range across all comparison data
  function compareRange(dataKeys,padPct){
    var allArrays=[];
    if(compareOn&&compareRuns.length){
      compareRuns.forEach(function(run){
        var d=buildTraceData(run.profiles);
        dataKeys.forEach(function(k){allArrays.push(d[k])});
      });
    } else if(currentData){
      dataKeys.forEach(function(k){allArrays.push(currentData[k])});
    }
    return autoRange(allArrays,padPct);
  }

  var gradRange=compareRange(['ecd','mw','ppg','fpg'],0.1);
  var presRange=compareRange(['pa','porePres','fracPres'],0.05);
  var tempRange=compareRange(['ta','tp','tf'],0.05);

  var flowIn=simParams.flowRate||0,flowOut=flowIn,sbp=simParams.sbp||0,spp=scalars.SPP||0;

  // Build gradient traces
  var gradTraces=[];
  if(compareOn&&compareRuns.length){
    compareRuns.forEach(function(run,ri){
      var d=buildTraceData(run.profiles);
      gradTraces.push({label:'ECD '+run.label,color:run.color,data:d.ecd,dash:ri>0});
    });
    if(currentData){gradTraces.push({label:'FPG',color:C.green,data:currentData.fpg,dash:true});
      gradTraces.push({label:'PPG',color:C.red,data:currentData.ppg,dash:true})}
  } else if(currentData){
    gradTraces=[{label:'FPG',color:C.green,data:currentData.fpg},{label:'PPG',color:C.red,data:currentData.ppg},
      {label:'ECD',color:C.blue,data:currentData.ecd},{label:'MW',color:C.cyan,data:currentData.mw,dash:true}];
  }

  var presTraces=[];
  if(compareOn&&compareRuns.length){
    compareRuns.forEach(function(run,ri){
      var d=buildTraceData(run.profiles);
      presTraces.push({label:'Ann P '+run.label,color:run.color,data:d.pa,dash:ri>0});
    });
    if(currentData){presTraces.push({label:'Frac P',color:C.green,data:currentData.fracPres,dash:true});
      presTraces.push({label:'Pore P',color:C.red,data:currentData.porePres,dash:true})}
  } else if(currentData){
    presTraces=[{label:'Frac P',color:C.green,data:currentData.fracPres},{label:'Pore P',color:C.red,data:currentData.porePres},
      {label:'Ann P',color:C.blue,data:currentData.pa}];
  }

  var tempTraces=[];
  if(compareOn&&compareRuns.length){
    compareRuns.forEach(function(run,ri){
      var d=buildTraceData(run.profiles);
      tempTraces.push({label:'T '+run.label,color:run.color,data:d.ta,dash:ri>0});
    });
  } else if(currentData){
    tempTraces=[{label:'Ann T',color:C.red,data:currentData.ta},{label:'Pipe T',color:C.amber,data:currentData.tp},
      {label:'Form T',color:C.t0,data:currentData.tf,dash:true}];
  }

  function TrackWrapper(props){return(
    <div style={{width:props.trackWidth,flexShrink:0,display:'flex',flexDirection:'column'}}>
      <div style={{height:closeBarH,background:C.bg1,borderBottom:'1px solid '+C.border,
        borderRight:'1px solid '+C.border,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <button onClick={function(){toggleTrack(props.trackId)}}
          style={{background:'transparent',border:'none',color:C.t0,fontSize:9,cursor:'pointer',padding:'0 6px'}}
          onMouseEnter={function(e){e.target.style.color=C.red}}
          onMouseLeave={function(e){e.target.style.color=C.t0}}>x</button>
      </div>{props.children}</div>)}

  return(
    <div ref={containerRef} style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:C.bg,position:'relative'}}>
      <CompareBar/>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {trackVis.gradient&&<TrackWrapper trackWidth={depthW} trackId="gradient">
          <DepthTrack title="Gradient" unit="ppg" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={gradRange[0]} xMax={gradRange[1]} showDepthAxis={true}
            fillBetween={!compareOn&&currentData?[2,0]:null} traces={gradTraces}
            currentValues={gradTraces.slice(0,3).map(function(t){return{label:t.label,value:lastVal(t.data)?lastVal(t.data).toFixed(2):'---',color:t.color}})}/>
        </TrackWrapper>}

        {trackVis.pressure&&<TrackWrapper trackWidth={depthW} trackId="pressure">
          <DepthTrack title="Pressure" unit="psi" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={presRange[0]} xMax={presRange[1]}
            fillBetween={!compareOn&&currentData?[2,0]:null} traces={presTraces}
            currentValues={presTraces.slice(0,3).map(function(t){return{label:t.label,value:lastVal(t.data)?lastVal(t.data).toFixed(0):'---',color:t.color}})}/>
        </TrackWrapper>}

        {trackVis.temperature&&<TrackWrapper trackWidth={depthW} trackId="temperature">
          <DepthTrack title="Temperature" unit="F" width={depthW} height={trackH} hdr={hdr}
            depths={depths} xMin={tempRange[0]} xMax={tempRange[1]} traces={tempTraces}
            currentValues={tempTraces.slice(0,3).map(function(t){return{label:t.label,value:lastVal(t.data)?lastVal(t.data).toFixed(0):'---',color:t.color}})}/>
        </TrackWrapper>}

        <div style={{display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{height:closeBarH,background:C.bg1,borderBottom:'1px solid '+C.border,borderRight:'1px solid '+C.border}}/>
          <WellColumn profiles={profiles} scalars={scalars} height={trackH} hdr={hdr}
            formations={formations} fluids={fluids} casingsData={casingsData} simParams={simParams}/>
        </div>

        {trackVis.flow&&<TrackWrapper trackWidth={timeW} trackId="flow">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.max(1000,flowIn*1.5)}
            traces={[{id:'flowOut',label:'Flow Out',color:C.red,unit:'gpm',value:flowOut},
              {id:'flowIn',label:'Flow In',color:C.blue,unit:'gpm',value:flowIn}]}/>
        </TrackWrapper>}

        {trackVis.density&&<TrackWrapper trackWidth={timeW} trackId="density">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={gradRange[0]} max={gradRange[1]}
            traces={[{id:'densOut',label:'Density Out',color:C.red,unit:'ppg',value:scalars.ECD||null},
              {id:'densIn',label:'Density In',color:C.blue,unit:'ppg',value:simParams.mudWeight}]}/>
        </TrackWrapper>}

        {trackVis.sbp&&<TrackWrapper trackWidth={timeW} trackId="sbp">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.max(200,sbp*3||200)}
            traces={[{id:'sbpSP',label:'SBP SP',color:C.amber,unit:'psi',value:null,dash:true},
              {id:'highLim',label:'High Limit',color:C.red,unit:'psi',value:null,dash:true},
              {id:'sbp',label:'SBP',color:C.green,unit:'psi',value:sbp}]}/>
        </TrackWrapper>}

        {trackVis.spp&&<TrackWrapper trackWidth={timeW} trackId="spp">
          <TimeTrack width={timeW} height={trackH} hdr={hdr} min={0} max={Math.ceil((spp||5000)*1.3)}
            traces={[{id:'sppSP',label:'SPP SP',color:C.amber,unit:'psi',value:null,dash:true},
              {id:'spp',label:'SPP',color:C.blue,unit:'psi',value:spp}]}/>
        </TrackWrapper>}
      </div>
      <TrackConfigBar allTracks={allTracks} visible={trackVis} onToggle={toggleTrack}/>
    </div>
  );
}
