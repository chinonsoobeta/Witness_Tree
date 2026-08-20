# Phase 1 archive owner-command reconciliation — 2026-08-20

The machine-readable record is [data/phase1-archive-owner-command-reconciliation-2026-08-20.json](../data/phase1-archive-owner-command-reconciliation-2026-08-20.json). It reconciles the existing local commands with current live prefix state. It does not add permissions, apply retention, upload, delete, or make a production decision.

## National promotion

The read-only checks show the canopy-height and federal-electoral prefixes empty on both buckets. Forest harvest is already present on the primary and recovery buckets, so the existing three-artifact runner is not a safe direct execution path: its append-only duplicate guard will encounter the existing harvest target. The owner may run `zsh scripts/run-phase1-approved-promotion.sh --preflight` for local validation, but `--run` remains blocked until a freshly approved canopy-height/federal-only path or explicit harvest reconciliation exists.

Required preconditions are fresh exact-artifact approval, exact local byte/SHA validation, confirmation of the existing authorized version-specific readback/retention capabilities, and repository-integrated redacted readback/recovery evidence. No IAM change is assumed.

## Quebec current/original promotion

The exact planned prefixes `raw/qc-ecoforest-map/` and `raw/qc-original-inventory/` are empty on both buckets. The safe local command is `zsh scripts/run-qc-approved-multipart-promotion.sh --preflight`; `--run` remains blocked pending fresh approval of both exact archives, four keys, sequential multipart handling, retention, and readbacks.

## Quebec fourth inventory

The `raw/qc-fourth-inventory/` prefix is empty on both buckets. `node scripts/qc-fourth-inventory-immutable-promotion.mjs` is dry-run only. The execute form remains blocked until all four independent approvals are true: exact artifact set, least-privilege IAM policy, irreversible COMPLIANCE retention, and MFA session. Its `--session-ready` and controlled-directory placeholders are not authority or credentials; the command was not run.
