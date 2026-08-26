# Phase 1 remaining archive operator readiness — 2026-08-25

This is an offline audit of the owner-local archive paths. It records no AWS
result, approval, archive completion, recovery completion, admission, or score
credit. No AWS command or MFA prompt was run for this audit.

Post-audit update: the current-wildfire raw promotion was subsequently completed by the owner, and a separate authorized read-only capture verified all eight exact retained objects. That row is no longer an MFA task; the other rows retain the audit boundary described here.

| Gate | Offline result | Exact no-write local command | Owner-local action boundary | Required retained proof / current blocker |
| --- | --- | --- | --- | --- |
| Québec fourth inventory | **Primary archive readback complete; recovery proof separate.** Independent redacted evidence binds all 62 planned objects, exact private versions, byte lengths, SHA-256 checksum types, and `COMPLIANCE` retention to `2033-08-12T00:00:00Z`. | `npm run check:qc-fourth-inventory-exact-archive-readback` | No new execution authority is needed for this completed archive; downstream transformation, ingestion, release, and admission remain separately owner-governed. | Retain recovery-replica evidence separately. Do not treat this raw archive evidence as admission. |
| Current wildfire raw (4 payloads + 4 sidecars) | **Completed and exact-version read back; no further MFA run.** All four raw payloads and four deterministic manifests match their pinned bytes/SHA-256, concrete versions, FULL_OBJECT CRC64NVME values, and `COMPLIANCE` retention in `ca-central-1`. | `npm run check:current-wildfire-exact-raw-archive-capture` | Do not rerun `--run`. The completed raw capture is archive evidence only. | The two derived wildfire payloads and recovery replication remain unverified; transformation, admission, release, and production eligibility remain false. See `CURRENT_WILDFIRE_EXACT_RAW_ARCHIVE_CAPTURE_2026-08-25.md`. |
| Current wildfire derived (BC and Ontario payloads + manifests) | **Readback/recovery runners are structurally ready, but require owner-private inputs.** The readback path is read-only once MFA has been obtained; the recovery path is deliberately no-overwrite and stops on an existing/ambiguous key or partial evidence. | `zsh scripts/run-wildfire-derived-readback.sh --preflight <absolute-owner-owned-mode-600-readback-approval.json>`; recovery: `zsh scripts/run-wildfire-derived-recovery.sh --preflight <absolute-mode-600-approval.json> <absolute-mode-600-private-state.json> <absolute-mode-600-iam-attestation.json> <absolute-mode-600-evidence.json>` | The readback command requires an owner-owned mode-600 approval. Recovery requires three owner-owned mode-600 private inputs, exact saved BC payload state, a fresh direct MFA role session, conditional `--if-none-match '*'` writes only for the three absent objects, and exact versioned heads/retention reads. | The private inputs were not supplied to this audit and no remote state was queried. Current public evidence remains placeholder-only; recovery/readback cannot be claimed complete. |
| Alberta PLVI raw + derived | **Ready for controlled archive promotion; downstream schema/admission remains blocked.** Raw ZIP and exact derived GPKG passed local bytes/SHA-256 preflight. Four keys and `COMPLIANCE` to `2033-08-12T00:00:00Z` are pinned. | `zsh scripts/run-alberta-plvi-approved-promotion.sh --preflight` | `--run` first checks local bytes/SHA, then directly assumes `WitnessTreePlviArchivePromotionUploader` with fresh MFA. Existing fixed keys require exact-version download/checksum or deterministic-manifest comparison; only an explicitly absent key may be conditionally created with `If-None-Match: *`. Missing retention alone is corrected and reread; insufficient/ambiguous retention stops. | No immutable remote proof is retained. Separately, the derived artifact has known ordered-schema drift; archive proof does not authorize transformation/ingestion/release/production admission. |
| Normal archive control exercise | **Not executed.** Its advertised `--preflight` makes a read-only `sts get-caller-identity` call, so it was intentionally excluded from this no-AWS audit. The `--run`/`--recover-latest` modes are not no-write: they create or alter a dedicated legal-hold exercise object. | Do **not** classify `scripts/run-phase1-archive-owner-exercise.sh --preflight` as offline; it is AWS read-only. | Every non-preflight mode asks for a fresh TOTP before AWS access. The run path uses distinct uploader, break-glass, and verifier roles; it checks Object Lock retention survives legal-hold removal and verifies version-specific delete is denied. | No normal-exercise readback evidence was reviewed or created. A successful run still requires recovery-replica readback and its redacted evidence to pass `scripts/check-phase1-archive-exercise-readback.mjs`. |

## Shared controls checked offline

`node scripts/check-archive-direct-mfa-runners.mjs` passed for 15 shell
runners. The shared helper rejects an assumed-role bootstrap, validates the
configured user ARN and account before role assumption, reads a non-stored
six-digit TOTP, and requests a direct MFA role session for 43,200 seconds.

The current-wildfire and PLVI raw promotion runners now share the federal-style
fixed-key recovery boundary. They distinguish explicit absence from an
ambiguous provider error, verify any existing approved object at its concrete
version by downloading it and checking bytes, compare an existing sidecar to
the deterministic local manifest, repair only a missing retention record, and
use conditional `If-None-Match: *` creation only for an absent key. An orphan
manifest, stale/mismatched bytes, insufficient retention, access failure, or
race fails closed without replacing the existing key. Focused hostile mocked
tests cover an exact existing payload/manifest replay with no `PutObject`, a
downloaded payload SHA mismatch, precise missing-retention-only repair,
unrecognized retention failure with no mutation, ambiguous existing keys for
both runners, and an orphan PLVI manifest. They assert no replacement write is
reached where the state is ambiguous or invalid.

These execution paths are necessary controls. The separately captured current-wildfire raw readback is exact archive evidence, but it does not complete the universal Phase 1 archive gate. Remaining archive, recovery, source-decision, downstream-admission, and production-eligibility gates stay fail-closed until their respective remote and independent evidence exists.
