# Phase 1 archive-controls execution package

`data/phase1-archive-controls-execution.json` and `scripts/phase1-archive-controls-execution.mjs` turn the approved remediation design into an auditable AWS CLI package. The committed state is deliberately `unapplied`. Its normal command is a dry-run that prints commands and never calls AWS:

```sh
npm run dry-run:phase1-archive-controls
```

The package creates no live resources during tests or validation. It has no AWS SDK dependency; execution uses the existing AWS CLI only after every approval is affirmatively supplied at runtime.

## Planned resources

- `WitnessTreeArchiveUploader`: write and verification access only within `raw/`, with explicit denial of deletion and Object-Lock weakening.
- `WitnessTreeArchiveRetentionBreakGlass`: a separate owner federation role which requires MFA and is limited to retention and legal-hold operations on `raw/legal-hold-exercises/*`; it expressly denies deletion, governance bypass, and bucket administration.
- `witness-tree-archive-audit-logs-ca-central-1`: a private, SSE-S3 audit/inventory bucket in Canada (Central), separate from the Object-Lock source bucket.
- `witness-tree-archive-object-audit-ca-central-1`: one trail with management events and a single `ReadWriteType: All` S3 object selector scoped to the primary archive bucket.
- `weekly-object-lock-inventory`: weekly CSV inventory of every `raw/` object version, including version, Object-Lock mode, retain-until date, and legal-hold status.
- `abort-incomplete-multipart-after-7-days`: the only lifecycle action. It has no expiration, transition, delete-marker, or noncurrent-version action.
- `witness-tree-raw-recovery-ca-central-1`: a separate Object-Lock, versioned recovery bucket in the same Canadian region, with new-object-only SRR. Existing payloads are explicitly excluded.

The exercise writes a tiny, non-source object under `raw/legal-hold-exercises/YYYY-MM-DD/<id>/payload.txt`, sets explicit compliance retention, turns its legal hold on, reads retention/hold state, then turns only that legal hold off and reads retention again. A production invocation must additionally make and preserve the deliberately denied version-specific delete probe and its CloudTrail evidence; this is intentionally not automated into an unreviewed write path.

## Approval and cost guard

Actual execution requires `--execute`, all seven `--approve-*` flags recorded in the plan, an owner-supplied account ID and federated principal ARN, a future exercise retention instant, dedicated exercise key and payload file, a new empty local work directory, and exactly `--monthly-ceiling 10`. No account ID, principal ARN, credentials, signed URL, source byte, or live version ID is committed.

The package estimates roughly US$1.40–$2.00/month for the current 60 GB same-region recovery copy plus small request, Inventory, and CloudTrail data-event charges. This is only a planning estimate. The operator must confirm the current AWS price calculator result and stop if it is greater than US$10/month. IAM and the lifecycle rule have no direct service fee; retained log/inventory/recovery data and event volume can increase cost.

## Rollback limits

Unused roles, a trail, future Inventory reports, and an empty recovery bucket can be removed only after evidence-retention review. Existing reports/logs and replicas may need to be retained. Aborted multipart parts cannot be restored. Object Lock is enabled only at bucket creation and cannot be disabled afterwards. Compliance retention cannot be shortened or removed. This plan deliberately does not replicate historical objects; an owner-approved Batch Replication scope and cost review is required for that separate, potentially costly action.

The full design rationale, including the distinction between same-region operational recovery and a Calgary regional-loss design, remains in [PHASE1_ARCHIVE_CONTROLS_REMEDIATION_DESIGN.md](PHASE1_ARCHIVE_CONTROLS_REMEDIATION_DESIGN.md).
