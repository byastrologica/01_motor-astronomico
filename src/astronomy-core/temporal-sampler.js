import {calculateBody,calculateFixedStar,calculateHouses,calculateHousePosition,calculateObliquity,bodyIds} from './swiss-ephemeris-adapter.js';
const DAY=86400000,norm=x=>((x%360)+360)%360;
export const TEMPORAL_STARS=Object.freeze({ALDEBARAN:'Aldebaran',ANTARES:'Antares',REGULUS:'Regulus',FOMALHAUT:'Fomalhaut',SIRIUS:'Sirius',SPICA:'Spica',ALGOL:'Algol'});
export const TEMPORAL_ANGLES=new Set(['ASC','MC','DC','IC']);
export const TEMPORAL_ECLIPSES=new Set(['ECLIPSE_SOL_PRE_NATAL','ECLIPSE_LUA_PRE_NATAL','ECLIPSE_SOL_POS_NATAL','ECLIPSE_LUA_POS_NATAL']);
export const isTemporalBody=id=>Object.hasOwn(bodyIds,id)||id==='NODO_SUL'||id==='FORTUNA'||TEMPORAL_ANGLES.has(id)||Object.hasOwn(TEMPORAL_STARS,id)||TEMPORAL_ECLIPSES.has(id);
export function createTemporalSampler(context,{maxEntries=30000}={}){
 const cache=new Map(),houses=new Map();
 const remember=(map,key,value)=>{map.set(key,value);if(map.size>maxEntries)map.delete(map.keys().next().value);return value;};
 const houseAt=t=>{
  if(houses.has(t))return houses.get(t);
  if(!context.birthTimeKnown)throw new Error('NOT_APPLICABLE_HD');
  if(!Number.isFinite(context.latitude)||Math.abs(context.latitude)>=90||!Number.isFinite(context.longitude)||Math.abs(context.longitude)>180)throw new Error('OBSERVER_LOCATION_UNAVAILABLE');
  return remember(houses,t,calculateHouses({julianDay:t/DAY+2440587.5,latitude:context.latitude,longitude:context.longitude,houseSystem:context.houseSystem||'P'}));
 };
 function sample(id,t){
  t=Math.round(t);const key=id+'|'+t;if(cache.has(key))return cache.get(key);const jd=t/DAY+2440587.5;let value;
  if(Object.hasOwn(bodyIds,id))value={...calculateBody(jd,bodyIds[id]),branch:'CONTINUOUS'};
  else if(id==='NODO_SUL'){const north=sample('NODO_NORTE',t);value={...north,longitude:norm(north.longitude+180),declination:-north.declination};}
  else if(Object.hasOwn(TEMPORAL_STARS,id))value={...calculateFixedStar(jd,TEMPORAL_STARS[id]),branch:'CONTINUOUS'};
  else if(TEMPORAL_ECLIPSES.has(id)){
   const fixed=context.fixedEclipses?.find(e=>e.id===id);if(!fixed||!Number.isFinite(fixed.longitude)||!Number.isFinite(fixed.eclipseJulianDay))throw new Error('ECLIPSE_IDENTITY_UNAVAILABLE');
   value={longitude:fixed.longitude,declination:Number.isFinite(fixed.declination)?fixed.declination:null,speedLongitude:0,branch:'FIXED_ECLIPSE',eclipseJulianDay:fixed.eclipseJulianDay,eclipseUtcDateTime:fixed.eclipseUtcDateTime||null};
  }else if(TEMPORAL_ANGLES.has(id)){
   const h=houseAt(t),base=['ASC','DC'].includes(id)?h.angles.asc:h.angles.mc;
   // No uncontracted declination is invented for mathematical angles.
   value={longitude:norm(base+(['DC','IC'].includes(id)?180:0)),declination:null,branch:'CONTINUOUS'};
  }else if(id==='FORTUNA'){
   const h=houseAt(t),sun=sample('SOL',t),moon=sample('LUA',t);
   const solarHouse=calculateHousePosition({armc:h.armc,latitude:context.latitude,obliquity:calculateObliquity(jd),houseSystem:context.houseSystem||'P',longitude:sun.longitude,latitudeEcliptica:sun.latitudeEcliptica});
   const diurnal=solarHouse>=7&&solarHouse<13;
   // Exact formula/sect criterion used by Motor 02 createFortunaObject.
   value={longitude:norm(h.angles.asc+(diurnal?moon.longitude-sun.longitude:sun.longitude-moon.longitude)),declination:null,branch:diurnal?'FORTUNA_DIURNAL':'FORTUNA_NOCTURNAL'};
  }else throw new Error('UNSUPPORTED_TEMPORAL_BODY');
  if(!Number.isFinite(value.longitude))throw new Error('EPHEMERIS_LONGITUDE_UNAVAILABLE');
  return remember(cache,key,value);
 }
 return {sample,get cachedPositions(){return cache.size;}};
}
