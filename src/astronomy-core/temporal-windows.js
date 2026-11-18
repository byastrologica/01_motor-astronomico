import crypto from 'node:crypto';
import {createTemporalSampler,isTemporalBody,TEMPORAL_STARS,TEMPORAL_ANGLES,TEMPORAL_ECLIPSES} from './temporal-sampler.js';
import {searchTemporalWindow,TEMPORAL_ANGLES_BY_ASPECT} from './temporal-window-search.js';
import {getEphemerisVersion} from './swiss-ephemeris-adapter.js';
const cache=new Map(),derived=new Set(['NODO_NORTE','NODO_SUL','LILITH_MEDIA','LILITH_VERDADEIRA','FORTUNA',...TEMPORAL_ECLIPSES]),asteroids=new Set(['CERES','PALLAS','JUNO','VESTA']);
const planets=new Set(['SOL','LUA','MERCURIO','VENUS','MARTE','JUPITER','SATURNO','URANO','NETUNO','PLUTAO']);
const major=new Set(['CONJUNCTION','SEXTILE','SQUARE','TRINE','OPPOSITION']);
export class TemporalContractError extends Error{}
export const stableTemporalJson=v=>Array.isArray(v)?'['+v.map(stableTemporalJson).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableTemporalJson(v[k])).join(',')+'}':JSON.stringify(v);
export function isTemporalPairPermitted(row){
 const a=row.bodyA,b=row.bodyB,t=row.aspect;if(!a||!b||a===b||TEMPORAL_ANGLES.has(a)&&TEMPORAL_ANGLES.has(b)||derived.has(a)&&derived.has(b)||Object.hasOwn(TEMPORAL_STARS,a)&&Object.hasOwn(TEMPORAL_STARS,b))return false;
 for(const [body,other] of [[a,b],[b,a]]){
  if(asteroids.has(body)&&(!(planets.has(other)||['ASC','MC'].includes(other))||!major.has(t)&&!['PARALLEL','CONTRAPARALLEL'].includes(t)))return false;
  if(TEMPORAL_ECLIPSES.has(body)&&(!(planets.has(other)||TEMPORAL_ANGLES.has(other))||!['CONJUNCTION','OPPOSITION'].includes(t)))return false;
  if(Object.hasOwn(TEMPORAL_STARS,body)&&!['CONJUNCTION','PARALLEL','CONTRAPARALLEL'].includes(t))return false;
  if(TEMPORAL_ANGLES.has(body)&&!(planets.has(other)&&['ASC','MC'].includes(body)&&major.has(t)||Object.hasOwn(TEMPORAL_STARS,other)&&['ASC','MC'].includes(body)&&t==='CONJUNCTION'||TEMPORAL_ECLIPSES.has(other)&&['CONJUNCTION','OPPOSITION'].includes(t)))return false;
 }
 return true;
}
export function calculateTemporalWindows(input){
 if(!input||input.schemaVersion!=='TEMPORAL_WINDOW_REQUEST_V1'||!input.context||!Array.isArray(input.relations)||input.relations.length>512)throw new TemporalContractError('Contrato temporal inválido (máximo 512 relações).');
 const {sourceSignature,...payload}=input,signature=crypto.createHash('sha256').update(stableTemporalJson(payload)).digest('hex');
 if(sourceSignature!==signature)throw new TemporalContractError('Assinatura da requisição temporal inconsistente.');
 const referenceMs=Date.parse(input.context.referenceUtc);
 if(!Number.isFinite(referenceMs)||!String(input.context.referenceUtc).endsWith('Z')||referenceMs<Date.UTC(1600,0,1)||referenceMs>Date.UTC(2400,11,31))throw new TemporalContractError('Referência UTC fora do intervalo disponível (1600–2400).');
 try{new Intl.DateTimeFormat('pt-BR',{timeZone:input.context.timeZone}).format(referenceMs);}catch{throw new TemporalContractError('Fuso de apresentação inválido.');}
 const ids=new Set();for(const row of input.relations){
  if(typeof row.relationId!=='string'||!row.relationId||ids.has(row.relationId)||!['CORE','AMPLO'].includes(row.classification)||!isTemporalPairPermitted(row)||(row.limitDegrees!==null&&(!Number.isFinite(row.limitDegrees)||row.limitDegrees<=0||row.limitDegrees>15))||!['PARALLEL','CONTRAPARALLEL'].includes(row.aspect)&&!Object.hasOwn(TEMPORAL_ANGLES_BY_ASPECT,row.aspect))throw new TemporalContractError('Relação temporal inválida, duplicada ou excluída pelas regras de pares/técnicas.');
  if(Number.isFinite(row.exactAngle)&&Math.abs(row.exactAngle-TEMPORAL_ANGLES_BY_ASPECT[row.aspect])>1e-5)throw new TemporalContractError('Ângulo exato incompatível com o tipo de aspecto.');ids.add(row.relationId);
 }
 if(cache.has(signature)){const result=cache.get(signature);cache.delete(signature);cache.set(signature,result);return {...result,cacheHit:true};}
 const started=performance.now(),deadline=started+18000,provider=createTemporalSampler(input.context),results=[];
 for(const relation of input.relations){
  const row={...relation,guards:{}};
  const angular=[row.bodyA,row.bodyB].some(id=>TEMPORAL_ANGLES.has(id));
  if(angular&&[row.bodyA,row.bodyB].some(id=>Object.hasOwn(TEMPORAL_STARS,id))){row.guards.sameSign=true;const star=[row.bodyA,row.bodyB].find(id=>Object.hasOwn(TEMPORAL_STARS,id));row.guards.maxOrbDegrees=input.context.firstMagnitudeStars?.includes(star)?1.5:1;}
  if(angular&&[row.bodyA,row.bodyB].some(id=>TEMPORAL_ECLIPSES.has(id)))row.guards.maxOrbDegrees=2;
  try{
   if(row.limitDegrees===null)throw new Error('SOURCE_LIMIT_NOT_CONFIGURED');
   if(!isTemporalBody(row.bodyA)||!isTemporalBody(row.bodyB))throw new Error('UNSUPPORTED_SOURCE_BODY');
   if(!input.context.birthTimeKnown&&[row.bodyA,row.bodyB].some(id=>TEMPORAL_ANGLES.has(id)||id==='FORTUNA'))throw new Error('NOT_APPLICABLE_HD');
   results.push(searchTemporalWindow(row,referenceMs,provider.sample,{deadline}));
  }catch(error){results.push({relationId:row.relationId,classification:row.classification,status:'NOT_COMPUTED',reason:error.message,limitDegrees:row.limitDegrees,limitSource:row.limitSource});}
 }
 const computed=results.filter(r=>r.status==='COMPUTED').length;
 const result={schemaVersion:'ASPECT_TEMPORAL_WINDOWS_V1',sourceSignature:signature,reference:{utc:input.context.referenceUtc,timeZone:input.context.timeZone,timeCertainty:input.context.birthTimeKnown?'KNOWN_BIRTH_TIME':'HD_NOON_CALCULATION_REFERENCE'},source:{ephemeris:'Swiss Ephemeris',ephemerisVersion:getEphemerisVersion(),capturePolicyVersion:input.capturePolicyVersion,aspectVocabularyVersion:input.aspectVocabularyVersion},summary:{requestedCount:results.length,computedCount:computed,partialCount:results.filter(r=>r.status==='PARTIAL').length,notComputedCount:results.filter(r=>r.status==='NOT_COMPUTED').length,referenceOutsideCount:results.filter(r=>r.status==='REFERENCE_OUTSIDE_SELECTED_WINDOW').length,complete:computed===results.length},results,execution:{calculationMs:Math.round((performance.now()-started)*100)/100,samplingProfiles:['INTRADAY','FAST','INTERMEDIATE','SLOW'],maxSamplesPerRelation:24000,context:'SAME_SKY_AT_REFERENCE_NOT_NATAL_TRANSITS'},cacheHit:false};
 // Do not cache transient budget/source failures as if they were completed work.
 if(result.summary.complete){cache.set(signature,result);if(cache.size>32)cache.delete(cache.keys().next().value);}return result;
}
