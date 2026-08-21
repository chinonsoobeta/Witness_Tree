# Phase 1 owner-decision queue

[`data/phase1-owner-decision-queue.json`](../data/phase1-owner-decision-queue.json) is the read-only consolidated queue for the 16 canonical rows that are already `local-verified-profiled` or `remote-verified-archived-profiled` but still have a false production-admission proof.

The queue deliberately excludes the two `partial-component` rows and the 13 `access-blocked` rows. Their next gates are still external artifact, rights, authority, precision, or permission resolution; an owner production decision cannot cure those blockers.

## Current owner queue

| Dependency step | Bundle | Rows | Exact owner decision or approval still needed |
| --- | --- | --- | --- |
| 1 | Federal electoral archive | `fed-2023-ridings`, `elections-canada-45th-files` | Fresh approval of the exact federal artifact, Canadian destination, retention instant, and execution/read-back procedure. After exact immutable/recovery evidence, record the named federal source and downstream decisions. |
| 2 | Québec current/original archive | `qc-current-ecoforest`, `qc-original-current-inventory` | Fresh approval of both exact artifacts, four exact keys, Canadian destination, MFA-gated multipart procedure, COMPLIANCE retention, and version/byte/checksum/retention read-backs. |
| 3 | Québec fourth-inventory archive | `qc-fourth-inventory` | Separate exact-artifact, IAM, MFA-session, and irreversible COMPLIANCE-retention approvals. After archive, record the source decision and separately scoped semantic transformation/join selection. |
| 4 | Archived national source decisions | `ntems-forest-harvest`, `ntems-canopy-height` | The supplied owner source-ledger-only decisions are recorded; scope-bound profile/archive validation is complete, while any transformation, ingestion, release, and production decision remains separate. |
| 5 | Alberta PLVI scope | `ab-primary-land-vegetation` | The supplied owner decision admits only the unchanged raw ZIP and exact 179,087-feature closed-join derived scope with 12 bounded repairs, preserved duplicate `POLYGON_ID 41405`, and no feature loss or deduplication; scope-bound validation/preparation is allowed, while downstream admission remains separate. |
| 6 | Current-wildfire archive gate | `cwfis-current`, `bc-wildfire`, `ab-wildfire`, `on-fire-disturbance` | Fresh approval of the four exact payloads and four deterministic sidecars, the Canadian destination, payload-only COMPLIANCE retention, and MFA-gated read-back. The existing owner scope/transformation/ingestion/release/production decisions are conditional; all six primary exact objects are verified, while derived recovery/mutation provenance remains absent. |
| 7 | Archived remote downstream | `ntems-annual-land-cover`, `ntems-canopy-cover`, `ab-avi-crown`, `ab-avi-post-harvest` | Existing approvals are source-ledger-only. Obtain separately named downstream transformation and ingestion scope, execute and validate them, then record release and production admission. |
| 8 | Current-wildfire downstream | Same four current-wildfire rows | After the six-object archive gate passes, validate the already approved transformations and ingestion, then record release and production admission. |
| 9 | Local-row downstream | Federal and Québec local rows | After exact immutable/recovery read-backs, record each named source, transformation, ingestion, release, and production-admission decision separately. |
| 10 | Final queue admission | All 16 queued rows | Record release and production admission separately; eligibility stays false until every required proof is true. |

No broader approval is inferred from local preparation, an archive plan, current-wildfire conditional approval, or a successful structural preflight. The queue reconciles the two supplied non-admitting decisions but records no remote mutation, transformation admission, ingestion, release, production admission, or score credit.

Validation:

```text
npm run check:phase1-owner-decision-queue
```

The machine checker also verifies that the queue plus its explicit partial/access exclusions accounts for all 31 ledger rows, that every action reference exists in the remaining-action audit, that dependency order is acyclic and complete, and that the current-wildfire primary six-object condition remains 6/6 with recovery/mutation provenance and production eligibility false.
