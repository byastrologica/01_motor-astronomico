import { DateTime } from 'luxon';
import { TEMPORAL_ANGLES_BY_ASPECT } from './temporal-window-search.js';
import { isTemporalPairPermitted } from './temporal-windows.js';
import { isTemporalBody, TEMPORAL_ANGLES } from './temporal-sampler.js';

const MS_PER_DAY = 86_400_000;
const unavailableHD = new Set([...TEMPORAL_ANGLES, 'FORTUNA', 'VERTEX']);
const declinationAspects = new Set(['PARALLEL', 'CONTRAPARALLEL']);
const states = ['CORE', 'AMPLO', 'OUTSIDE_CAPTURE'];
const norm = x => ((x % 360) + 360) % 360;
const angularDistance = (a, b) => 180 - Math.abs(180 - norm(a - b));

export function resolveHDCivilDay(date, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof zone !== 'string' || !zone || zone === 'local') {
    throw new TypeError('Expected a civil birth date and an explicit time zone');
  }
  // Resolve the two calendar dates independently; adding 24h to the first
  // instant would fail on clock-change days (and adding a day to 01:00 could too).
  const calendar = DateTime.fromISO(date, { zone: 'utc' });
  if (!calendar.isValid) throw new RangeError('Invalid civil date');
  const localDate = DateTime.fromISO(date, { zone }).startOf('day');
  const nextDate = calendar.plus({ days: 1 }).toISODate();
  const nextLocalDate = DateTime.fromISO(nextDate, { zone }).startOf('day');
  const earliest = t => Math.min(...t.getPossibleOffsets().map(x => x.toMillis()));
  const startMs = earliest(localDate), endMs = earliest(nextLocalDate);
  if (localDate.toISODate() !== date || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new RangeError('Civil day unavailable in supplied time zone');
  }
  return { date, zone, startMs, endMs, durationMs: endMs - startMs };
}

// Interval enclosure from the midpoint and a Lipschitz bound on absolute orb.
// The bound must cover the entire day (not just sampled speeds). Crossing
// brackets stay unresolved; reducing precision never converts them to facts.
export function scanHDCivilRelation(day, row, sample, {
  maxOrbRateDegreesPerDay, boundProvenance, precisionMs = 1000, maxSamples = 20000,
} = {}) {
  if ([row.bodyA, row.bodyB].some(id => unavailableHD.has(id))) return { status: 'NOT_APPLICABLE_HD' };
  if (!isTemporalPairPermitted(row)) return { status: 'EXCLUDED_PAIR' };
  const declination = declinationAspects.has(row.aspect);
  const angle = TEMPORAL_ANGLES_BY_ASPECT[row.aspect];
  if (![row.bodyA, row.bodyB].every(isTemporalBody) || (!declination && !Number.isFinite(angle)) || row.guards != null) {
    return { status: 'NOT_EVALUATED', reason: 'UNSUPPORTED_MEASURE_OR_GUARD' };
  }
  const { coreLimit, captureLimit } = row;
  const hasCore = coreLimit !== null;
  if ((hasCore && (!Number.isFinite(coreLimit) || coreLimit < 0 || coreLimit > captureLimit)) ||
      !Number.isFinite(captureLimit) || captureLimit <= 0) {
    return { status: 'NOT_EVALUATED', reason: 'THRESHOLD_UNAVAILABLE_OR_UNSUPPORTED' };
  }
  if (!Number.isFinite(maxOrbRateDegreesPerDay) || maxOrbRateDegreesPerDay < 0 ||
      typeof boundProvenance !== 'string' || !boundProvenance.trim()) {
    return { status: 'NOT_EVALUATED', reason: 'ORB_RATE_BOUND_UNAVAILABLE' };
  }
  if (!Number.isSafeInteger(day.startMs) || !Number.isSafeInteger(day.endMs) || day.endMs <= day.startMs ||
      !Number.isSafeInteger(precisionMs) || precisionMs < 1 || !Number.isSafeInteger(maxSamples) || maxSamples < 1) {
    throw new RangeError('Invalid search range, precision or budget');
  }
  const segments = [];
  let sampleCount = 0;
  const failures = new Set();
  const sampled = new Map();
  const epsilon = 1e-9;
  const ratePerMs = maxOrbRateDegreesPerDay / MS_PER_DAY;
  function emit(startMs, endMs, possible) {
    const last = segments.at(-1);
    if (last?.endMs === startMs && last.possible.join() === possible.join()) last.endMs = endMs;
    else segments.push({ startMs, endMs, possible });
  }
  function at(time) {
    if (sampled.has(time)) return sampled.get(time);
    if (sampleCount >= maxSamples) { failures.add('SAMPLE_LIMIT'); return null; }
    let orb;
    try {
      sampleCount++;
      const a = sample(row.bodyA, time), b = sample(row.bodyB, time);
      if (declination && Number.isFinite(a?.declination) && Number.isFinite(b?.declination)) {
        orb = Math.abs(a.declination + (row.aspect === 'PARALLEL' ? -b.declination : b.declination));
      } else if (!declination && Number.isFinite(a?.longitude) && Number.isFinite(b?.longitude)) {
        orb = Math.abs(angularDistance(a.longitude, b.longitude) - angle);
      }
    } catch { /* Report the unavailable interval below. */ }
    if (!Number.isFinite(orb)) { failures.add('EPHEMERIS_UNAVAILABLE'); orb = null; }
    sampled.set(time, orb);
    return orb;
  }
  function visit(lo, hi) {
    if (failures.has('ORB_RATE_BOUND_CONTRADICTED')) { emit(lo, hi, states); return; }
    const mid = Math.floor((hi + lo) / 2);
    const a = at(lo), b = at(hi), orb = at(mid);
    if ([a,b,orb].includes(null)) { emit(lo, hi, states); return; }
    if (Math.abs(a - orb) > ratePerMs * (mid - lo) + epsilon ||
        Math.abs(b - orb) > ratePerMs * (hi - mid) + epsilon) {
      failures.add('ORB_RATE_BOUND_CONTRADICTED');
      emit(lo, hi, states);
      return;
    }
    const radius = ratePerMs * Math.max(hi - mid, mid - lo) + epsilon;
    const lower = Math.max(0, orb - radius), upper = orb + radius;
    const possible = [
      ...(hasCore && lower <= coreLimit ? [states[0]] : []),
      ...((!hasCore || (coreLimit < captureLimit && upper > coreLimit)) && lower <= captureLimit ? [states[1]] : []),
      ...(upper > captureLimit ? [states[2]] : []),
    ];
    if (possible.length === 1 || hi - lo <= precisionMs) { emit(lo, hi, possible); return; }
    visit(lo, mid);
    visit(mid, hi);
  }
  visit(day.startMs, day.endMs);
  if (failures.has('ORB_RATE_BOUND_CONTRADICTED')) {
    // A single counterexample invalidates all earlier pruning done with it.
    segments.length = 0;
    emit(day.startMs, day.endMs, states);
  }
  const coverage = accepted => {
    let minMs = 0, maxMs = 0;
    for (const {startMs, endMs, possible} of segments) {
      if (possible.every(s => accepted.includes(s))) minMs += endMs - startMs;
      if (possible.some(s => accepted.includes(s))) maxMs += endMs - startMs;
    }
    const duration = day.endMs - day.startMs;
    return { minMs, maxMs, minPercent: 100 * minMs / duration, maxPercent: 100 * maxMs / duration };
  };
  return {
    status: failures.size ? 'INCOMPLETE' : 'BOUNDED_ESTIMATE',
    relationId: row.relationId ?? null, precisionMs, sampleCount,
    rateBound: { degreesPerDay: maxOrbRateDegreesPerDay, provenance: boundProvenance },
    failures: [...failures], segments,
    coverage: {
      core: coverage(['CORE']), amplo: coverage(['AMPLO']),
      existence: coverage(['CORE', 'AMPLO']), outsideCapture: coverage(['OUTSIDE_CAPTURE']),
    },
  };
}

