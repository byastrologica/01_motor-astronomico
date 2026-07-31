# PLANETARY_STATIONARY_STATE_V1 Benchmark

Generated at UTC: 2026-07-31T15:12:37.600Z

Classification: functional correctness and batch benchmark. Continuous throughput is not homologated.

| Scenario | Count | Total ms | Average ms | P95 ms | Cache hit ratio | Timeouts | Partial |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold cache | 1 | 91.139 | 91.139 | 91.139 | 0.000000 | 0 | 0 |
| Warm cache | 1 | 9.360 | 9.360 | 9.360 | 1.000000 | 0 | 0 |
| Same-year batch | 100 | 1,558.225 | 15.582 | 28.874 | 0.948125 | 0 | 59 |
| Batch | 1,400 | 6,380.452 | 4.557 | 13.117 | 0.992232 | 0 | 139 |

`PARTIAL` is a governed degradation: if both adjacent exact stations cannot be proven inside the contracted windows, the output preserves the instantaneous `D/R` state and does not infer `SD/SR`.

This benchmark is not a production SLA and does not homologate continuous capacity.
