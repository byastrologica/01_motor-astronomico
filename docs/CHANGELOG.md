# Changelog

## 1.1.0 - 2026-07-31

- Added versioned `POST /v2/chart` with `PLANETARY_STATIONARY_STATE_V1`.
- Added canonical `D`, `R`, `SD`, and `SR` classification with auditable exact-station searches.
- Preserved `POST /v1/chart` without semantic changes.
- Added safe degradation, bounded cache, tests, Yona regression, and batch benchmark.
