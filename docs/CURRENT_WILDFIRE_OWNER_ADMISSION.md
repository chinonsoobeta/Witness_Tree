# Current-wildfire owner admission

The owner has approved the exact Phase 1 transformation, ingestion, public-release and production-admission scope for the four checksum-bound current-wildfire snapshots. This clears the BC and Ontario geometry decisions and resolves the CWFIS and Alberta operational semantics. It does **not** make any source production eligible: the machine record has four of six required immutable object readbacks, so ingestion, release and runtime activation remain blocked.

The binding record is [`data/current-wildfire-owner-admission.json`](../data/current-wildfire-owner-admission.json). Its gate requires exact object keys, version IDs, byte lengths, full-object checksum verification, exact-version readbacks, Canadian `ca-central-1` storage and active COMPLIANCE retention through at least `2033-08-12T00:00:00Z` for four raw objects and the two required derived objects.

## Geometry decisions

- **British Columbia:** retain the unchanged 217-feature raw snapshot. Geometry-dependent use is limited to the checksum-bound 216-feature release: 215 raw-valid features unchanged plus the bounded repair for `G70362`. `V10755` is permanently excluded and quarantined because its candidate repair changes area by `3.167100456%`. Releases must state that only 216 geometries are admitted and must never claim 217-feature geometry coverage.
- **Ontario:** retain the unchanged 188-feature raw snapshot. The checksum-bound 188-feature release admits 179 unchanged features plus all nine bounded repairs. It has zero exclusions, zero invalid geometries and a closed 188-to-188 source-object join.

## Refresh and authority semantics

Every publication is an as-of snapshot, never a real-time claim. A refresh creates new immutable lineage instead of overwriting an earlier snapshot. Empty, capped, partial, schema-drifted, invalid, checksum-unbound or unarchived input is rejected; the last good release remains visible as degraded and becomes stale after 24 hours.

Within a province, the responsible provincial wildfire agency source prevails over CWFIS when records conflict. CWFIS is national fallback point context, not a complete incident/perimeter inventory and not provincial-authoritative. Alberta is a point-location snapshot, not perimeter geometry. None of the four sources is emergency direction, a damage map, a mortality map or a completeness guarantee.

## Remaining activation gate

No AWS operation is part of this decision. Production eligibility remains `false` until one repository-integrated readback record satisfies all six exact-object requirements. Owner approval cannot substitute for storage evidence, and the existing raw provenance and geometry policies remain unchanged.

## Derived archive recovery

The redacted read-only archive record found one BC derived orphan payload with
the approved 216-feature byte length and full-object CRC64NVME, but no
retention, manifest or recovery replica; the Ontario derived prefix is empty.
The fail-closed recovery guard is recorded in
[`data/current-wildfire-derived-live-recovery-guard-2026-08-20.json`](../data/current-wildfire-derived-live-recovery-guard-2026-08-20.json).
It records no version identifier, permission change, retention write, upload,
delete, or owner admission. The derived objects remain unverified until a
separately approved exact-key promotion and redacted version/checksum/
retention/recovery readback are integrated.
