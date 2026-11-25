import test from 'node:test';import assert from 'node:assert/strict';
import {scanObservationEvents} from '../src/observation-events/scan-events.js';
const request={schemaVersion:'SKYNOW_AUTO_REQUEST_V1',startUtc:'2026-11-24T00:20:00Z',endUtc:'2026-11-24T00:30:00Z',movingBodies:['LUA'],fixedObjects:[],fixedAxes:[],axisIds:[],aspectDefinitions:[],scopes:['SKY'],context:{birthTimeKnown:false,axisMode:'NONE'},includeHouses:false,includeGeometries:false,selectionSignature:'synthetic-oob'};
test('Moon OOB crossing at 21:24:40 Sao Paulo is captured with current visual limit',()=>{
 const r=scanObservationEvents(request),e=r.events.find(e=>e.reasons.some(r=>r.type==='OOB_ENTER'));assert.ok(e);assert.ok(Math.abs(e.timestampMs-Date.parse('2026-11-24T00:24:40Z'))<2000);const reason=e.reasons.find(r=>r.type==='OOB_ENTER');assert.equal(reason.limitDegrees,23.436);assert.equal(reason.body,'LUA');assert.equal(reason.from,'IN_BOUNDS');assert.equal(reason.to,'OOB');
});
test('unselected Moon cannot generate OOB capture',()=>{const r=scanObservationEvents({...request,movingBodies:['SOL']});assert.equal(r.events.some(e=>e.reasons.some(r=>r.type.startsWith('OOB_'))),false);});
test('OOB checkbox off suppresses event while retaining complete coverage',()=>{
 const result=scanObservationEvents({...request,captureEvents:{oob:false}});assert.equal(result.complete,true);assert.equal(result.events.some(e=>e.reasons.some(r=>r.type.startsWith('OOB_'))),false);
});
test('Mercury direct station emits explicit SD transitions',()=>{
 const r=scanObservationEvents({...request,startUtc:'2026-11-12T00:00:00Z',endUtc:'2026-11-15T00:00:00Z',movingBodies:['MERCURIO']});
 assert.equal(r.complete,true);assert.ok(r.events.some(e=>e.reasons.some(reason=>reason.type==='MOTION_CHANGE'&&reason.to==='SD')));
 assert.ok(r.events.some(e=>e.reasons.some(reason=>reason.type==='MOTION_CHANGE'&&reason.from==='SD'&&reason.to==='D')));
});
