# Phase 1 owner-decision queue

[`data/phase1-owner-decision-queue.json`](../data/phase1-owner-decision-queue.json) is the read-only consolidated queue for the 16 canonical rows that are already `local-verified-profiled` or `remote-verified-archived-profiled` but still have a false production-admission proof.

The queue deliberately excludes the two `partial-component` rows and the 13 `access-blocked` rows. Their next gates are still external artifact, rights, authority, precision, or permission resolution; an owner production decision cannot cure those blockers.

## Current owner queue

| Dependency step | Bundle | Rows | Exact owner decision or approval still needed |
| --- | --- | --- | --- |
| 1 | Federal electoral archive | `fed-2023-ridings`, `elections-canada-45th-files` | Exact federal-only approval is recorded. Owner-local fresh-MFA execution and exact immutable/recovery evidence remain; then record the named federal source and downstream decisions. |
| 2 | Québec current/original downstream | `qc-current-ecoforest`, `qc-original-current-inventory` | Immutable evidence and source-ledger-only decisions are integrated. Define and approve exact transformations, validate checksum-bound outputs, then decide ingestion, release, and production admission separately. |
| 3 | Québec fourth-inventory archive | `qc-fourth-inventory` | All four approvals are recorded. Controlled paths, fresh-MFA owner execution and exact readbacks remain; then record the source decision and separately scoped semantic transformation/join selection. |
| 4 | Archived national source decisions | `ntems-forest-harvest`, `ntems-canopy-height` | The supplied owner source-ledger-only decisions are recorded; scope-bound profile/archive validation is complete, while any transformation, ingestion, release, and production decision remains separate. |
| 5 | Alberta PLVI scope | `ab-primary-land-vegetation` | The supplied owner decision admits only the unchanged raw ZIP and exact 179,087-feature closed-join derived scope with 12 bounded repairs, preserved duplicate `POLYGON_ID 41405`, and no feature loss or deduplication; scope-bound validation/preparation is allowed, while downstream admission remains separate. |
| 6 | Current-wildfire archive gate | `cwfis-current`, `bc-wildfire`, `ab-wildfire`, `on-fire-disturbance` | Exact owner-local proof-capture approval is recorded. All six objects still have placeholder-only attestations, and 0/6 have repository-retained concrete version/checksum bindings. Exact-version immutable proof must precede downstream activation. |
| 7 | Archived remote downstream | `ntems-annual-land-cover`, `ntems-canopy-cover`, `ab-avi-crown`, `ab-avi-post-harvest` | Existing approvals are source-ledger-only. Obtain separately named downstream transformation and ingestion scope, execute and validate them, then record release and production admission. |
| 8 | Current-wildfire downstream | Same four current-wildfire rows | After the six-object archive gate passes, validate the already approved transformations and ingestion, then record release and production admission. |
| 9 | Local-row downstream | Federal and Québec local rows | After exact immutable/recovery read-backs, record each named source, transformation, ingestion, release, and production-admission decision separately. |
| 10 | Final queue admission | All 16 queued rows | Record release and production admission separately; eligibility stays false until every required proof is true. |

No broader approval is inferred from local preparation, an archive plan, current-wildfire conditional approval, or a successful structural preflight. The queue reconciles the two supplied non-admitting decisions but records no remote mutation, transformation admission, ingestion, release, production admission, or score credit.

Validation:

```text
npm run check:phase1-owner-decision-queue
```

The machine checker also verifies that the queue plus its explicit partial/access exclusions accounts for all 31 ledger rows, that every action reference exists in the remaining-action audit, that dependency order is acyclic and complete, and that the current-wildfire primary condition remains 0/6 machine-verifiable with production eligibility false.
