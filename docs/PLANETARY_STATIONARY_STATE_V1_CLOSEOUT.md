# PLANETARY_STATIONARY_STATE_V1 Closeout

Status: `HOMOLOGATED`  
Date: `2026-07-31`

## Closure layers

```text
METHOD CONTRACT = HOMOLOGATED
TECHNICAL IMPLEMENTATION = IMPLEMENTED / TESTED / HOMOLOGATED
DOCUMENTARY REGISTRATION = COMPLETED
FINAL TECHNICAL CLOSEOUT = ACCEPTED
```

The statement `Code changed = NO` used during documentary registration referred
only to the closeout commit. The homologated delivery did include functional
code and additive V2 output changes before the documentation-only commits.

## Homologated contracts

```text
PLANETARY_STATIONARY_STATE_V1 = HOMOLOGATED
ASTRODIENST_STATIONARY_PROFILE_V1 = HOMOLOGATED
STATION_SEARCH_CONFIG_V1 = HOMOLOGATED
```

The approved policy is `THRESHOLD_WINDOW_WITH_CONFIRMED_EXACT_STATION`.
Venus uses a 120-day initial search with deterministic expansion through
`120 -> 240 -> 480 -> 600` days in each temporal direction. The 600-day
boundary is inclusive.

## Accepted evidence

- Previous and next exact stations are located for the approved Yona regression.
- `STATIONARY_UNRESOLVED` prevents an inconclusive bounded search from being
  silently represented as `D` or `R` while instantaneous speed is inside the
  stationary threshold.
- Boundary, cache, telemetry, degradation and regression tests pass.
- Cold and warm 1,400-map batch benchmarks completed without timeout,
  `SEARCH_WINDOW_EXCEEDED` or unexpected unresolved results.
- `POST /v2/chart` is online with service `1.2.0`, motion schema `1.1.0` and
  stationary-state contract `1.1.0`.
- `POST /v1/chart` remains unchanged.

### Reproduced validation matrix

| Case | Evidence | Result |
| --- | --- | --- |
| A | Mercury around `R_TO_D` at `1982-02-13T07:17:36Z`: -6h, root and +6h | `SD / SD / SD`, `COMPUTED` |
| B | Mercury around `D_TO_R` at `1982-05-21T02:05:27.728Z`: -6h, root and +6h | `SR / SR / SR`, `COMPUTED` |
| C | Incomplete search inside the stationary threshold | `STATIONARY_UNRESOLVED`; no silent D/R fallback |
| D | Incomplete search outside the stationary threshold | instantaneous sign preserved as `D` or `R` |
| E | Yona regression, Venus next adjacent station beyond 400 days | found at `476.464316` days within the inclusive 600-day window |
| F | Yona regression and V1 compatibility | Uranus, Neptune and Pluto = `R`; V1 longitudes, speeds, houses and angles unchanged |

```text
01_motor-astronomico: npm test = 20/20
05_skynow-api: npm test = PASS
00_motor-tester: skynow-print-report.test.js = PASS
00_motor-tester: node --check skynow-tester.js = PASS
```

Benchmark evidence remains classified as
`BATCH_BENCHMARK / NOT_SLA / CONTINUOUS_THROUGHPUT_NOT_HOMOLOGATED`.

## Ecosystem propagation

`05_skynow-api` consumes `/v2/chart` and propagates motion using `COPY_ONLY`
through `COORDINATE_SHEET_STATIONARY_ADDENDUM_V1` version `1.1.0`. It does not
calculate or reclassify stationary state. Coordinate Sheet V1 remains unchanged.

`00_motor-tester` renders canonical `D`, `R`, `SD`, `SR`,
`STATIONARY_UNRESOLVED`, `UNKNOWN` and `NOT_APPLICABLE`. Unsupported canonical
states fail visibly instead of falling through to legacy `D/R` inference.

## Functional implementation traceability

```text
01_motor-astronomico
84ccaee71cf5bd2e98d4a0cc046dbbb98e7a37f7
2026-07-31T16:19:37-03:00 | feat: calibrate venus stationary search

05_skynow-api
180fc61c7e7c0c821641ae5ca6a2287a5f663549
2026-07-31T16:19:38-03:00 | feat: propagate unresolved stationary state

00_motor-tester
3cfe1d8ab794da7310a16b46d9ddbe71d054f059
2026-07-31T16:19:38-03:00 | feat: render unresolved stationary state
```

Primary functional files:

```text
01_motor-astronomico
- src/app.js
- src/astronomy-core/raw-chart-generator.js
- src/stationary-state/station-event-cache.js
- src/stationary-state/station-search-config.js
- src/stationary-state/stationary-profile.js
- src/stationary-state/stationary-state.js
- test/app-v2.test.js
- test/stationary-state.test.js

05_skynow-api
- src/skynow-coordinate-sheet.js
- tests/skynow-coordinate-sheet.test.js

00_motor-tester
- skynow-print-report.js
- skynow-print-report.test.js
- skynow-tester.html
- skynow-tester.js
```

Documentation-only closeout commits:

```text
01_motor-astronomico: c50cff66ae8844740a0f4e0585f5853021fbf9be
05_skynow-api: 014207af13c2e855009cfc8b69dbfba1a26f4f81
00_motor-tester: 6eefbdc803063c56bde3c17bfd094317ca39ccd8
```

## Architectural preservation

- `01_motor-astronomico` is the sole calculator of stationary state.
- `POST /v2/chart` adds the governed motion contract; `POST /v1/chart` remains unchanged.
- `05_skynow-api` uses `COPY_ONLY`; it does not calculate or reclassify motion.
- Coordinate Sheet V1 remains unchanged; state is carried by the additive
  `COORDINATE_SHEET_STATIONARY_ADDENDUM_V1` extension.
- `00_motor-tester` only renders canonical states.
- No aspect, ranking or orb rule changed.

## Governance closure

```text
Technical blocker = NONE
Methodological blocker = NONE
Method changed = NO
RFC = NO
Coordinate Sheet V1 = UNCHANGED
FASE 2B / GEM = PAUSED
```

This closeout records the final technical and operational homologation. It does
not reopen Module 1, authorize interpretation, change the Astrologica method or
alter any frozen pipeline contract.
