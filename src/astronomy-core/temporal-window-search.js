const DAY=86400000,norm=x=>((x%360)+360)%360,wrap=x=>norm(x+180)-180;
export const TEMPORAL_ANGLES_BY_ASPECT=Object.freeze({CONJUNCTION:0,SEXTILE:60,SQUARE:90,TRINE:120,OPPOSITION:180,SEMISEXTILE:30,SEMISQUARE:45,SESQUIQUADRATE:135,QUINCUNX:150,QUINTILE:72,BIQUINTILE:144,SEPTILE:360/7,BISEPTILE:720/7,TRISEPTILE:1080/7,NOVILE:40,BINOVILE:80,QUADNOVILE:160});
const intraday=new Set(['ASC','MC','DC','IC','FORTUNA']);
const slow=new Set(['JUPITER','SATURNO','URANO','NETUNO','PLUTAO','QUIRON','NODO_NORTE','NODO_SUL','LILITH_MEDIA','ALDEBARAN','ANTARES','REGULUS','FOMALHAUT','SIRIUS','SPICA','ALGOL']);
const rates={SOL:1.2,LUA:18,MERCURIO:4,VENUS:2,MARTE:1.5,JUPITER:.4,SATURNO:.25,URANO:.2,NETUNO:.12,PLUTAO:.15,QUIRON:.5,NODO_NORTE:.5,NODO_SUL:.5,LILITH_MEDIA:.2,CERES:2,PALLAS:2,JUNO:2,VESTA:2,ASC:3000,MC:1500,DC:3000,IC:1500,FORTUNA:4000};
export function temporalSearchProfile(row){
 const ids=[row.bodyA,row.bodyB];let p;
 if(ids.some(id=>intraday.has(id)))p={id:'INTRADAY',maxStepMs:60000,maxDays:4,precisionMs:1000};
 else if(ids.includes('LUA'))p={id:'FAST',maxStepMs:3600000,maxDays:730,precisionMs:60000};
 else if(ids.some(id=>['SOL','MERCURIO','VENUS','MARTE'].includes(id)))p={id:'FAST',maxStepMs:6*3600000,maxDays:1826,precisionMs:60000};
 else if(ids.every(id=>slow.has(id)||id.startsWith('ECLIPSE_')))p={id:'SLOW',maxStepMs:7*DAY,maxDays:36525,precisionMs:60000};
 else p={id:'INTERMEDIATE',maxStepMs:6*3600000,maxDays:7305,precisionMs:60000};
 const maxRate=ids.reduce((sum,id)=>sum+(rates[id]??.01),0);
 return {...p,stepMs:Math.max(1000,Math.min(p.maxStepMs,row.limitDegrees/maxRate*DAY/4))};
}
function eventPosition(body,value){
 const longitude=norm(value.longitude),within=longitude%30;
 const signIndex=Math.floor(longitude/30),sign=['ARIES','TAURUS','GEMINI','CANCER','LEO','VIRGO','LIBRA','SCORPIO','SAGITTARIUS','CAPRICORN','AQUARIUS','PISCES'][signIndex];
 return {body,longitudeDegrees:longitude,sign,signIndex,degreeWithinSign:within,declinationDegrees:Number.isFinite(value.declination)?value.declination:null,...(value.eclipseJulianDay?{eclipseJulianDay:value.eclipseJulianDay,eclipseUtcDateTime:value.eclipseUtcDateTime}:{}),...(body==='FORTUNA'?{formulaBranch:value.branch}:{})};
}
/** One connected window containing the source reference, with real ephemerides.
 * Profiles tune numerical work, never eligibility or method orbs. */