// Draft cross-engine boundary. The catalog owns thresholds; astronomy owns
// interval measurements. Neither an unproved bound nor an unavailable candidate
// is converted into an official CS/SOP assertion here.
export function scanHDAspectCatalog(day, catalog, sample, {
  rateOptionsFor, precisionMs, maxSamples, maxTotalSamples = 100_000,
} = {}) {
  if (catalog?.schemaVersion !== 'HD_ASPECT_CANDIDATES_DRAFT_V1' ||
      !Array.isArray(catalog.candidates) || !Array.isArray(catalog.unavailable) ||
      typeof rateOptionsFor !== 'function' || !Number.isSafeInteger(maxTotalSamples) || maxTotalSamples < 1) {
    throw new TypeError('Invalid draft HD candidate catalog or scan configuration');
  }
  const ids = new Set(), longitudinalByPair = new Map(), overlapping = new Set();
  for (const row of catalog.candidates) {
    const pair = [row.bodyA, row.bodyB].sort().join('__');
    if (row.relationId !== `${pair}__${row.aspect}` || ids.has(row.relationId)) {
      throw new TypeError('Invalid or duplicated relationId');
    }
    ids.add(row.relationId);
    const angle = TEMPORAL_ANGLES_BY_ASPECT[row.aspect];
    if (!Number.isFinite(angle)) continue;
    const group = longitudinalByPair.get(pair) ?? [];
    for (const other of group) {
      if (Math.abs(angle - other.angle) <= row.captureLimit + other.captureLimit) {
        overlapping.add(row.relationId);
        overlapping.add(other.id);
      }
    }
    group.push({angle, captureLimit: row.captureLimit, id: row.relationId});
    longitudinalByPair.set(pair, group);
  }
  let sampleCount = 0;
  const results = catalog.candidates.map(row => {
    const { relationId } = row;
    if (overlapping.has(relationId)) return { relationId, status: 'NOT_EVALUATED', reason: 'COMPETING_LONGITUDE_ASPECTS' };
    if (sampleCount >= maxTotalSamples) return { relationId, status: 'NOT_EVALUATED', reason: 'CATALOG_SAMPLE_LIMIT' };
    const result = scanHDCivilRelation(day, row, sample, {
      ...rateOptionsFor(row), precisionMs, maxSamples: Math.min(maxSamples ?? 20_000, maxTotalSamples - sampleCount),
    });
    sampleCount += result.sampleCount ?? 0;
    return { relationId, ...result };
  });
  return {
    status: 'DRAFT_NOT_FOR_NATAL_ASSERTIONS', capturePolicyVersion: catalog.capturePolicyVersion,
    candidateCount: results.length, sampleCount, results, unavailable: catalog.unavailable,
  };
}
