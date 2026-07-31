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

- cold cache: 102.424 ms, 16 root searches;
- warm cache: 9.145 ms, zero root searches;
- 100 charts: 1,493.224 ms, 94.81% event-cache hits;
- 1,400-chart cold/prebuild phase: 7,730.375 ms, 174 root searches and 99.22% event-cache hits;
- 1,400-chart warm phase: 7,402.308 ms, zero root searches and 100% event-cache hits;
- timeouts: zero.

Partial results are explicit safe degradations when one adjacent station is outside the configured search window. They never emit an inferred `SD` or `SR`. These measurements describe the current process and are not a production SLA or homologated continuous throughput.

## Closure evidence

The implemented state rule is `THRESHOLD_WINDOW_WITH_CONFIRMED_EXACT_STATION`:

- both adjacent exact stations must be confirmed;
- instantaneous absolute speed must be within the body threshold;
- the nearest confirmed transition determines `SD` (`R_TO_D`) or `SR` (`D_TO_R`).

`EXACT_ROOT_INSTANT_ONLY` is not the implemented policy.

Directional audit semantics distinguish work from evidence:

- `previousSearchSource` / `nextSearchSource` identify `CACHE` or `ROOT_SEARCH`;
- `previousSearchedDays` / `nextSearchedDays` report work performed in the current request;
- `previousEventDistanceDays` / `nextEventDistanceDays` report astronomical distance to the recovered event.

A warm-cache request may therefore report `searchedDays = 0` while preserving
the event-distance evidence explicitly.

The original Venus maximum search window remains 400 days pending formal calibration approval. A 1982 reference chart proved the next station at approximately 477 days, and an annual 1900-2100 sample found adjacent-station distances up to approximately 584 days. The proposed technical calibration is 600 days; it is not applied by this evidence-only update.
