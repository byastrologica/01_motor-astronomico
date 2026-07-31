# PLANETARY_STATIONARY_STATE_V1 Benchmark

Generated at UTC: 2026-07-31

Classification: `BATCH_BENCHMARK / NOT_SLA / CONTINUOUS_THROUGHPUT_NOT_HOMOLOGATED`.

| Scenario | Count | Total ms | Average ms | P95 ms | Cache hits/lookups | Cache misses | Root searches | Timeouts | Window exceeded | Unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold single chart | 1 | 78.059 | 78.059 | 78.059 | 0/16 | 16 | 16 | 0 | 0 | 0 |
| Warm single chart | 1 | 5.731 | 5.731 | 5.731 | 16/16 | 0 | 0 | 0 | 0 | 0 |
| Same-year batch | 100 | 503.165 | 5.032 | 8.128 | 1,575/1,600 | 25 | 25 | 0 | 0 | 0 |
| Cold/prebuild batch | 1,400 | 5,075.940 | 3.626 | 5.150 | 22,365/22,400 | 35 | 35 | 0 | 0 | 0 |
| Warm-cache batch | 1,400 | 5,423.720 | 3.874 | 5.867 | 22,400/22,400 | 0 | 0 | 0 | 0 | 0 |

The benchmark includes the calibrated Venus 600-day per-direction search configuration. `STATIONARY_UNRESOLVED` is a governed inconclusive state used only when speed is inside the stationary threshold and the associated exact station cannot be confirmed. Outside the threshold, incomplete searches preserve `D/R` from instantaneous speed.
