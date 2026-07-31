import { STATIONARY_PROFILE } from "./stationary-profile.js";

const eventsByBody = new Map();

function removeExpired(now, ttlMs) {
  for (const [bodyId, entries] of eventsByBody) {
    const current = entries.filter((entry) => now - entry.cachedAt <= ttlMs);
    if (current.length > 0) eventsByBody.set(bodyId, current);
    else eventsByBody.delete(bodyId);
  }
}

function enforceLimit(maximumEntries) {
  const all = [...eventsByBody.entries()]
    .flatMap(([bodyId, entries]) => entries.map((entry) => ({ bodyId, entry })))
    .sort((left, right) => left.entry.lastAccessedAt - right.entry.lastAccessedAt);
  const excess = all.length - maximumEntries;
  for (let index = 0; index < excess; index += 1) {
    const { bodyId, entry } = all[index];
    const remaining = (eventsByBody.get(bodyId) ?? []).filter((item) => item !== entry);
    if (remaining.length > 0) eventsByBody.set(bodyId, remaining);
    else eventsByBody.delete(bodyId);
  }
}

export function storeStationEvent(bodyId, event, profile = STATIONARY_PROFILE) {
  const now = Date.now();
  removeExpired(now, profile.cache.ttlMs);
  const entries = eventsByBody.get(bodyId) ?? [];
  const toleranceDays = profile.stationRootToleranceSeconds / 86400;
  const duplicate = entries.find(
    (entry) => Math.abs(entry.julianDay - event.julianDay) <= toleranceDays,
  );
  if (duplicate) {
    duplicate.lastAccessedAt = now;
    return duplicate;
  }
  const cached = { ...event, cachedAt: now, lastAccessedAt: now };
  entries.push(cached);
  entries.sort((left, right) => left.julianDay - right.julianDay);
  eventsByBody.set(bodyId, entries);
  enforceLimit(profile.cache.maximumEntries);
  return cached;
}

export function nearestCachedStations(bodyId, instantJulianDay, profile = STATIONARY_PROFILE) {
  const now = Date.now();
  removeExpired(now, profile.cache.ttlMs);
  const entries = eventsByBody.get(bodyId) ?? [];
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (entries[midpoint].julianDay < instantJulianDay) low = midpoint + 1;
    else high = midpoint;
  }
  const next = entries[low] ?? null;
  const previous = next?.julianDay === instantJulianDay
    ? next
    : entries[low - 1] ?? null;
  if (previous) previous.lastAccessedAt = now;
  if (next) next.lastAccessedAt = now;
  return { previous, next };
}

export function clearStationEventCache() {
  eventsByBody.clear();
}

export function stationEventCacheSize() {
  return [...eventsByBody.values()].reduce((total, entries) => total + entries.length, 0);
}
