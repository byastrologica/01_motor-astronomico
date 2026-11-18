# Temporal windows API

POST /v1/temporal-windows (JSON, maximum 1 MB).
Request schemaVersion: TEMPORAL_WINDOW_REQUEST_V1.
Response schemaVersion: ASPECT_TEMPORAL_WINDOWS_V1.

Input: context.referenceUtc (UTC Z), timeZone, birthTimeKnown, observer
latitude/longitude and houseSystem for dependent points, immutable selected
fixedEclipses snapshots, and relations with relationId, bodyA/bodyB, aspect,
classification CORE or AMPLO, source limitDegrees, measuredOrbDegrees,
exactAngle and limitSource. sourceSignature is SHA-256 sorted-key JSON excluding
sourceSignature. Duplicate, derived-derived and other excluded pairs are rejected.

Output: reference, source ephemeris provenance, summary and results with one
connected interval per relation, all bracketed exact passages and both boundaries.
Events include utc, timestampMs, orbDegrees and two full coordinate positions.
Explicit partial/unavailable statuses are not scientific results.

Operational guardrails: 512 relations, 24,000 samples per relation, 18-second
batch budget, bounded 1600–2400 astronomical domain, four computational profiles,
32 complete-response cache entries. Failures are not cached as completed work.
No scoring, ranking or eligibility expansion; no nearest-eclipse lookup.
This endpoint supports Index/CS enrichment, not natal transit interpretation.
Existing /v1/angular-windows is unchanged.
