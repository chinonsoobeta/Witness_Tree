# Phase 1 owner-decision queue

[`data/phase1-owner-decision-queue.json`](../data/phase1-owner-decision-queue.json) is the read-only consolidated queue for the 15 canonical rows that are already `local-verified-profiled` or `remote-verified-archived-profiled` but still have a false production-admission proof. The linked JSON is a dated 2026-08-22 historical snapshot; this current view is reconciled to the 2026-08-27 ledger.

The queue deliberately excludes the one `partial-component` row, the 13 `access-blocked` rows, and the two `production-admitted` federal rows. The excluded non-admitted rows still need external artifact, rights, authority, precision, or permission resolution; an owner production decision cannot cure those blockers.

## Current owner queue

| Dependency step | Bundle | Rows | Exact owner decision or approval still needed |
| --- | --- | --- | --- |
| 1 | NBAC recovery and archive-control completion | `cwfis-historical` | Current official OGL Canada metadata, the exact 1,257,052,370-byte checksum/profile, exact-key IAM evidence, and a durable exact-version primary payload/manifest readback with COMPLIANCE retention are recorded. Recovery, transformation, ingestion, release, publication, and production admission remain separate and false. |
| 2 | Québec current/original downstream | `qc-current-ecoforest`, `qc-original-current-inventory` | Immutable evidence and source-ledger-only decisions are integrated. Define and approve exact transformations, validate checksum-bound outputs, then decide ingestion, release, and production admission separately. |
| 3 | Québec fourth-inventory downstream | `qc-fourth-inventory` | Independent redacted exact-version/COMPLIANCE readback is complete. Retain recovery proof separately, then record transformation, ingestion, release, and production-admission decisions separately. |
| 4 | Archived national source decisions | `ntems-forest-harvest`, `ntems-canopy-height` | The supplied owner source-ledger-only decisions are recorded; scope-bound profile/archive validation is complete, while any transformation, ingestion, release, and production decision remains separate. |
| 5 | Alberta PLVI scope | `ab-primary-land-vegetation` | The supplied owner decision admits only the unchanged raw ZIP and exact 179,087-feature closed-join derived scope with 12 bounded repairs, preserved duplicate `POLYGON_ID 41405`, and no feature loss or deduplication; scope-bound validation/preparation is allowed, while downstream admission remains separate. |
| 6 | Current-wildfire archive gate | `cwfis-current`, `bc-wildfire`, `ab-wildfire`, `on-fire-disturbance` | Exact-version COMPLIANCE evidence covers six primary raw/derived objects. Recovery proof, transformation, ingestion, release, and production admission remain separate before downstream activation. |
| 7 | Archived remote downstream | `ntems-annual-land-cover`, `ntems-canopy-cover`, `ab-avi-crown`, `ab-avi-post-harvest` | Existing approvals are source-ledger-only. Obtain separately named downstream transformation and ingestion scope, execute and validate them, then record release and production admission. |
| 8 | Current-wildfire downstream | Same four current-wildfire rows | After required recovery or mutation-provenance evidence is integrated, validate the approved transformations and ingestion, then record release and production admission. |
| 9 | Local-row downstream | `cwfis-historical` | After exact immutable/readback evidence, record the named source, transformation, ingestion, release, publication, and production-admission decision separately. |
| 10 | Final queue admission | All 15 queued rows | Record release and production admission separately; eligibility stays false until every required proof is true. |

No broader approval is inferred from local preparation, an archive plan, current-wildfire conditional approval, or a successful structural preflight. The queue records no new remote mutation, transformation admission, ingestion, release, production admission, or score credit.

Validation:

```text
npm run check:phase1-owner-decision-queue
```

The machine checker also verifies that the queue plus its explicit partial/access exclusions accounts for all 31 ledger rows, that every action reference exists in the remaining-action audit, that dependency order is acyclic and complete, and that current-wildfire archive and production eligibility conditions remain non-production.
