import test from 'node:test';import assert from 'node:assert/strict';import request from 'supertest';import app from '../src/app.js';import {calculateAngularWindows} from '../src/astronomy-core/angular-windows.js';
const query={bodyA:'SOL',bodyB:'SATURNO',angle:90,orb:3,start:'1989-02-04T00:00:00.000Z',end:'1989-06-04T00:00:00.000Z'};
test('bounded single-request events preserve geometry, cache and pair symmetry',async()=>{
 const r=calculateAngularWindows(query);assert.ok(r.intervals.length);assert.ok(r.queries<1200);
 const reverse=calculateAngularWindows({...query,bodyA:'SATURNO',bodyB:'SOL'});assert.equal(reverse.cacheHit,true);assert.deepEqual(reverse.intervals,r.intervals);
 const response=await request(app).post('/v1/angular-windows').send(query);assert.equal(response.status,200);assert.deepEqual(response.body.intervals,r.intervals);
 const active=r.intervals.find(i=>(i.entryMs??r.searchStartMs)<=Date.UTC(1989,3,6,1,40)&&(i.exitMs??r.searchEndMs)>=Date.UTC(1989,3,6,1,40));assert.ok(active);assert.ok(active.exactMs.length);
 console.log(JSON.stringify({calculationMs:r.calculationMs,queries:r.queries,interval:active}));
 for(const t of [active.entryMs,...active.exactMs,active.exitMs]){const event=r.events.find(e=>e.timestampMs===t);assert.ok(event);assert.ok(Number.isFinite(event.longitudes.SOL));assert.ok(Number.isFinite(event.longitudes.SATURNO));const distance=Math.abs(event.longitudes.SOL-event.longitudes.SATURNO);assert.ok(Math.abs(event.orbDegrees-Math.abs(Math.min(distance,360-distance)-90))<1e-9);}
 assert.ok(r.events.find(e=>e.timestampMs===active.exactMs[0]).orbDegrees<0.001);
});
test('unbounded searches, unsupported bodies and invalid orbs are rejected',async()=>{
 for(const patch of [{end:'2026-01-01T00:00:00Z'},{bodyA:'ASC'},{bodyA:'SATURNO'},{orb:0},{orb:100},{angle:45},{start:'invalid'}]){const r=await request(app).post('/v1/angular-windows').send({...query,...patch});assert.equal(r.status,400);}
});
