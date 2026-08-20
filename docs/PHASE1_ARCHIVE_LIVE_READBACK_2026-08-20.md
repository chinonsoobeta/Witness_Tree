# Phase 1 archive live readback — 2026-08-20

This is a read-only live audit of the Phase 1 archive groups. The machine-readable record is [data/phase1-archive-live-readback-2026-08-20.json](../data/phase1-archive-live-readback-2026-08-20.json). It records current AWS S3 API observations in `ca-central-1`, without provider version IDs, account identifiers, credentials, or mutation results.

## Confirmed live facts

- The primary archive is versioned and Object Lock-enabled. Public access is blocked, ownership is `BucketOwnerEnforced`, encryption is AES256, raw incomplete multipart uploads are aborted after seven days, and enabled replication covers `raw/` to a same-region recovery bucket.
- All 39 annual VLCE2 payloads have `CRC64NVME` `FULL_OBJECT` checksums and COMPLIANCE retention through 2033-08-12. The recovery bucket has no annual VLCE2 payloads. The latest convergence record already reports the same 39 retained payload versions, so this live cross-check requires no ledger change.
- The forest-harvest payload and manifest are present on the primary and recovery buckets. The payload is COMPLIANCE-retained through 2033-08-12, with completed primary replication and a recovery replica.
- The canonical canopy-cover payload is COMPLIANCE-retained through 2033-08-12, but it has no recovery replica. Two superseded payload copies remain unlocked. Canopy-height and federal-electoral prefixes are empty on both buckets.
- All four current-wildfire raw payloads have `CRC64NVME` `FULL_OBJECT` checksums, COMPLIANCE retention through 2033-08-12, completed primary replication, and recovery payload/manifest replicas. Their primary manifests are present and unlocked.
- The BC derived prefix contains one 2,162,688-byte payload with no retention, no manifest, no replication, and no recovery object. The Ontario derived prefix is empty.
- The three Quebec promotion prefixes are empty on both buckets. An unrelated historic-QC prefix was excluded from this count.
- Two legal-hold exercise payloads and their two recovery replicas exist. They are COMPLIANCE objects with legal hold OFF, but their short retention periods were expired at capture. Live state does not prove the required ON/OFF transition, unchanged-retention, denied exact-version delete, or authorized recovery-readback steps.

## Remaining owner actions and blockers

Promotion is not authorized by this audit. The national missing objects, Quebec promotion sets, and current-wildfire derived outputs require the applicable owner approvals and version-specific dry-run/readback workflow. The BC derived orphan needs an explicit disposition before it can be considered an archive proof.

The derived-specific stop conditions are captured in [data/current-wildfire-derived-live-recovery-guard-2026-08-20.json](../data/current-wildfire-derived-live-recovery-guard-2026-08-20.json), and the exact national/Quebec preflight commands and owner preconditions are reconciled in [docs/PHASE1_ARCHIVE_OWNER_COMMAND_RECONCILIATION_2026-08-20.md](PHASE1_ARCHIVE_OWNER_COMMAND_RECONCILIATION_2026-08-20.md).

The normal archive-control exercise remains incomplete. It must be performed by an authorized owner and must preserve evidence of the legal-hold transitions, unchanged COMPLIANCE retention, denied exact-version deletion, and approved recovery readback. No such mutation was attempted here.

Recovery coverage and control evidence also remain incomplete: annual VLCE2, canopy cover, and derived objects are not represented in the recovery bucket; server access logging is not configured; and the repository still needs reconciled, redacted live readback evidence before any raw-evidence score changes.

## Phase 1 impact

This readback captured the prior 14.75 raw-evidence numerator, 39.2741935% formal evidence tracking and 9 immutable rows; the later redacted harvest archive evidence advances the canonical convergence state to 15.00/31, 39.516129% and 10 immutable rows. The four raw wildfire pairs support a historical canonical reconciliation of +1.00 raw point and +0.9677419 formal percentage points from the preceding 13.75 / 38.3064516 baseline; they add no further credit to the later harvest-adjusted state. That credit is raw-only: the owner gate is 4/6 because BC and Ontario derived archives are still incomplete, and production impact remains 0 percentage points. No Phase 2 work, deployment, push, email, or AWS/IAM/S3 mutation was performed.
