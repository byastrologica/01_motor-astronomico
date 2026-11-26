import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHDCivilDay, scanHDAspectCatalog, scanHDCivilRelation } from '../src/astronomy-core/hd-day-coverage.js';
import { createTemporalSampler } from '../src/astronomy-core/temporal-sampler.js';

const day = resolveHDCivilDay('1940-11-19', 'America/Sao_Paulo');
const row = { relationId: 'LUA__VENUS__SQUARE', bodyA: 'LUA', bodyB: 'VENUS', aspect: 'SQUARE',
  coreLimit: 3, captureLimit: 5 };
const rates = { maxOrbRateDegreesPerDay: 51, boundProvenance: 'analytic derivative of the synthetic fixture' };
const orbAsPositions = orb => (id, t) => ({ longitude: id === 'LUA' ? 90 + orb(t) : 0 });
const insideCount = (result, type) => result.segments.filter(s => s.possible.join() === type).length;

test('finds two intervals for a relationship absent at noon, with an outside gap', () => {
  const rawOrb = t => 6 + 4 * Math.cos(4 * Math.PI * ((t - day.startMs) / day.durationMs));
  assert(rawOrb(day.startMs + day.durationMs / 2) > row.captureLimit);
  const result = scanHDCivilRelation(day, row, orbAsPositions(rawOrb), rates);
  assert.equal(result.status, 'BOUNDED_ESTIMATE');
  assert.equal(insideCount(result, 'CORE'), 2);
  const core = result.segments.filter(s => s.possible.join() === 'CORE');
  assert(result.segments.some(s => s.startMs > core[0].endMs && s.endMs < core[1].startMs &&
    s.possible.join() === 'OUTSIDE_CAPTURE'));
  const expectedCore = Math.acos(0.75) / Math.PI * 100;
  const expectedExistence = Math.acos(0.25) / Math.PI * 100;
  for (const [state, expected] of [['core', expectedCore], ['existence', expectedExistence]]) {
    const {minPercent, maxPercent} = result.coverage[state];
    assert(minPercent <= expected && expected <= maxPercent);
    assert(maxPercent - minPercent < 0.03);
  }
});

test('does not bridge a short exit even when both far endpoints and noon are inside', () => {
  const center = day.startMs + 3_581_137;
  const rawOrb = t => 4.99 + Math.max(0, 0.03 - Math.abs(t - center) / 1_000_000);
  const result = scanHDCivilRelation(day, row, orbAsPositions(rawOrb), {
    maxOrbRateDegreesPerDay: 86.4, boundProvenance: 'analytic bound for a 40 second exit',
  });
  assert.equal(insideCount(result, 'AMPLO'), 2);
  assert.equal(insideCount(result, 'OUTSIDE_CAPTURE'), 1);
  assert(result.coverage.existence.maxPercent < 100);
  assert(result.coverage.outsideCapture.minMs <= 40_000);
  assert(result.coverage.outsideCapture.maxMs >= 40_000);
});

test('uses the actual duration of 23- and 25-hour civil days', () => {
  assert.equal(resolveHDCivilDay('2018-11-04', 'America/Sao_Paulo').durationMs, 23 * 3600000);
  assert.equal(resolveHDCivilDay('2019-02-16', 'America/Sao_Paulo').durationMs, 25 * 3600000);
  assert.throws(() => resolveHDCivilDay('2011-12-30', 'Pacific/Apia'), RangeError);
});

test('never equates incomplete search, missing bound or invalid eligibility with absence', () => {
  const missingBound = scanHDCivilRelation(day, row, () => {});
  assert.equal(missingBound.reason, 'ORB_RATE_BOUND_UNAVAILABLE');
  const limit = scanHDCivilRelation(day, row, orbAsPositions(() => 5), {...rates, maxSamples: 1});
  assert.equal(limit.status, 'INCOMPLETE');
  assert.deepEqual(limit.failures, ['SAMPLE_LIMIT']);
  assert.equal(limit.coverage.existence.minPercent, 0);
  assert.equal(limit.coverage.existence.maxPercent, 100);
  const missing = scanHDCivilRelation(day, row, () => { throw new Error('missing'); }, rates);
  assert.deepEqual(missing.failures, ['EPHEMERIS_UNAVAILABLE']);
  assert.equal(scanHDCivilRelation(day, {...row, bodyB: 'ASC'}, () => {}, rates).status, 'NOT_APPLICABLE_HD');
  assert.equal(scanHDCivilRelation(day, {...row, bodyA: 'NODO_NORTE', bodyB: 'NODO_SUL', aspect: 'OPPOSITION'},
    () => {}, rates).status, 'EXCLUDED_PAIR');
});

test('reproduces the real Ricardina square coverage with a provisional rate bound', () => {
  const { sample } = createTemporalSampler({ birthTimeKnown: false });
  const result = scanHDCivilRelation(day, {...row, captureLimit: 10}, sample, {
    maxOrbRateDegreesPerDay: 21, boundProvenance: 'unhomologated candidate bound for this fixture only',
  });
  assert.equal(result.status, 'BOUNDED_ESTIMATE');
  assert.equal(result.coverage.existence.minPercent, 100);
  assert(50.8228 >= result.coverage.core.minPercent && 50.8228 <= result.coverage.core.maxPercent);
  assert(49.1772 >= result.coverage.amplo.minPercent && 49.1772 <= result.coverage.amplo.maxPercent);
  assert.equal(insideCount(result, 'AMPLO'), 2);
});

