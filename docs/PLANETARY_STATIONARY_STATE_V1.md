# PLANETARY_STATIONARY_STATE_V1

Status: IMPLEMENTED

The canonical implementation is exposed by `POST /v2/chart`. `POST /v1/chart` remains unchanged.

## Contract

- Profile: `ASTRODIENST_STATIONARY_PROFILE_V1`.
- States: `D`, `R`, `SD`, `SR`.
- Exact station: bracketed search over `speedLongitude(t) = 0` with safeguarded Brent/secant and bisection fallback.
- Verification: sign change at five minutes before and after the root.
- `SD/SR` requires both previous and next confirmed stations.
- Any incomplete search degrades safely to `D/R` from instantaneous speed.
- Canonical source: Swiss Ephemeris through this service only.

## Compatibility

The new fields are additive under `object.motion` and `object.motionAudit` in schema V2. No Coordinate Sheet V1, SOP, Aspectario, ranking, orb, Module 1, or GEM contract is changed.

## Cache

The implementation uses request reuse plus a bounded, sorted in-memory station-event cache with TTL and binary nearest-event lookup. Cached events contain astronomical data only. A persistent precomputed event index remains an operational optimization for a future durable batch runner; it does not change classification semantics.

## Benchmark

Run `npm run benchmark:stationary`. The reference run on 2026-07-31 produced:

- cold cache: 91.139 ms;
- warm cache: 9.360 ms;
- 100 charts: 1,558.225 ms, 94.81% event-cache hits;
- 1,400 charts: 6,380.452 ms, 99.22% event-cache hits;
- timeouts: zero.

Partial results are explicit safe degradations when one adjacent station is outside the configured search window. They never emit an inferred `SD` or `SR`. These measurements describe the current process and are not a production SLA or homologated continuous throughput.
