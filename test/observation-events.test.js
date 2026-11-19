import test from 'node:test';
import assert from 'node:assert/strict';
import {scanObservationEvents,ObservationInputError} from '../src/observation-events/scan-events.js';
import {createTemporalSampler} from '../src/astronomy-core/temporal-sampler.js';
import request from 'supertest';
import app from '../src/app.js';
import {VISUAL_ORB_POLICY_VERSION} from '../src/observation-events/shared/visual-amplo-policy.js';
test('visual AMPLO profile expands pair width without changing default scanner',()=>{
 const sampler=createTemporalSampler({birthTimeKnown:false}),sun=sampler.sample('SOL',Date.parse('2026-01-01T00:30:00Z'));
 const q={...base,scopes:['TRANSIT_NATAL'],movingBodies:['SOL'],fixedObjects:[{body:'SOL',longitude:sun.longitude},{body:'LUA',longitude:(sun.longitude+9)%360}],aspectDefinitions:[{aspect:'CONJUNCTION',angle:0,orb:6,group:'MAJOR'}]};
 const old=scanObservationEvents(q),wide=scanObservationEvents({...q,visualOrbPolicy:VISUAL_ORB_POLICY_VERSION});assert.ok(old.events.length);assert.equal(old.events.some(e=>e.frame.aspects.some(a=>a.bodyB==='LUA')),false);assert.ok(wide.events.some(e=>e.frame.aspects.some(a=>a.bodyB==='LUA'&&a.allowedOrb===10)));
});
const base={schemaVersion:'SKYNOW_AUTO_REQUEST_V1',startUtc:'2026-01-01T00:00:00Z',endUtc:'2026-01-01T01:00:00Z',movingBodies:['SOL','LUA'],fixedObjects:[],fixedAxes:[],axisIds:[],aspectDefinitions:[{aspect:'SQUARE',angle:90,orb:6,group:'MAJOR'}],scopes:['SKY'],context:{latitude:0,longitude:0,birthTimeKnown:true,axisMode:'NONE'},includeHouses:false,includeGeometries:false,selectionSignature:'synthetic-qa'};
test('native scanner returns explicit sampling/coverage and respects budgets',()=>{
 const result=scanObservationEvents(base,{maxSteps:2});assert.equal(result.complete,false);assert.equal(result.reason,'SAMPLE_BUDGET');assert.equal(result.coveredThroughUtc,'2026-01-01T00:02:00.000Z');assert.equal(result.coverage.shorterThanSamplingStep,'NOT_CERTIFIED');
 const next=scanObservationEvents({...base,startUtc:result.coveredThroughUtc});assert.equal(next.complete,true);assert.equal(Date.parse(next.coveredThroughUtc),Date.parse(base.endUtc));
});
test('both moving-moving and moving-natal exact events are separately identified',()=>{
 const sample=createTemporalSampler(base.context),mid=Date.parse('2026-01-01T00:30:00Z'),sun=sample.sample('SOL',mid),moon=sample.sample('LUA',mid),delta=((sun.longitude-moon.longitude)%360+360)%360,angle=Math.min(delta,360-delta);
 const query={...base,aspectDefinitions:[{aspect:'QA_EXACT',angle,orb:6,group:'MAJOR'},{aspect:'CONJUNCTION',angle:0,orb:6,group:'MAJOR'}],fixedObjects:[{body:'SOL',longitude:sun.longitude}],scopes:['SKY','TRANSIT_NATAL']};
 const result=scanObservationEvents(query),reasons=result.events.flatMap(e=>e.reasons);assert.equal(result.complete,true);assert.ok(reasons.some(e=>e.type==='ASPECT_EXACT'&&e.scope==='SKY'));assert.ok(reasons.some(e=>e.type==='ASPECT_EXACT'&&e.scope==='TRANSIT_NATAL'));assert.ok(result.events.every(e=>e.frame.aspects.every(a=>a.status==='VISUAL')));
});
test('north/south node opposition is excluded in every context',()=>{
 const r=scanObservationEvents({...base,movingBodies:['NODO_NORTE','NODO_SUL'],fixedObjects:[{body:'NODO_NORTE',longitude:100},{body:'NODO_SUL',longitude:280}],scopes:['SKY','TRANSIT_NATAL'],aspectDefinitions:[{aspect:'OPPOSITION',angle:180,orb:6,group:'MAJOR'}]});assert.ok(r.events.every(e=>e.frame.aspects.every(a=>!(new Set([a.bodyA,a.bodyB]).has('NODO_NORTE')&&new Set([a.bodyA,a.bodyB]).has('NODO_SUL')))));
});
test('fixed natal axes generate crossings and HD suppresses them',()=>{
 const sampler=createTemporalSampler(base.context),longitude=sampler.sample('SOL',Date.parse('2026-01-01T00:30:00Z')).longitude;
 const q={...base,movingBodies:['SOL'],axisIds:['ASC'],fixedAxes:[{body:'ASC',longitude}],context:{...base.context,axisMode:'FIXED'},aspectDefinitions:[]};const r=scanObservationEvents(q);assert.ok(r.events.some(e=>e.reasons.some(r=>r.type==='AXIS_CROSSING'&&r.axisMode==='FIXED')));
 const hd=scanObservationEvents({...q,context:{...q.context,birthTimeKnown:false}});assert.equal(hd.events.length,0);
});
test('moving local axes are scanned more densely and selected bodies are preserved',()=>{
 const r=scanObservationEvents({...base,endUtc:'2026-01-01T06:00:00Z',movingBodies:['SOL'],axisIds:['ASC','DC','MC','IC'],context:{...base.context,axisMode:'MOVING'},aspectDefinitions:[]},{maxEvents:50});assert.equal(r.coverage.maximumSamplingStepMs,20000);assert.ok(r.events.some(e=>e.reasons.some(r=>r.type==='AXIS_CROSSING')));assert.ok(r.events.every(e=>e.frame.moving.every(p=>p.body==='SOL')));
});
test('malformed scopes, dates, axes and duplicate natal IDs are rejected',()=>{
 for(const invalid of [{scopes:['UNKNOWN']},{endUtc:'2027-01-01T00:00:00Z'},{axisIds:['FOO']},{fixedObjects:[{body:'SOL',longitude:0},{body:'SOL',longitude:0}]}])assert.throws(()=>scanObservationEvents({...base,...invalid}),ObservationInputError);
});
test('Mercury station preserves canonical SR/R and refines the exact reversal',()=>{
 const r=scanObservationEvents({...base,startUtc:'2026-02-25T00:00:00Z',endUtc:'2026-02-27T00:00:00Z',movingBodies:['MERCURIO'],aspectDefinitions:[]});
 assert.equal(r.complete,true);assert.ok(r.events.some(e=>e.reasons.some(r=>r.type==='MOTION_CHANGE'&&r.to==='STATIONARY_BAND')&&e.frame.moving[0].motion.motionState==='SR'));
 const station=r.events.find(e=>e.reasons.some(r=>r.type==='STATION_EXACT'));assert.ok(station);assert.ok(Math.abs(station.timestampMs-Date.parse(station.frame.moving[0].motion.associatedExactStationUtc))<=1000);assert.equal(r.events.at(-1).frame.moving[0].motion.motionState,'R');
});
test('transit-natal reciprocal pairs never collapse into one identity',()=>{
 const sampler=createTemporalSampler(base.context),mid=Date.parse('2026-01-01T00:30:00Z'),sun=sampler.sample('SOL',mid),moon=sampler.sample('LUA',mid);
 const q={...base,scopes:['TRANSIT_NATAL'],fixedObjects:[{body:'SOL',longitude:moon.longitude},{body:'LUA',longitude:sun.longitude}],aspectDefinitions:[{aspect:'CONJUNCTION',angle:0,orb:6,group:'MAJOR'}]};
 const result=scanObservationEvents(q),exact=result.events.flatMap(e=>e.reasons).filter(r=>r.type==='ASPECT_EXACT');assert.ok(exact.some(r=>r.bodyA==='SOL'&&r.bodyB==='LUA'));assert.ok(exact.some(r=>r.bodyA==='LUA'&&r.bodyB==='SOL'));assert.equal(new Set(exact.map(r=>r.relationId)).size,2);
});
test('existing visual detector forms and dissolves selected geometries between frames',()=>{
 const defs=[['CONJUNCTION',0,6],['OPPOSITION',180,6],['TRINE',120,6],['SQUARE',90,6],['SEXTILE',60,4]].map(([aspect,angle,orb])=>({aspect,angle,orb,group:'MAJOR'}));
 const r=scanObservationEvents({...base,startUtc:'2026-01-02T00:00:00Z',endUtc:'2026-01-03T00:00:00Z',movingBodies:['SOL','LUA','MERCURIO','VENUS','MARTE','JUPITER','SATURNO','URANO','NETUNO','PLUTAO'],includeGeometries:true,aspectDefinitions:defs},{maxEvents:128});
 assert.equal(r.complete,true);const reasons=r.events.flatMap(e=>e.reasons);assert.ok(reasons.some(r=>r.type==='GEOMETRY_FORMED'&&r.geometryKey==='T_SQUARE|LUA|MERCURIO|SATURNO'));assert.ok(reasons.some(r=>r.type==='GEOMETRY_DISSOLVED'&&r.geometryKey==='T_SQUARE|LUA|MERCURIO|SATURNO'));
});
test('HTTP endpoint exposes the versioned contract and explicit bad-input response',async()=>{
 const ok=await request(app).post('/v1/observation-events').send({...base,endUtc:'2026-01-01T00:01:00Z'}).expect(200);assert.equal(ok.body.schemaVersion,'SKYNOW_AUTO_EVENTS_V1');assert.equal(ok.body.complete,true);
 const bad=await request(app).post('/v1/observation-events').send({...base,aspectDefinitions:[null]}).expect(400);assert.equal(bad.body.error,'INVALID_OBSERVATION_QUERY');
});
