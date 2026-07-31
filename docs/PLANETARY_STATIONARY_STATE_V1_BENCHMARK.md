# PLANETARY_STATIONARY_STATE_V1 Benchmark

Generated at UTC: 2026-07-31T17:59:08.833Z

Classification: functional correctness and batch benchmark. Continuous throughput is not homologated.

| Scenario | Count | Total ms | Average ms | P95 ms | Cache hits/lookups | Root searches | Timeouts | Partial |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold cache | 1 | 102.424 | 102.424 | 102.424 | 0/16 | 16 | 0 | 0 |
| Warm cache | 1 | 9.145 | 9.145 | 9.145 | 16/16 | 0 | 0 | 0 |
| Same-year batch | 100 | 1,493.224 | 14.932 | 23.645 | 1,517/1,600 | 83 | 0 | 59 |
| Cold/prebuild batch | 1,400 | 7,730.375 | 5.522 | 18.206 | 22,226/22,400 | 174 | 0 | 139 |
| Warm-cache batch | 1,400 | 7,402.308 | 5.287 | 8.243 | 22,400/22,400 | 0 | 0 | 0 |

`PARTIAL` is a governed degradation: if both adjacent exact stations cannot be proven inside the contracted windows, the output preserves the instantaneous `D/R` state and does not infer `SD/SR`.

This benchmark is not a production SLA and does not homologate continuous capacity.