export function searchTemporalWindow(row,referenceMs,sample,{deadline=Infinity,maxSamples=24000,profile=temporalSearchProfile(row)}={}){
 const cache=new Map(),precision=profile.precisionMs,declination=['PARALLEL','CONTRAPARALLEL'].includes(row.aspect);
 let orientation=null;const limit=Math.min(row.limitDegrees,row.guards?.maxOrbDegrees??Infinity);
 const at=t=>{
  t=Math.round(t);if(cache.has(t))return cache.get(t);
  if(cache.size>=maxSamples)throw new Error('SEARCH_SAMPLE_LIMIT');if(performance.now()>deadline)throw new Error('SEARCH_TIME_LIMIT');
  const a=sample(row.bodyA,t),b=sample(row.bodyB,t);let e;
  if(declination){if(!Number.isFinite(a.declination)||!Number.isFinite(b.declination))throw new Error('DECLINATION_UNAVAILABLE');e=a.declination+(row.aspect==='PARALLEL'?-b.declination:b.declination);}
  else{
   const relative=norm(a.longitude-b.longitude),angle=row.exactAngle??TEMPORAL_ANGLES_BY_ASPECT[row.aspect];
   if(!Number.isFinite(angle))throw new Error('UNSUPPORTED_TEMPORAL_ASPECT');
   if(orientation===null)orientation=Math.abs(wrap(relative-angle))<=Math.abs(wrap(relative-norm(360-angle)))?angle:norm(360-angle);
   e=wrap(relative-orientation);
  }
  const sameSign=!row.guards?.sameSign||Math.floor(norm(a.longitude)/30)===Math.floor(norm(b.longitude)/30);
  const p={t,e,orb:Math.abs(e),eligible:sameSign,branch:a.branch+'|'+b.branch,a,b};cache.set(t,p);return p;
 };
 const center=at(referenceMs),inside=p=>p.eligible&&p.branch===center.branch&&p.orb<=limit;
 if(!inside(center)&&!(center.eligible&&center.orb<=limit+1e-7))return {relationId:row.relationId,classification:row.classification,status:'REFERENCE_OUTSIDE_SELECTED_WINDOW',referenceOrbDegrees:center.orb,limitDegrees:row.limitDegrees,profile:profile.id,samples:cache.size};
 if(Number.isFinite(row.measuredOrbDegrees)&&Math.abs(center.orb-row.measuredOrbDegrees)>1e-4)throw new Error('SOURCE_REFERENCE_ORB_MISMATCH');
 const dt=Math.max(1000,Math.min(profile.stepMs/8,3600000));
 const derivative=p=>{const a=at(p.t-dt),b=at(p.t+dt);if(a.branch!==b.branch)return null;return (declination?b.e-a.e:wrap(b.e-a.e))/(2*dt);};
 const root=(left,right,value)=>{
  let a=left,b=right,fa=value(a),fb=value(b);if(fa===0)return a;if(fb===0)return b;
  if(!Number.isFinite(fa)||!Number.isFinite(fb)||fa*fb>0)throw new Error('UNBRACKETED_TEMPORAL_ROOT');
  while(Math.abs(b.t-a.t)>precision){const m=at((a.t+b.t)/2),fm=value(m);if(!Number.isFinite(fm))return m;if(fm===0)return m;if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}}
  return at((a.t+b.t)/2);
 };
 const boundary=(a,b)=>{let yes=a,no=b;while(Math.abs(yes.t-no.t)>precision){const m=at((yes.t+no.t)/2);if(inside(m))yes=m;else no=m;}return at((yes.t+no.t)/2);};
 const paths=[],ends=[],endReasons=[];
 for(const direction of [-1,1]){
  const path=[center];let previous=center,found=null,reason='SEARCH_HORIZON_LIMIT';
  const horizon=referenceMs+direction*profile.maxDays*DAY;
  for(let i=1;;i++){
   const t=referenceMs+direction*i*profile.stepMs;
   if((direction<0?t<horizon:t>horizon)||t<Date.UTC(1600,0,1)||t>Date.UTC(2400,11,31)){reason='SEARCH_HORIZON_LIMIT';break;}
   const next=at(t);const da=derivative(previous),db=derivative(next);
   if(previous.branch===next.branch&&Number.isFinite(da)&&Number.isFinite(db)&&da*db<0){
    const station=root(previous,next,derivative);
    if(!inside(station)){found=boundary(previous,station);reason=station.branch!==center.branch?'FORMULA_BRANCH_BOUNDARY':!station.eligible?'PAIR_CONSTRAINT_BOUNDARY':'ORB_BOUNDARY';path.push(found);break;}
    path.push(station);
   }
   if(!inside(next)){found=boundary(previous,next);reason=next.branch!==center.branch?'FORMULA_BRANCH_BOUNDARY':!next.eligible?'PAIR_CONSTRAINT_BOUNDARY':'ORB_BOUNDARY';path.push(found);break;}
   path.push(next);previous=next;
  }
  paths.push(path);ends.push(found);endReasons.push(reason);
 }
 const points=[...new Map([...paths[0].reverse(),...paths[1]].map(p=>[p.t,p])).values()].sort((a,b)=>a.t-b.t),exacts=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[i+1];if(a.e===0&&inside(a))exacts.push(a);
  if(b&&a.branch===b.branch&&a.eligible&&b.eligible&&a.e*b.e<0&&(declination||Math.abs(a.e-b.e)<180))exacts.push(root(a,b,p=>p.e));
 }
 const uniqueExacts=exacts.sort((a,b)=>a.t-b.t).filter((p,i,all)=>i===0||p.t-all[i-1].t>precision);
 const event=p=>p?{utc:new Date(p.t).toISOString(),timestampMs:p.t,orbDegrees:p.orb,coordinateSystem:declination?'EQUATORIAL_DECLINATION':'ECLIPTIC_LONGITUDE',positions:[eventPosition(row.bodyA,p.a),eventPosition(row.bodyB,p.b)]}:null;
 return {relationId:row.relationId,classification:row.classification,status:ends.every(Boolean)?'COMPUTED':'PARTIAL',limitDegrees:row.limitDegrees,limitSource:row.limitSource,profile:profile.id,precisionMs:precision,referenceOrbDegrees:center.orb,interval:{start:event(ends[0]),exact:uniqueExacts.map(event),end:event(ends[1])},boundaries:{start:endReasons[0],end:endReasons[1]},exactSearchStatus:uniqueExacts.length?'EXACT_EVENTS_FOUND':'NO_BRACKETED_EXACT_EVENT_IN_WINDOW',samples:cache.size,searchScope:'CONNECTED_FORMATION_WINDOW_CONTAINING_REFERENCE'};
}
