import {calculateBody,bodyIds,getEphemerisVersion} from './swiss-ephemeris-adapter.js';
const DAY=86400000,PLANETS=['SOL','LUA','MERCURIO','VENUS','MARTE','JUPITER','SATURNO','URANO','NETUNO','PLUTAO'];
const normalize=x=>((x%360)+360)%360,wrap=x=>normalize(x+180)-180;
const cache=new Map();
export class AngularWindowInputError extends Error {}
// Geocentric angular events only. The caller supplies its orb; this endpoint
// does not assign astrological status, scores, natal/transit direction or rules.
export function calculateAngularWindows(input){
 const {bodyA,bodyB,angle,orb,start,end}=input??{};
 const startMs=Date.parse(start),endMs=Date.parse(end);
 if(!PLANETS.includes(bodyA)||!PLANETS.includes(bodyB)||bodyA===bodyB||![0,60,90,120,180].includes(angle)||!Number.isFinite(orb)||orb<=0||orb>10||typeof start!=='string'||typeof end!=='string'||!start.endsWith('Z')||!end.endsWith('Z')||!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||endMs-startMs>121*DAY||startMs<Date.UTC(1600,0,1)||endMs>Date.UTC(2401,0,1))throw new AngularWindowInputError('Consulta angular inválida ou fora dos limites (1600–2400, até 121 dias).');
 const pair=[bodyA,bodyB].sort(),key=JSON.stringify([pair,angle,orb,startMs,endMs]);
 if(cache.has(key)){const result=cache.get(key);cache.delete(key);cache.set(key,result);return {...result,cacheHit:true};}
 const started=performance.now(),step=(pair.includes('LUA')?DAY/4:DAY),precision=60000,samples=new Map();
 const at=timestamp=>{
  const t=Math.round(timestamp);if(samples.has(t))return samples.get(t);
  if(samples.size>=1200)throw new AngularWindowInputError('Limite de 1200 amostras excedido.');
  const jd=t/DAY+2440587.5,a=calculateBody(jd,bodyIds[pair[0]]),b=calculateBody(jd,bodyIds[pair[1]]);
  const row={t,relative:normalize(a.longitude-b.longitude),speed:a.speedLongitude-b.speedLongitude,longitudes:{[pair[0]]:a.longitude,[pair[1]]:b.longitude}};samples.set(t,row);return row;
 };
 const bisect=(left,right,value)=>{
  let a=left,b=right,fa=value(a),fb=value(b);if(fa===0)return a;if(fb===0)return b;
  if(fa*fb>0)throw new Error('Evento sem bracket válido.');
  while(b.t-a.t>precision){const mid=at((a.t+b.t)/2),fm=value(mid);if(fm===0)return mid;if(fa*fm<=0){b=mid;fb=fm;}else{a=mid;fa=fm;}}
  return at((a.t+b.t)/2);
 };
 const count=Math.ceil((endMs-startMs)/step)+1,points=Array.from({length:count},(_,i)=>at(Math.min(endMs,startMs+i*step))),pivots=[points[0]];
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.speed*b.speed<0)pivots.push(bisect(a,b,p=>p.speed));pivots.push(b);}
 const intervals=[];
 for(const orientation of new Set([angle,normalize(360-angle)])){
  const error=p=>wrap(p.relative-orientation),g=p=>Math.abs(error(p))-orb,exacts=[],pieces=[];
  for(let i=1;i<pivots.length;i++){
   const a=pivots[i-1],b=pivots[i],ea=error(a),eb=error(b);if(ea===0)exacts.push(a.t);
   if(Math.abs(ea-eb)<180&&ea*eb<0){const exact=bisect(a,b,error);exacts.push(exact.t);pieces.push(a,exact);}else pieces.push(a);
  }
  pieces.push(pivots.at(-1));if(error(pivots.at(-1))===0)exacts.push(pivots.at(-1).t);
  const ordered=[...new Map(pieces.map(p=>[p.t,p])).values()].sort((a,b)=>a.t-b.t);let entry=g(ordered[0])<=0?null:undefined;
  for(let i=1;i<ordered.length;i++){
   const a=ordered[i-1],b=ordered[i],ga=g(a),gb=g(b);
   if(ga>0&&gb<=0)entry=bisect(a,b,g).t;
   if(ga<=0&&gb>0){intervals.push({entryMs:entry??null,exitMs:bisect(a,b,g).t,orientation});entry=undefined;}
  }
  if(g(ordered.at(-1))<=0)intervals.push({entryMs:entry??null,exitMs:null,orientation});
  for(const row of intervals.filter(i=>i.orientation===orientation))row.exactMs=exacts.filter(t=>t>=(row.entryMs??startMs)-precision&&t<=(row.exitMs??endMs)+precision).filter((t,i,all)=>!i||Math.abs(t-all[i-1])>precision);
 }
 intervals.sort((a,b)=>(a.entryMs??startMs)-(b.entryMs??startMs));
 const events=[...new Set(intervals.flatMap(i=>[i.entryMs,...i.exactMs,i.exitMs]).filter(Number.isFinite))].sort((a,b)=>a-b).map(t=>{const value=at(t);return {timestampMs:t,longitudes:value.longitudes,orbDegrees:Math.abs(Math.min(value.relative,360-value.relative)-angle)};});
 const result={schemaVersion:'GEOCENTRIC_ANGULAR_WINDOWS_V1',intervals,events,searchStartMs:startMs,searchEndMs:endMs,queries:samples.size,stepMs:step,precisionMs:precision,activeOrb:orb,source:'SWISS_EPHEMERIS',ephemerisVersion:getEphemerisVersion(),boundaryPolicy:'INCLUSIVE_ACTIVE_ORB',scope:'SAMPLED_INTERVAL_WITH_STATION_REFINEMENT',calculationMs:Math.round((performance.now()-started)*100)/100,cacheHit:false};
 cache.set(key,result);if(cache.size>256)cache.delete(cache.keys().next().value);return result;
}
