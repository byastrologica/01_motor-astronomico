# Geocentric angular windows — additive performance endpoint

`POST /v1/angular-windows` calculates an entire bounded angular search in one
request using the existing Swiss Ephemeris adapter. Existing `/v1/chart` and
`/v2/chart` payloads, outputs, planetary positions and stationary contracts are
unchanged. No dependency or ephemeris flag is changed.

Input: `bodyA`, `bodyB` (distinct main planets, Sol through Plutão), `angle`
(0, 60, 90, 120, 180), caller-supplied `orb` (>0 and <=10 degrees), `start`
and `end` (explicit ISO UTC strings ending in Z). Bounds: 1600–2400, positive
range <=121 days, <=1200 samples. Invalid requests return HTTP 400.

This is an astronomical geometric search, not assignment of astrological
orbs/status/score. No natal identity, map, observer location or natal fixed
longitude is accepted or needed. No natal-versus-transit direction is inferred.

Response schema `GEOCENTRIC_ANGULAR_WINDOWS_V1`: intervals with inclusive
entry/exit and exact crossings; null boundaries remain unresolved beyond the
requested search. Sampling, relative-speed station refinement, orientations,
wrap handling and one-minute root precision follow the existing SkyNow solver.
Sampling does not constitute proof of completeness for arbitrary functions.
`calculationMs`, sample count and ephemeris version identify execution evidence.
In-process LRU: 256 results, symmetric body pairs; no persistence or user data.

Validation: 22 tests passed including existing chart-V1/V2/stationary regression.
Local parity against the prior SkyNow solver: 20 combinations of four pairs
and five aspects, including retrograde dates; interval/exact counts identical,
boundary/exact times within one minute. Evidence is in the task workspace at
`UTD/output/FAST_PERIOD_LOCAL/solver-parity.json` (not a repository dependency).

The additive `events` array provides factual longitudes for both participants
and actual orb at every finite entry/exact/exit timestamp; no extra HTTP call
is required for presentation. Open boundaries do not fabricate positions.
Backend publication to `origin/main` was explicitly authorized by the user.
Deploy this endpoint before switching the SkyNow client to it.
