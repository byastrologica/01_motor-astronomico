import assert from 'node:assert/strict';
import {test} from 'node:test';
import request from 'supertest';
import app from '../src/app.js';

const catalog={schemaVersion:'HD_ASPECT_CANDIDATES_DRAFT_V1',capturePolicyVersion:'CAPTURE_TABLE_2026_V3',
  unavailable:[],candidates:[
    {bodyA:'LUA',bodyB:'VENUS',aspect:'SQUARE',relationId:'LUA__VENUS__SQUARE',coreLimit:3,captureLimit:10},
  ]};
const input={date:'1960-09-27',zone:'America/Sao_Paulo',catalog};
test('HD report exposes draft coverage and lunar sign variation without changing official endpoints',async()=>{
  const result=await request(app).post('/v1/hd-preview/coverage').send(input).expect(200);
  assert.equal(result.body.status,'DRAFT_NOT_FOR_NATAL_ASSERTIONS');
  assert.equal(result.body.candidateCount,1);
  const moon=result.body.signTimelines.find(x=>x.body==='LUA');
  assert.deepEqual([...new Set(moon.segments.map(s=>s.sign).filter(x=>x!==null))],[8,9]);
  assert(moon.segments.some(s=>s.sign===null));
  assert(!JSON.stringify(result.body).includes('score'));
  await request(app).get('/health').expect(200);
});
test('HD report rejects dates and policies outside the preview',async()=>{
  await request(app).post('/v1/hd-preview/coverage').send({...input,date:'1960-02-31'}).expect(400);
  await request(app).post('/v1/hd-preview/coverage').send({...input,catalog:{...catalog,capturePolicyVersion:'old'}}).expect(400);
});
