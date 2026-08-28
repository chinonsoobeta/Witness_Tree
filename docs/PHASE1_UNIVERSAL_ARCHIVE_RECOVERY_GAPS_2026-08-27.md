# Phase 1 universal archive/recovery gap classification

As of 2026-08-27, the Phase 1 universal raw-file criterion remains **fail**. The
criterion in the [controlling implementation plan](CONTROLLING_IMPLEMENTATION_PLAN.md)
requires every raw file to have a checksum and to be re-fetchable or restorable
from the archive. This note classifies the remaining gaps; it does not change a
gate, grant admission, or infer rights from local bytes.

## Evidence that is complete locally

The [canonical raw inventory](PHASE1_CANONICAL_RAW_INVENTORY.md) reconciles the
named 22-row core contract against **120 physical artifacts**. All **120/120**
listed artifacts match their recorded local byte length and SHA-256. The
inventory is local read-only evidence only: its archive, recovery, admission,
transformation, ingestion, release, and production claims are all explicitly
false.

The resulting row-level picture is:

| Local inventory result | Count | Boundary |
| --- | ---: | --- |
| Core rows with all listed canonical local payloads matched | 17/22 | This is a local-byte result, not archive recovery evidence. |
| Partial core row | 1 | `provincial-electoral-boundaries`; BC and Ontario components are present, Québec is a future-edition candidate rather than the current canonical component, and Alberta is not present in the inventory. |
| Core rows with no listed local artifact | 4 | `indian-reserves`, `first-nation-reserves`, `historic-treaties`, and `modern-treaties`. |
| Physical artifacts matched | 120/120 | Includes supporting records and the non-canonical Québec future-edition candidate; physical count is not a production-row count. |

The canonical payload count is **111**. Shared physical files are counted once
in the artifact total and may be named by more than one row; the inventory does
not duplicate them or treat a supporting record as a canonical payload.

## Archive/recovery gaps

1. **Universal per-artifact proof is not established.** A local checksum match
   proves only that the named bytes are present on the external data root. It
   does not prove that the same version exists in immutable storage, can be
   re-fetched, has a tested recovery copy, or can be restored. The inventory
   therefore cannot close the universal archive/recovery criterion by itself.

2. **Four core rows have no exact local artifact to reconcile.** The source
   ledger records these rows as `access-blocked`, and the inventory records no
   payload for them. Their next step is authoritative source/owner work to
   obtain and record the exact current artifact and its source-ledger fields.
   No legal right, publisher permission, or production admission is inferred by
   this classification.

3. **The provincial-boundary row is incomplete.** Two present local components
   are byte-matched, but the current four-province set is not reconciled: the
   inventory records no Alberta component, and the Québec file listed there is a
   future-edition candidate and is not counted as the current canonical payload.
   The missing current component/version decision is an authoritative-source
   and owner decision, not a hashing or checker problem.

4. **NBAC has primary-readback evidence, not recovery evidence.** The durable
   [NBAC receipt](../data/nbac-archive-receipt-2026-08-27.json) binds the exact
   payload and manifest, their local checks, and a private exact-version
   primary readback with COMPLIANCE retention. Its
   `recoveryReplicaVerified`, `immutablePrimaryArchive`, and
   `universalArchiveRecovery` claims remain false. The receipt is correctly
   integrated into the NBAC profile, source ledger, and readiness audit without
   inflating raw or admission credit.

5. **Recorded row evidence is not a complete physical-artifact recovery
   register.** The source ledger currently reports 14
   `remote-verified-archived-profiled` rows, one `local-verified-profiled`
   row (`cwfis-historical`), one `partial-component` row, 13
   `access-blocked` rows, and two production-admitted rows. Those row states are
   useful reconciliation facts, but the universal criterion still requires an
   exact, independently reviewable archive/refetch/restore binding for every
   required raw file and the unresolved rows above.

## Work that is actionable in this repository

The engineering checks now provide the bounded pieces that can be completed
without credentialed operations:

- the canonical inventory has an explicit 22-row contract, exact artifact
  metadata, bidirectional row/artifact membership checks, and a read-only
  `--verify-bytes` path;
- the NBAC receipt is schema-checked, private-evidence checked when explicitly
  requested, and cross-bound to the NBAC profile, preparation, and readiness
  record;
- the source-ledger field audit requires the exact field set, directly bound
  evidence values, safe regular repository evidence files, and fail-closed
  missing/verified field shapes; and
- focused tests and checkers preserve the false archive/recovery/admission
  states when bytes are present locally.

These checks make later evidence review deterministic. They cannot create
publisher artifacts, owner approvals, provider object versions, recovery
replicas, or credentialed readbacks.

## Remaining non-engineering actions

The following actions require an authorized owner, source authority, or
credentialed archive operator and were not performed here:

- resolve the recorded source/authority blockers for the four absent core rows
  and provide exact current artifacts and field evidence;
- resolve the current provincial-boundary component/version set, including the
  missing Alberta component, under the authoritative source record;
- execute the approved archive operations and capture exact version, checksum,
  retention, refetch/restore, and recovery-copy evidence for every required
  artifact not already covered by an equivalent durable record; and
- reconcile those externally supplied records back into the canonical ledger
  and rerun the Phase 1 checks without changing the gate definition.

No AWS, MFA, archive upload, retention mutation, recovery operation, rights
decision, admission decision, or production promotion is implied or authorized
by this note.
