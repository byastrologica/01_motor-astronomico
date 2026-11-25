import crypto from 'node:crypto';
import {createTemporalSampler,isTemporalBody,TEMPORAL_STARS,TEMPORAL_ECLIPSES} from '../astronomy-core/temporal-sampler.js';
import {calculateHouses,calculateObliquity,calculateHousePosition,getEphemerisVersion} from '../astronomy-core/swiss-ephemeris-adapter.js';
import {STATIONARY_PROFILE} from '../stationary-state/stationary-profile.js';
import {calculateStationaryState} from '../stationary-state/stationary-state.js';
import {detectVisualGeometries} from './vendor/visual-geometry.js';
import {visualAmploOrb,VISUAL_ORB_POLICY_VERSION} from './shared/visual-amplo-policy.js';
const DAY=86400000,norm=x=>((x%360)+360)%360,wrap=x=>norm(x+180)-180;
const planets=new Set(['SOL','LUA','MERCURIO','VENUS','MARTE','JUPITER','SATURNO','URANO','NETUNO','PLUTAO']);
const angles=new Set(['ASC','MC','DC','IC']),majors=new Set(['CONJUNCTION','SEXTILE','SQUARE','TRINE','OPPOSITION']);
export class ObservationInputError extends Error{}
export const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
// Transit A -> natal B is not transit B -> natal A.
const idFor=(scope,a,b,type)=>scope+'|'+(scope==='TRANSIT_NATAL'?[a,b]:[a,b].sort()).join('|')+'|'+type;
function permitted(a,b,type,scope){
 if(a===b&&scope==='SKY')return false;
 if([a,b].includes('NODO_NORTE')&&[a,b].includes('NODO_SUL'))return false;
 if(angles.has(a)||angles.has(b)){const other=angles.has(a)?b:a,axis=angles.has(a)?a:b;return ['ASC','MC'].includes(axis)&&planets.has(other)&&majors.has(type);}
 return true;
}
export function scanObservationEvents(input,{maxMs=15000,maxSteps=4500,maxEvents=32}={}){
 const start=Date.parse(input?.startUtc),end=Date.parse(input?.endUtc),ids=input?.movingBodies;
 const adaptive=input?.searchStrategy==='ADAPTIVE_PLANETARY_V1';
 if(input?.schemaVersion!=='SKYNOW_AUTO_REQUEST_V1'||!Array.isArray(ids)||!ids.length||ids.length>32||new Set(ids).size!==ids.length||ids.some(id=>!isTemporalBody(id)||angles.has(id))||!Number.isFinite(start)||!Number.isFinite(end)||start<Date.UTC(1600,0,1)||end>Date.UTC(2401,0,1)||end<=start||end-start>(adaptive?90:7)*DAY)throw new ObservationInputError('Intervalo Auto inválido: 1600–2400, até sete dias (90 no perfil adaptativo) e 32 corpos.');
 const defs=input.aspectDefinitions;
 if(!Array.isArray(defs)||defs.length>20||defs.some(d=>!d||!Number.isFinite(d.angle)||d.angle<0||d.angle>180||!Number.isFinite(d.orb)||d.orb<=0||d.orb>10||typeof d.aspect!=='string'||d.aspect.length>64))throw new ObservationInputError('Definições de aspecto ausentes ou inválidas.');
 const ctx=input.context||{},fixed=input.fixedObjects||[];
 if(!Array.isArray(input.scopes)||!input.scopes.length||input.scopes.some(s=>!['SKY','TRANSIT_NATAL'].includes(s))||new Set(input.scopes).size!==input.scopes.length)throw new ObservationInputError('Contextos Auto inválidos.');
 if(!['NONE','MOVING','FIXED'].includes(ctx.axisMode)||typeof ctx.birthTimeKnown!=='boolean')throw new ObservationInputError('Contexto de horário/eixos inválido.');
 if(!Array.isArray(fixed)||fixed.length>40||fixed.some(p=>!p||!isTemporalBody(p.body)||!Number.isFinite(p.longitude)||p.longitude<0||p.longitude>=360)||new Set(fixed.map(p=>p.body)).size!==fixed.length)throw new ObservationInputError('Referência natal inválida.');
 if(!Array.isArray(input.axisIds)||new Set(input.axisIds).size!==input.axisIds.length||input.axisIds.some(a=>!angles.has(a)))throw new ObservationInputError('Seleção de eixos inválida.');
 if(!Array.isArray(input.fixedAxes||[])||(input.fixedAxes||[]).length>4||(input.fixedAxes||[]).some(a=>!a||!angles.has(a.body)||!Number.isFinite(a.longitude)))throw new ObservationInputError('Eixos fixos inválidos.');
 if(ctx.axisMode==='FIXED'&&ctx.birthTimeKnown&&input.axisIds.some(id=>!(input.fixedAxes||[]).some(a=>a.body===id)))throw new ObservationInputError('Eixo fixo selecionado sem longitude natal.');
 if(new Set(defs.map(d=>d.aspect)).size!==defs.length||defs.some(d=>!['MAJOR','MINOR','KEPLERIAN'].includes(d.group)))throw new ObservationInputError('Famílias de aspectos inválidas ou duplicadas.');
 if(!Array.isArray(input.hiddenGeometryKeys||[])||(input.hiddenGeometryKeys||[]).length>512||(input.hiddenGeometryKeys||[]).some(k=>typeof k!=='string'||k.length>512))throw new ObservationInputError('Filtros de geometrias inválidos.');
 if(typeof input.selectionSignature!=='string'||input.selectionSignature.length>100000)throw new ObservationInputError('Identidade da seleção inválida.');
 if((ctx.axisMode==='MOVING'||input.includeHouses)&&(!Number.isFinite(ctx.latitude)||!Number.isFinite(ctx.longitude)||Math.abs(ctx.latitude)>=89||Math.abs(ctx.longitude)>180))throw new ObservationInputError('Local de referência indisponível.');
 const begun=performance.now(),deadline=begun+maxMs,sampler=createTemporalSampler(ctx),cache=new Map(),pairs=[];
 const dynamicAxes=ctx.birthTimeKnown!==false&&ctx.axisMode==='MOVING'?(input.axisIds||[]).filter(id=>angles.has(id)):[];
 const movingIds=[...ids,...dynamicAxes.filter(id=>['ASC','MC'].includes(id))];
 const bodyFilter=(a,b)=>!input.pairFilter||(!input.pairFilter.bodyA||input.pairFilter.bodyA==='ALL'||[a,b].includes(input.pairFilter.bodyA))&&(!input.pairFilter.bodyB||input.pairFilter.bodyB==='ALL'||[a,b].includes(input.pairFilter.bodyB));
 const amplo=input.visualOrbPolicy===VISUAL_ORB_POLICY_VERSION;
 if(input.visualOrbPolicy&&!amplo)throw new ObservationInputError('Política visual incompatível.');
 function addPair(a,b,scope){for(const d of defs){if(!permitted(a,b,d.aspect,scope)||!bodyFilter(a,b))continue;const orb=amplo?visualAmploOrb(a,b,d.aspect):d.orb;if(!Number.isFinite(orb))continue;pairs.push({a,b,scope,...d,orb,key:idFor(scope,a,b,d.aspect)});}}
 if(input.scopes?.includes('SKY'))for(let i=0;i<movingIds.length;i++)for(let j=i+1;j<movingIds.length;j++)addPair(movingIds[i],movingIds[j],'SKY');
 if(input.scopes?.includes('TRANSIT_NATAL'))for(const a of ids)for(const b of fixed)addPair(a,b.body,'TRANSIT_NATAL');
 if(pairs.length>18000)throw new ObservationInputError('Seleção de pares excede a capacidade do lote.');
 const fixedMap=new Map(fixed.map(p=>[p.body,p]));
 function at(t){
  if(performance.now()>deadline)throw new Error('TIME_BUDGET');
  t=Math.round(t);if(cache.has(t))return cache.get(t);
  const objects=new Map(movingIds.map(id=>[id,sampler.sample(id,t)])),rows=new Map();
  for(const pair of pairs){
   const a=objects.get(pair.a),b=pair.scope==='TRANSIT_NATAL'?fixedMap.get(pair.b):objects.get(pair.b);if(!a||!b)continue;
   const relative=norm(a.longitude-b.longitude),e1=wrap(relative-pair.angle),e2=wrap(relative-norm(360-pair.angle)),error=Math.abs(e1)<=Math.abs(e2)?e1:e2,orb=Math.abs(error);
   const velocity=(id,value)=>Number.isFinite(value.speedLongitude)?value.speedLongitude:wrap(sampler.sample(id,t+1000).longitude-sampler.sample(id,t-1000).longitude)/(2000/DAY);
   const va=velocity(pair.a,a),vb=pair.scope==='TRANSIT_NATAL'?0:velocity(pair.b,b);
   const eligible=(!angles.has(pair.a)&&!angles.has(pair.b))||ctx.birthTimeKnown!==false;
   rows.set(pair.key,{...pair,limitDegrees:pair.orb,error,orb,phaseValue:error*(va-vb),inside:eligible&&orb<=pair.orb,branch:String(a.branch)+'|'+String(b.branch)});
  }
  const selected=ids.map(id=>({body:id,...objects.get(id)})),geometries=new Map();
  if(input.includeGeometries){
   const types=new Set(defs.map(d=>d.aspect));
   for(const g of detectVisualGeometries(selected,amplo?{orbResolver:visualAmploOrb}:{}))if(!(input.hiddenGeometryKeys||[]).includes(g.key)&&g.aspects.every(a=>types.has(a.aspect)))geometries.set(g.key,g);
  }
  const value={t,objects,rows,geometries};cache.set(t,value);if(cache.size>16)cache.delete(cache.keys().next().value);return value;
 }
 const scalarRoot=(a,b,value)=>{let x=a,y=b,fx=value(x);if(fx===0)return x;if(value(y)===0)return y;while(y.t-x.t>1000){const m=at((x.t+y.t)/2),fm=value(m);if(fx*fm<=0)y=m;else{x=m;fx=fm;}}return at((x.t+y.t)/2);};
 const changeRoot=(a,b,predicate)=>{let x=a,y=b,v=predicate(a);while(y.t-x.t>1000){const m=at((x.t+y.t)/2);if(predicate(m)===v)x=m;else y=m;}return y;};
 const pending=[],events=[];let covered=start,complete=true,reason=null,steps=0;
 const step=dynamicAxes.length?20000:60000;
 // Adaptive rollout deliberately limited to ordinary planets without axes or
 // multi-body figures. Other selections retain the validated fixed scanner.
 const useAdaptive=adaptive&&ctx.axisMode==='NONE'&&ids.every(id=>planets.has(id))&&(!input.includeGeometries||ids.length<3)&&!fixed.some(p=>angles.has(p.body));
 const maxAdaptiveStep=ids.includes('LUA')?3600000:21600000;
 let actualMaximumStep=step;
 function nextStep(p){
  if(!useAdaptive)return step;
  let dt=maxAdaptiveStep;
  const approach=(distance,velocity)=>{if(Number.isFinite(distance)&&Number.isFinite(velocity)&&Math.abs(velocity)>1e-9)dt=Math.min(dt,Math.max(step,Math.abs(distance/velocity)*DAY*.4));};
  for(const row of p.rows.values()){
   const a=p.objects.get(row.a),b=row.scope==='TRANSIT_NATAL'?null:p.objects.get(row.b),velocity=(a.speedLongitude||0)-(b?.speedLongitude||0);
   approach(row.error,velocity);approach(Math.abs(row.error)-row.limitDegrees,velocity);
  }
  for(const id of ids){const o=p.objects.get(id),v=o.speedLongitude,pos=norm(o.longitude)%30;approach(v>=0?30-pos:pos,v);
   // Refine around stationary bands/zeros without assigning new thresholds.
   const threshold=STATIONARY_PROFILE.eligibleBodies[id]?.stationaryThresholdArcsecPerDay/3600;
   if(threshold&&Math.abs(v)<threshold*2)dt=Math.min(dt,3600000);
  }
  return Math.round(Math.max(step,dt));
 }
 const speed=(p,id)=>p.objects.get(id)?.speedLongitude;
 const motionState=(p,id)=>calculateStationaryState({bodyId:id,instantJulianDay:p.t/DAY+2440587.5,speedLongitudeDegPerDay:speed(p,id),speedAt:jd=>sampler.sample(id,(jd-2440587.5)*DAY).speedLongitude,ephemeris:'Swiss Ephemeris',allBodiesDeadline:Date.now()+Math.max(0,deadline-performance.now())}).motion.motionState;
 const band=(p,id)=>{const v=speed(p,id),profile=STATIONARY_PROFILE.eligibleBodies[id];return !Number.isFinite(v)?'UNKNOWN':profile&&Math.abs(v)<=profile.stationaryThresholdArcsecPerDay/3600?'STATIONARY_BAND':v<0?'R':'D';};
 function axisLongitude(p,axis){return ctx.axisMode==='FIXED'?(input.fixedAxes||[]).find(a=>a.body===axis)?.longitude:sampler.sample(axis,p.t).longitude;}
 const add=(p,type,detail)=>{
  const row=detail.relationId?p.rows.get(detail.relationId):null;
  const observation=row?{orb:row.orb,longitudeA:p.objects.get(row.a).longitude,longitudeB:(row.scope==='TRANSIT_NATAL'?fixedMap.get(row.b):p.objects.get(row.b)).longitude}:{};
  pending.push({timestampMs:p.t,type,...detail,...observation,_snapshot:{objects:p.objects,rows:new Map([...p.rows].filter(([,r])=>r.inside)),geometries:p.geometries}});
 };
 let previous=at(start);
 while(covered<end){
  if(steps++>=maxSteps||events.length>=maxEvents){complete=false;reason=events.length>=maxEvents?'EVENT_BUDGET':'SAMPLE_BUDGET';break;}
  pending.length=0;
  try{
   const dt=nextStep(previous);actualMaximumStep=Math.max(actualMaximumStep,dt);
   const next=at(Math.min(end,previous.t+dt));
   for(const [key,a] of previous.rows){
    const b=next.rows.get(key);if(a.branch!==b.branch)continue;
    const meta={relationId:key,bodyA:a.a,bodyB:a.b,aspect:a.aspect,scope:a.scope,limitDegrees:a.limitDegrees,policy:'SKYNOW_VISUAL'};
    if(a.inside!==b.inside){const root=changeRoot(previous,next,p=>p.rows.get(key).inside);add(root,b.inside?'ASPECT_ENTER':'ASPECT_EXIT',meta);}
    if(Math.abs(a.error-b.error)<180&&(a.error*b.error<0||b.error===0)){const root=scalarRoot(previous,next,p=>p.rows.get(key).error);if(root.rows.get(key).inside)add(root,'ASPECT_EXACT',meta);}
    if((a.inside||b.inside)&&a.phaseValue*b.phaseValue<0&&Math.abs(a.error-b.error)<180){const root=scalarRoot(previous,next,p=>p.rows.get(key).phaseValue);if(root.rows.get(key).inside)add(root,'PHASE_CHANGE',{...meta,from:a.phaseValue<0?'A':'S',to:b.phaseValue<0?'A':'S'});}
   }
   for(const id of ids){
    if(TEMPORAL_ECLIPSES.has(id)||Object.hasOwn(TEMPORAL_STARS,id))continue;
    const a=previous.objects.get(id),b=next.objects.get(id),signA=Math.floor(norm(a.longitude)/30),signB=Math.floor(norm(b.longitude)/30);
    if(signA!==signB)add(changeRoot(previous,next,p=>Math.floor(norm(p.objects.get(id).longitude)/30)),'SIGN_INGRESS',{body:id,from:signA,to:signB});
    if(band(previous,id)!==band(next,id))add(changeRoot(previous,next,p=>band(p,id)),'MOTION_CHANGE',{body:id,from:motionState(previous,id),to:motionState(next,id),profile:STATIONARY_PROFILE.id});
    const oob=p=>Number.isFinite(p.objects.get(id)?.declination)?Math.abs(p.objects.get(id).declination)>23.436:null;
    if(planets.has(id)&&oob(previous)!==null&&oob(next)!==null&&oob(previous)!==oob(next)){
     const root=changeRoot(previous,next,oob);
     add(root,oob(next)?'OOB_ENTER':'OOB_EXIT',{body:id,from:oob(previous)?'OOB':'IN_BOUNDS',to:oob(next)?'OOB':'IN_BOUNDS',declination:root.objects.get(id).declination,limitDegrees:23.436,policy:'SKYNOW_OOB_23_436'});
    }
    if(Number.isFinite(a.speedLongitude)&&Number.isFinite(b.speedLongitude)&&(a.speedLongitude*b.speedLongitude<0||b.speedLongitude===0&&a.speedLongitude!==0))add(scalarRoot(previous,next,p=>speed(p,id)),'STATION_EXACT',{body:id,profile:STATIONARY_PROFILE.id});
    if(ctx.birthTimeKnown!==false&&planets.has(id)&&ctx.axisMode!=='NONE')for(const axis of input.axisIds||[]){
     const ea=wrap(a.longitude-axisLongitude(previous,axis)),eb=wrap(b.longitude-axisLongitude(next,axis));
     if(Number.isFinite(ea)&&Number.isFinite(eb)&&(ea*eb<0||eb===0&&ea!==0)&&Math.abs(ea-eb)<180)add(scalarRoot(previous,next,p=>wrap(p.objects.get(id).longitude-axisLongitude(p,axis))),'AXIS_CROSSING',{body:id,axis,axisMode:ctx.axisMode});
    }
   }
   const geoKeys=new Set([...previous.geometries.keys(),...next.geometries.keys()]);
   for(const key of geoKeys)if(previous.geometries.has(key)!==next.geometries.has(key)){
    const g=next.geometries.get(key)||previous.geometries.get(key);add(changeRoot(previous,next,p=>p.geometries.has(key)),next.geometries.has(key)?'GEOMETRY_FORMED':'GEOMETRY_DISSOLVED',{geometryKey:key,geometryId:g.geometryId,bodies:g.planets,scope:'SKY'});
   }
   events.push(...pending);covered=next.t;previous=next;
  }catch(error){if(['TIME_BUDGET'].includes(error.message)){complete=false;reason=error.message;break;}throw error;}
 }
 const grouped=[];
 for(const event of events.sort((a,b)=>a.timestampMs-b.timestampMs)){
  let group=grouped.at(-1);if(!group||event.timestampMs-group.timestampMs>1000){group={timestampMs:event.timestampMs,utc:new Date(event.timestampMs).toISOString(),reasons:[],_snapshot:event._snapshot};grouped.push(group);}
  const {_snapshot,...detail}=event;
  if(!group.reasons.some(r=>r.type===event.type&&r.relationId===event.relationId&&r.body===event.body&&r.axis===event.axis&&r.geometryKey===event.geometryKey))group.reasons.push(detail);
 }
 for(const event of grouped){
  // Serialization uses already computed snapshots; native classification retains
  // unresolved states rather than manufacturing SD/SR from a speed threshold.
  const p=event._snapshot,jd=event.timestampMs/DAY+2440587.5;
  let houses=null;if(input.includeHouses)houses=calculateHouses({julianDay:jd,latitude:ctx.latitude,longitude:ctx.longitude,houseSystem:ctx.houseSystem||'P'});
  const moving=ids.map(id=>{const value={body:id,...p.objects.get(id)},profile=STATIONARY_PROFILE.eligibleBodies[id];
   if(profile&&Number.isFinite(value.speedLongitude)){
    const motion=calculateStationaryState({bodyId:id,instantJulianDay:jd,speedLongitudeDegPerDay:value.speedLongitude,speedAt:instant=>sampler.sample(id,(instant-2440587.5)*DAY).speedLongitude,ephemeris:'Swiss Ephemeris',allBodiesDeadline:Date.now()+Math.max(0,deadline-performance.now())});
    value.motion=motion.motion;
   }
   if(houses)value.house=Math.floor(calculateHousePosition({armc:houses.armc,latitude:ctx.latitude,obliquity:calculateObliquity(jd),houseSystem:ctx.houseSystem||'P',longitude:value.longitude,latitudeEcliptica:value.latitudeEcliptica||0}));
   return value;});
  event.frame={moving,houses:houses?.houses||[],angles:houses?.angles||null,aspects:[...p.rows.values()].filter(r=>r.inside).map(r=>({bodyA:r.a,bodyB:r.b,aspect:r.aspect,orb:r.orb,phase:event.reasons.some(e=>e.type==='ASPECT_EXACT'&&e.relationId===r.key)?'EXACT':Math.abs(r.error)<1e-5?'EXACT':r.phaseValue<0?'APPLYING':'SEPARATING',scope:r.scope,status:'VISUAL',allowedOrb:r.limitDegrees,group:r.group})),geometries:[...p.geometries.values()]};
  event.eventId=crypto.createHash('sha256').update(stable({context:input.context,selection:input.selectionSignature,timestampMs:event.timestampMs,reasons:event.reasons})).digest('hex');
  delete event._snapshot;
 }
 return {schemaVersion:'SKYNOW_AUTO_EVENTS_V1',complete,reason,startUtc:input.startUtc,endUtc:input.endUtc,coveredThroughUtc:new Date(covered).toISOString(),events:grouped,coverage:{searchStrategy:useAdaptive?'ADAPTIVE_PLANETARY_V1':'FIXED_V1',sampledSegments:steps,maximumSamplingStepMs:actualMaximumStep,rootPrecisionMs:1000,shorterThanSamplingStep:'NOT_CERTIFIED',discontinuousDerivedBranches:'NOT_INTERPOLATED',stationaryProfile:STATIONARY_PROFILE.id,ephemerisVersion:getEphemerisVersion(),policy:'SKYNOW_VISUAL_NOT_METHOD_RANKING'},calculationMs:Math.round(performance.now()-begun)};
}
