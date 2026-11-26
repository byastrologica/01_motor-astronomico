import {resolveHDCivilDay,scanHDAspectCatalog} from './hd-day-coverage.js';
import {createTemporalSampler} from './temporal-sampler.js';
import {TEMPORAL_ANGLES_BY_ASPECT} from './temporal-window-search.js';

export class HDPreviewInputError extends Error {}
const signBodies=['SOL','LUA','MERCURIO','VENUS','MARTE','JUPITER','SATURNO','URANO','NETUNO','PLUTAO'];
const rate=id=>id==='LUA'?25:8;
const wrap=x=>((x%360)+360)%360;

// Second pass: a fixed one-minute grid with both day boundaries. It checks
// the adaptive CORE result independently and bounds the worst orb using
// endpoint cones, not a noon sample or a sampled maximum treated as exact.
function auditCoreOrbs(day,results,candidates,sample){
  const byId=new Map(candidates.map(r=>[r.relationId,r]));
  const entries=results.filter(r=>r.status==='BOUNDED_ESTIMATE'&&r.coverage.core.minMs===day.durationMs)
    .slice(0,250).map(result=>({result,row:byId.get(result.relationId),previous:null,lower:0,upper:0,ok:true}));
  if(!entries.length)return;
  let previousTime=day.startMs;
  for(let t=day.startMs;;t=Math.min(t+60000,day.endMs)){
    const cache=new Map();
    const get=id=>{
      if(!cache.has(id)){
        try{cache.set(id,sample(id,t));}catch{cache.set(id,null);}
      }
      return cache.get(id);
    };
    for(const entry of entries){
      if(!entry.ok)continue;
      const {row}=entry,a=get(row.bodyA),b=get(row.bodyB),angle=TEMPORAL_ANGLES_BY_ASPECT[row.aspect];
      const orb=!a||!b?NaN:row.aspect==='PARALLEL'?Math.abs(a.declination-b.declination)
        :row.aspect==='CONTRAPARALLEL'?Math.abs(a.declination+b.declination)
        :Math.abs(Math.abs(wrap(a.longitude-b.longitude+180)-180)-angle);
      if(!Number.isFinite(orb)||orb>row.coreLimit){entry.ok=false;continue;}
      entry.lower=Math.max(entry.lower,orb);
      const bound=(rate(row.bodyA)+rate(row.bodyB))*(t-previousTime)/86400000;
      if(entry.previous!==null){
        if(Math.abs(entry.previous-orb)>bound+1e-9){entry.ok=false;continue;}
        entry.upper=Math.max(entry.upper,(entry.previous+orb+bound)/2+1e-9);
      }
      entry.previous=orb;
    }
    if(t===day.endMs)break;
    previousTime=t;
  }
  for(const e of entries){
    if(!e.ok){
      e.result.status='INCOMPLETE';
      e.result.failures.push('CORE_DOUBLE_CHECK_FAILED');
      continue;
    }
    e.result.rankingEvidence=e.ok&&e.upper<=e.row.coreLimit&&e.lower<=e.upper&&e.row.coreLimit>0
      ?{status:'DOUBLE_CHECKED_CORE',worstOrbLower:e.lower,worstOrbUpper:e.upper,allowedOrb:e.row.coreLimit,stepMs:60000}
      :{status:'NO_VERIFIED_SCORE_INPUT'};
  }
}
function signTimeline(day,id,sample){
  const segments=[];
  let failed=false;
  const emit=(startMs,endMs,sign)=>{
    const last=segments.at(-1);
    if(last?.sign===sign&&last.endMs===startMs)last.endMs=endMs;
    else segments.push({startMs,endMs,sign});
  };
  function visit(start,end){
    const mid=Math.floor((start+end)/2);
    const lon=sample(id,mid).longitude, left=sample(id,start).longitude, right=sample(id,end).longitude;
    const delta=(a,b)=>Math.abs(wrap(a-b+180)-180);
    const bound=rate(id)/86400000;
    if(delta(lon,left)>bound*(mid-start)+1e-9||delta(lon,right)>bound*(end-mid)+1e-9){failed=true;return;}
    const radius=bound*Math.max(mid-start,end-mid)+1e-9;
    if(Math.floor((lon-radius)/30)===Math.floor((lon+radius)/30))emit(start,end,Math.floor(wrap(lon)/30));
    else if(end-start<=30_000)emit(start,end,null);
    else{visit(start,mid);if(!failed)visit(mid,end);}
  }
  try{visit(day.startMs,day.endMs);}catch{failed=true;}
  return {body:id,status:failed?'INCOMPLETE':'BOUNDED_ESTIMATE',segments:failed?[]:segments};
}

export function calculateHDPreview(input) {
  const date=input?.date, zone=input?.zone, catalog=input?.catalog;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1800-01-01'||date>'2399-12-30'||
     typeof zone!=='string'||zone.length>64||catalog?.schemaVersion!=='HD_ASPECT_CANDIDATES_DRAFT_V1'||
     catalog.capturePolicyVersion!=='CAPTURE_TABLE_2026_V3'||
     !Array.isArray(catalog.candidates)||!catalog.candidates.length||catalog.candidates.length>2400||
     !Array.isArray(catalog.unavailable)||catalog.unavailable.length>32){
    throw new HDPreviewInputError('Data, fuso ou catálogo inválido para a prévia HD.');
  }
  for(const row of catalog.candidates){
    if(!row||![row.bodyA,row.bodyB,row.aspect].every(v=>typeof v==='string'&&/^[A-Z_]{2,40}$/.test(v))||
       [row.bodyA,row.bodyB].some(v=>v.startsWith('ECLIPSE_'))||
       !Number.isFinite(row.captureLimit)||row.captureLimit<=0||row.captureLimit>10||
       (row.coreLimit!==null&&(!Number.isFinite(row.coreLimit)||row.coreLimit<0||row.coreLimit>row.captureLimit))){
      throw new HDPreviewInputError('Uma ou mais relações não pertencem ao escopo da prévia.');
    }
  }
  if(new Set(catalog.candidates.flatMap(r=>[r.bodyA,r.bodyB])).size>32)throw new HDPreviewInputError('Universo HD excede 32 corpos.');
  let day, result;
  const {sample}=createTemporalSampler({birthTimeKnown:false});
  try{
    day=resolveHDCivilDay(date,zone);
    result=scanHDAspectCatalog(day,catalog,sample,{
      precisionMs:30_000,maxSamples:3500,maxTotalSamples:65_000,
      rateOptionsFor(row){
        return {maxOrbRateDegreesPerDay:rate(row.bodyA)+rate(row.bodyB),
          boundProvenance:'EMPIRICAL_PILOT_ONLY_NOT_HOMOLOGATED'};
      },
    });
  }catch(error){
    if(error instanceof TypeError||error instanceof RangeError)throw new HDPreviewInputError(error.message);
    throw error;
  }
  const {results,unavailable,...summary}=result;
  auditCoreOrbs(day,results,catalog.candidates,sample);
  const bodyIds=new Set(catalog.candidates.flatMap(r=>[r.bodyA,r.bodyB]));
  return {...summary,day,unavailable,signTimelines:signBodies.filter(id=>bodyIds.has(id)).map(id=>signTimeline(day,id,sample)),
    items:results.filter(r=>r.status==='BOUNDED_ESTIMATE'&&r.coverage.existence.maxMs>0),
    incomplete:results.filter(r=>r.status!=='BOUNDED_ESTIMATE').map(r=>({
      relationId:r.relationId,status:r.status,reason:r.reason??null,failures:r.failures??[],
    })),
  };
}
