# Current-wildfire owner admission

The owner has approved the conditional Phase 1 scope for the four checksum-bound current-wildfire snapshots. This clears the BC and Ontario geometry decisions and resolves the CWFIS and Alberta operational semantics. It does **not** prove transformation, ingestion, release, production admission, or immutable storage: zero of six payloads have durable machine-verifiable archive proof, while six placeholder-only attestations are recorded.

The binding record is [`data/current-wildfire-owner-admission.json`](../data/current-wildfire-owner-admission.json). Its gate requires exact object keys, version IDs, byte lengths, full-object checksum verification, exact-version readbacks, Canadian `ca-central-1` storage and active COMPLIANCE retention through at least `2033-08-12T00:00:00Z` for four raw objects and the two required derived objects.

The canonical derived payload keys are the exact timestamped keys in [`data/wildfire-derived-immutable-promotion-preparation.json`](../data/wildfire-derived-immutable-promotion-preparation.json), with deterministic `/manifest.json` companions. The shorter legacy `derived/<source>/geometry-policy-v1/2026-08-14/...` variants are not aliases: they must never be uploaded, recognized by the six-object gate, or used for recovery.

## Geometry decisions

- **British Columbia:** retain the unchanged 217-feature raw snapshot. Geometry-dependent use is limited to the checksum-bound 216-feature release: 215 raw-valid features unchanged plus the bounded repair for `G70362`. `V10755` is permanently excluded and quarantined because its candidate repair changes area by `3.167100456%`. Releases must state that only 216 geometries are admitted and must never claim 217-feature geometry coverage.
- **Ontario:** retain the unchanged 188-feature raw snapshot. The checksum-bound 188-feature release admits 179 unchanged features plus all nine bounded repairs. It has zero exclusions, zero invalid geometries and a closed 188-to-188 source-object join.

## Refresh and authority semantics

Every publication is an as-of snapshot, never a real-time claim. A refresh creates new immutable lineage instead of overwriting an earlier snapshot. Empty, capped, partial, schema-drifted, invalid, checksum-unbound or unarchived input is rejected; the last good release remains visible as degraded and becomes stale after 24 hours.

Within a province, the responsible provincial wildfire agency source prevails over CWFIS when records conflict. CWFIS is national fallback point context, not a complete incident/perimeter inventory and not provincial-authoritative. Alberta is a point-location snapshot, not perimeter geometry. None of the four sources is emergency direction, a damage map, a mortality map or a completeness guarantee.

## Remaining activation gate

No AWS operation is part of this decision. The six integrated raw/derived records are attestations only: they omit concrete provider version identifiers, use `redacted-present` checksum placeholders, and record no audit operations for the derived pair. The primary archive gate is therefore `0/6` machine-verifiable (`6/6` attested only). Production eligibility remains `false` until exact-version immutable proof and every downstream gate pass. Owner approval cannot substitute for those proofs, and the existing raw provenance and geometry policies remain unchanged.

## Derived archive recovery

The older fail-closed recovery guard remains historical evidence in
[`data/current-wildfire-derived-live-recovery-guard-2026-08-20.json`](../data/current-wildfire-derived-live-recovery-guard-2026-08-20.json).
The newer redacted primary record
[`data/current-wildfire-derived-archive-evidence.json`](../data/current-wildfire-derived-archive-evidence.json)
proves the exact BC and Ontario payload/manifest heads and payload retention,
but intentionally claims no recovery replica, mutation provenance, owner
admission, transformation, ingestion, release or production eligibility.
