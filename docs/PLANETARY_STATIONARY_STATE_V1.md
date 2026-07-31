# PLANETARY_STATIONARY_STATE_V1

Status: IMPLEMENTED

The canonical implementation is exposed by `POST /v2/chart`. `POST /v1/chart` remains unchanged.

## Contract

- Service version: `1.2.0`.
- Motion schema and stationary-state contract: `1.1.0`.
- Profile: `ASTRODIENST_STATIONARY_PROFILE_V1`.
- Search configuration: `STATION_SEARCH_CONFIG_V1` version `1.0.0`.
- States: `D`, `R`, `SD`, `SR`, `STATIONARY_UNRESOLVED`, `UNKNOWN`, `NOT_APPLICABLE`.
- Exact station: bracketed search over `speedLongitude(t) = 0` with safeguarded Brent/secant and bisection fallback.
- Verification: sign change at five minutes before and after the root.
- `SD/SR` requires confirmed adjacent stations and a speed inside the body threshold.
- An incomplete or inconclusive search inside the threshold emits `STATIONARY_UNRESOLVED` rather than a false `D/R`.
- An incomplete search outside the threshold preserves `D/R` from instantaneous speed.
- Missing speed emits `UNKNOWN`; ineligible bodies emit `NOT_APPLICABLE`.
- Canonical source: Swiss Ephemeris through this service only.

`STATIONARY_UNRESOLVED` means that the body is inside the homologated stationary threshold, but the available evidence cannot safely determine whether the associated station is direct or retrograde. It is not a third kind of station.

## Venus calibration

Venus uses an independent search in each temporal direction:

```text
initialSearchWindowDays = 120
maximumSearchWindowDays = 600
searchStepHours = 12
expansion = 120 -> 240 -> 480 -> 600
calibrationStatus = ASTROLOGICA_APPROVED
calibrationReason = ADJACENT_VENUS_STATION_BEYOND_400_DAYS
```

The 600-day boundary is inclusive and is compared with Julian Day precision, not rounded presentation values. The calibrated evidence range is `1900-01-01T00:00:00Z` through `2100-12-31T23:59:59Z`. The same operational limit may be used outside that range without claiming statistically homologated coverage.

## Compatibility

The fields remain additive under `object.motion` and `object.motionAudit` in schema V2. No Coordinate Sheet V1, SOP, Aspectario, ranking, orb, Module 1, or GEM contract is changed.

## Audit and cache

Directional audit records searched days, status, source, event distance, maximum-window exhaustion and expansion count independently for previous and next searches. Search sources are controlled enums, including `MEMORY_CACHE` and `ROOT_SEARCH`.

The bounded in-memory cache is namespaced by search configuration id/version, body, maximum window, step, algorithm version and ephemeris signature. Results from the former Venus 400-day configuration cannot be reused under the 600-day contract.

## Benchmark

Run `npm run benchmark:stationary`. The calibrated reference run on 2026-07-31 produced:

- cold single chart: 78.059 ms, 16 cache misses and 16 root searches;
- warm single chart: 5.731 ms, 16/16 cache hits and zero root searches;
- 100 charts: 503.165 ms total, 5.032 ms average and 8.128 ms p95;
- 1,400-chart cold/prebuild phase: 5,075.940 ms total, 3.626 ms average, 35 root searches;
- 1,400-chart warm phase: 5,423.720 ms total, 3.874 ms average, 22,400/22,400 cache hits;
- timeouts, maximum-window exhaustion and unresolved states: zero in this benchmark sample.

These measurements are a `BATCH_BENCHMARK`, not a production SLA or homologated continuous throughput.

## Yona regression

The reference chart recovers Venus with a previous station at approximately 62.498 days and a next station at approximately 476.464 days. Venus remains `D / COMPUTED`; Uranus, Neptune and Pluto remain `R / COMPUTED`.
