# Changelog

## 1.2.0 - 2026-07-31

- Applied the Astrologica-approved Venus calibration: 120-day initial search, deterministic `120 -> 240 -> 480 -> 600` expansion and an inclusive 600-day maximum in each temporal direction.
- Added `STATION_SEARCH_CONFIG_V1`, versioned cache namespacing, directional telemetry and exact boundary tests.
- Added public `STATIONARY_UNRESOLVED`, `UNKNOWN` and `NOT_APPLICABLE` motion states under motion schema `1.1.0`; preserved `/v1/chart` unchanged.
- Revalidated Yona and the other planetary regressions and refreshed cold/warm batch benchmarks.

- Clarified stationary-state audit semantics by separating directional `CACHE`/`ROOT_SEARCH` source, current-request searched days, and astronomical event-distance days. No calculation policy, threshold, search profile, or V1 endpoint changed.
- Added closure audit fields for directional station-search coverage and separated cold/prebuild versus warm-cache benchmark evidence.

## 1.1.0 - 2026-07-31

- Added versioned `POST /v2/chart` with `PLANETARY_STATIONARY_STATE_V1`.
- Added canonical `D`, `R`, `SD`, and `SR` classification with auditable exact-station searches.
- Preserved `POST /v1/chart` without semantic changes.
- Added safe degradation, bounded cache, tests, Yona regression, and batch benchmark.
