import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTemporalWindow,temporalSearchProfile} from '../src/astronomy-core/temporal-window-search.js';
import {isTemporalPairPermitted} from '../src/astronomy-core/temporal-windows.js';
const day=86400000,t0=Date.UTC(2026,0,1),row={relationId:'SOL__SATURNO__CONJUNCTION',bodyA:'SOL',bodyB:'SATURNO',aspect:'CONJUNCTION',classification:'CORE',limitDegrees:3,exactAngle:0};
const profile={id:'TEST',stepMs:day/10,maxDays:30,precisionMs:100};
test('one connected band, wrap and exact event',()=>{
 const sample=(id,t)=>({longitude:id==='SOL'?359+(t-t0)/day:359,branch:'BODY'});
 const out=searchTemporalWindow(row,t0,sample,{profile});
 assert.equal(out.status,'COMPUTED');assert.equal(out.interval.exact.length,1);
 assert.ok(Math.abs(out.interval.start.timestampMs-(t0-3*day))<100);
 assert.ok(Math.abs(out.interval.end.timestampMs-(t0+3*day))<100);
});
test('retrograde trajectory preserves multiple exact crossings',()=>{
 const sample=(id,t)=>{const x=(t-t0)/day;return {longitude:id==='SOL'?100+(x*x*x-4*x)/20:100,branch:'BODY'};};
 const out=searchTemporalWindow(row,t0,sample,{profile});
 assert.equal(out.interval.exact.length,3);
});
test('parallel uses declination, not longitude',()=>{
 const sample=(id,t)=>({longitude:100,declination:id==='SOL'?(t-t0)/day:0,branch:'BODY'});
 const out=searchTemporalWindow({...row,aspect:'PARALLEL'},t0,sample,{profile});
 assert.equal(out.interval.exact.length,1);assert.equal(out.interval.start.coordinateSystem,'EQUATORIAL_DECLINATION');
});
test('rejected pairs and computational profiles',()=>{
 assert.equal(isTemporalPairPermitted({...row,bodyA:'NODO_NORTE',bodyB:'NODO_SUL',aspect:'OPPOSITION'}),false);
 assert.equal(temporalSearchProfile({...row,bodyA:'NETUNO',bodyB:'PLUTAO'}).id,'SLOW');
 assert.equal(temporalSearchProfile({...row,bodyB:'PLUTAO'}).id,'FAST');
});
test('reference outside band never selects another formation',()=>{
 const sample=id=>({longitude:id==='SOL'?100:110,branch:'BODY'});
 assert.equal(searchTemporalWindow(row,t0,sample,{profile}).status,'REFERENCE_OUTSIDE_SELECTED_WINDOW');
});
test('formula branch discontinuity is not an exact aspect',()=>{
 const sample=(id,t)=>({longitude:id==='SOL'?(t<t0+day?101:99):100,branch:id==='SOL'?(t<t0+day?'DAY':'NIGHT'):'BODY'});
 const out=searchTemporalWindow(row,t0,sample,{profile});
 assert.equal(out.interval.exact.length,0);assert.equal(out.boundaries.end,'FORMULA_BRANCH_BOUNDARY');
});