test('catalog scanning preserves identity, budget and unavailable policy', () => {
  const makeCatalog = (...candidates) => ({
    schemaVersion:'HD_ASPECT_CANDIDATES_DRAFT_V1', candidates,
    unavailable:[{body:'ASC', reason:'NOT_APPLICABLE_HD'}],
  });
  const second = {...row, relationId:'LUA__VENUS__QUINTILE', aspect:'QUINTILE'};
  const options = { rateOptionsFor: () => rates, maxTotalSamples: 1 };
  const result = scanHDAspectCatalog(day, makeCatalog(row, second), orbAsPositions(() => 5), options);
  assert.equal(result.results[0].status, 'INCOMPLETE');
  assert.equal(result.results[1].reason, 'CATALOG_SAMPLE_LIMIT');
  assert.equal(result.unavailable[0].body, 'ASC');
  assert.throws(() => scanHDAspectCatalog(day, makeCatalog(row,row), () => {}, options), TypeError);
  const overlap = scanHDAspectCatalog(day, makeCatalog({...row, captureLimit:14}, second), () => {}, options);
  assert(overlap.results.every(r => r.reason === 'COMPETING_LONGITUDE_ASPECTS'));
});

test('an explicitly AMPLO-only policy never generates CORE, even at exactness', () => {
  const result = scanHDCivilRelation(day, {...row, coreLimit:null}, orbAsPositions(() => 0), rates);
  assert.equal(result.coverage.core.maxPercent, 0);
  assert.equal(result.coverage.amplo.minPercent, 100);
});

test('a reversal can split CORE without splitting the existence of the aspect', () => {
  const x = t => (t - day.startMs) / day.durationMs - 0.5;
  const result = scanHDCivilRelation(day, row, orbAsPositions(t => 3.25 - 4*x(t)**2), {
    maxOrbRateDegreesPerDay:4, boundProvenance:'analytic derivative across an orb reversal',
  });
  assert.equal(insideCount(result, 'CORE'),2);
  assert.equal(insideCount(result, 'AMPLO'),1);
  assert.equal(result.coverage.existence.minPercent,100);
  assert(result.coverage.core.minPercent <= 50 && result.coverage.core.maxPercent >= 50);
});

test('an isolated tangency at the capture limit does not become a positive-duration claim', () => {
  const x = t => (t - day.startMs) / day.durationMs - 0.5;
  const result = scanHDCivilRelation(day, row, orbAsPositions(t => 5 + 8*x(t)**2), {
    maxOrbRateDegreesPerDay:8, boundProvenance:'analytic tangency', precisionMs:1000,
  });
  assert.equal(result.status,'BOUNDED_ESTIMATE');
  assert.equal(result.coverage.existence.minMs,0);
  assert(result.coverage.existence.maxMs > 0);
  assert(result.coverage.existence.maxPercent < 1);
});

test('a sub-resolution exit is not silently rounded to full-day coverage', () => {
  // Isolate the relevant span; an almost flat orb one millidegree from the
  // boundary for all 24h would exhaust the sample budget with this rate bound.
  const span = {startMs:day.startMs, endMs:day.startMs + 10000};
  const center = span.startMs + 3_137;
  const result = scanHDCivilRelation(span, row, orbAsPositions(t => 4.999 + Math.max(0, 0.002 - Math.abs(t-center)/100_000)), {
    maxOrbRateDegreesPerDay:864, boundProvenance:'analytic bound around a 200 ms exit', precisionMs:1000,
  });
  assert.equal(result.status,'BOUNDED_ESTIMATE');
  assert(result.coverage.existence.minPercent < 100);
  assert(result.coverage.outsideCapture.maxMs >= 200);
  assert(result.coverage.outsideCapture.minMs <= 200);
});

test('numerical evidence can reject an understated bound and void any pruning based on it', () => {
  const rawOrb = t => 1 + 10*(t - day.startMs)/day.durationMs;
  const result = scanHDCivilRelation(day,row,orbAsPositions(rawOrb), {
    maxOrbRateDegreesPerDay:1, boundProvenance:'intentionally understated',
  });
  assert.equal(result.status,'INCOMPLETE');
  assert.deepEqual(result.failures,['ORB_RATE_BOUND_CONTRADICTED']);
  assert.equal(result.coverage.existence.minPercent,0);
  assert.equal(result.coverage.existence.maxPercent,100);
});

test('real Mercury station: longitude and declination coverage enclose each minute-grid observation', () => {
  const stationDay = resolveHDCivilDay('2026-02-26', 'UTC');
  const {sample} = createTemporalSampler({birthTimeKnown:false});
  assert(sample('MERCURIO',stationDay.startMs).speedLongitude > 0);
  assert(sample('MERCURIO',stationDay.endMs).speedLongitude < 0);
  for (const spec of [
    {...row,bodyA:'MERCURIO',bodyB:'LUA'},
    {...row,bodyA:'MERCURIO',bodyB:'LUA',aspect:'PARALLEL',coreLimit:1,captureLimit:1.3},
  ]) {
    const result = scanHDCivilRelation(stationDay,spec,sample,{
      maxOrbRateDegreesPerDay:33, boundProvenance:'real ephemeris fixture, provisional envelope',
    });
    assert.equal(result.status,'BOUNDED_ESTIMATE');
    let i = 0;
    for (let t = stationDay.startMs + 15000; t < stationDay.endMs; t += 60000) {
      while(result.segments[i].endMs <= t) i++;
      const a=sample(spec.bodyA,t),b=sample(spec.bodyB,t);
      const diff=Math.abs(a.longitude-b.longitude);
      const orb=spec.aspect==='PARALLEL' ? Math.abs(a.declination-b.declination) : Math.abs(Math.min(diff,360-diff)-90);
      const state=orb>spec.captureLimit?'OUTSIDE_CAPTURE':orb>spec.coreLimit?'AMPLO':'CORE';
      assert(result.segments[i].possible.includes(state));
    }
  }
});
