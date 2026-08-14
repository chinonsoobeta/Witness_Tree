# Phase 1 archive-controls remediation design

**Status:** design only; all actions require the archive owner's explicit approval. No command in this document has been run.

## Default recommendation

Use two IAM roles, a single CloudTrail trail with narrowly selected S3 data events, a weekly S3 Inventory report, and one `AbortIncompleteMultipartUpload` lifecycle rule. Create a second Object-Lock bucket in `ca-central-1` and use Same-Region Replication (SRR) as the first recovery design. It is the smallest design that creates an independently addressed Canadian copy and has no S3 transfer charge for SRR. It is not regional-disaster recovery; if that is a requirement, choose the Calgary option below instead.

Do not enable AWS Config for this one-bucket design. CloudTrail plus the explicit read-back/evidence gates observe the named controls, while Config would record account resources beyond this scope and adds configuration-item and snapshot costs. Reconsider Config only if the account begins managing multiple archive resources or needs managed-rule compliance reporting.

## Exact resources and boundaries

| Resource | Exact name / scope | State before creation |
| --- | --- | --- |
| Primary archive | `witness-tree-raw-archive-ca-central-1` in `ca-central-1` | Exists; versioning and Object Lock enabled; three original payloads and 39 VLCE2 payloads are retained. |
| Uploader role | `WitnessTreeArchiveUploader` | New; assumed only by MFA-authenticated temporary sessions from the approved no-console bootstrap user; no direct S3 identity. |
| Break-glass role | `WitnessTreeArchiveRetentionBreakGlass` | New; MFA-required temporary session from that user; no ordinary upload/read/delete access. |
| Audit-log bucket | `witness-tree-archive-audit-logs-ca-central-1` in `ca-central-1` | New, private, bucket-owner-enforced, public-access-blocked, SSE-S3. Do not use the Object-Lock source bucket for logs. |
| Trail | `witness-tree-archive-object-audit-ca-central-1` in `ca-central-1` | New; one free management-event copy and S3 data events limited to the primary bucket. |
| Inventory | `weekly-object-lock-inventory` | New; weekly CSV or Parquet to the audit-log bucket under `inventory/`; include version ID, Object Lock mode, retain-until date and legal-hold status. |
| Lifecycle rule | `abort-incomplete-multipart-after-7-days` | New on the primary bucket; prefix `raw/`, no Expiration, NoncurrentVersionExpiration, Transition, or delete-marker action. |
| Recovery bucket | `witness-tree-raw-recovery-ca-central-1` in `ca-central-1` | New only after recovery approval; Object Lock and versioning must be enabled at creation. |

`ACCOUNT_ID` and the exact ARN of the owner-approved `WitnessTreeArchiveOperator` bootstrap user must be supplied in a private change record. Do not substitute a root principal or put identifiers in Git. The read-only preflight found no existing federation; its decision and required MFA bootstrap are in [`PHASE1_ARCHIVE_IDENTITY_PREFLIGHT.md`](PHASE1_ARCHIVE_IDENTITY_PREFLIGHT.md).

## Least-privilege policy templates

Uploader permissions, restricted to the primary bucket and `raw/` only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid":"ListRawPrefix","Effect":"Allow","Action":["s3:ListBucket","s3:ListBucketMultipartUploads"],"Resource":"arn:aws:s3:::witness-tree-raw-archive-ca-central-1","Condition":{"StringLike":{"s3:prefix":["raw/*"]}}},
    {"Sid":"WriteAppendOnlyRawObjects","Effect":"Allow","Action":["s3:PutObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts","s3:GetObject","s3:GetObjectAttributes","s3:GetObjectRetention","s3:GetObjectLegalHold"],"Resource":"arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/*"},
    {"Sid":"DenyDeletionAndLockWeakening","Effect":"Deny","Action":["s3:DeleteObject","s3:DeleteObjectVersion","s3:PutObjectRetention","s3:PutObjectLegalHold","s3:BypassGovernanceRetention"],"Resource":"arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/*"}
  ]
}
```

Break-glass is a separate MFA-gated role. Its permission policy contains only `s3:GetObjectRetention`, `s3:GetObjectLegalHold`, `s3:PutObjectLegalHold`, and `s3:PutObjectRetention` on `raw/legal-hold-exercises/*`; it explicitly denies all delete, bucket-policy, lifecycle, replication, and `s3:BypassGovernanceRetention` actions. Its trust policy must require `aws:MultiFactorAuthPresent=true` and the exact approved no-console bootstrap user. It cannot administer historical payload keys.

The trail logs all management events plus S3 data events for `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/` with `ReadWriteType: All`; this captures object access, object writes/deletes, and the S3 control-plane operations that affect policies, retention, and lifecycle. Do not add CloudWatch Logs, Lake, Insights, or broad all-bucket selectors.

## Reversible, approval-gated order

1. **Approve identity custodian, no-console bootstrap user, MFA, review cadence, and cost ceiling.** Create and enroll the bootstrap user outside this package, then create roles and validate their policies with IAM Access Analyzer. Run a denied-delete probe under the uploader role. Reversible: delete unused roles and revoke the bootstrap credentials.
2. **Approve Canadian log bucket, log retention, and named reviewer.** Create the log bucket and the one trail; read back selectors and confirm a test `PutObject` and deliberately denied delete appear in the trail. Reversible: stop/delete trail after retaining required logs; log costs and retained evidence persist.
3. **Approve inventory retention and report review.** Configure weekly inventory to the Canadian log bucket; read back a report with Object Lock fields. Reversible: disable future reports; existing reports remain until their approved retention ends.
4. **Approve seven-day incomplete-multipart cleanup.** Apply exactly the single lifecycle rule and verify no expiration/transition action appears. It can only delete unfinished upload parts, never completed retained versions. Reversible for future multipart uploads; already-aborted parts cannot be restored.
5. **Approve legal-hold SOP and exercise object.** Upload one tiny, non-source `raw/legal-hold-exercises/YYYY-MM-DD/<uuid>/payload.txt` object with explicit COMPLIANCE retention, set legal hold ON through the break-glass role, read it back and log it, attempt a version-specific delete expecting AccessDenied, remove only the legal hold, and verify the original compliance retention is unchanged. The exercise object is never a source payload.
6. **Approve recovery choice and exercise scope.** Create the destination with Object Lock enabled before configuring replication. Verify retention/legal-hold replication permissions, replicate a newly written tiny exercise object, read exact source/destination versions and retention, then demonstrate restoration to a distinct temporary test key. Do not replicate existing historical data until the owner approves a separate S3 Batch Replication scope and cost.

## Recovery comparison and costs

| Choice | Benefits | Material limits / risk | Bounded estimate for current ~60 GB corpus |
| --- | --- | --- | --- |
| **Default: SRR to independent `ca-central-1` bucket** | Simplest; Canadian; no S3 transfer charge for SRR; independently addressed recovery copy. | Does not protect against regional loss or a compromise of the same account. Requires replication role and a separate bucket. | Extra S3 Standard copy: roughly **US$1.40–$2.00/month** at a conservative US$0.023–$0.033/GB-month range, plus small request charges. |
| **Alternative: CRR to `ca-west-1` (Calgary)** | Adds a second Canadian AWS Region and is the appropriate option if regional-loss recovery is required. | `ca-west-1` requires opt-in; extra cross-region transfer/replication charges, additional regional governance and operational complexity. Object-Lock destination and retention/legal-hold replication permissions are mandatory. | Same extra storage **US$1.40–$2.00/month**, plus one-time initial cross-region copy and ongoing replication request/transfer costs. Obtain the current Canada-region calculator quote before approval; cap pilot spend at **US$10**. |

For the default design, set a first-month budget ceiling of **US$5/month excluding recovery-copy storage**, or **US$10/month including the current ~60 GB SRR copy**. This bounds: CloudTrail S3 data events at US$0.10 per 100,000 events, one free management-event copy, small S3 log/inventory storage, and no CloudTrail Lake, CloudWatch Logs, or AWS Config. Costs rise with object reads/writes, log retention, corpus growth, and any chosen CRR transfer. IAM roles and the abort-incomplete-multipart rule do not have a separate service fee; incomplete multipart parts are otherwise billable until completed or aborted.

## Required approvals

- Bootstrap-user custodian, no-console/MFA setup, break-glass custodian, and policy review owner.
- Canadian audit-log destination, log/inventory retention, reviewer, and monthly ceiling.
- Seven-day multipart abort rule and acceptance that incomplete parts become unrecoverable.
- Legal-hold SOP, exercise object, named authorized operator, and audit review.
- Recovery objective: operational recovery only (default SRR) or regional-loss recovery (Calgary CRR); destination, retention, cost ceiling, and exercise plan.

### Official bases

- [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/) lists S3 data events at US$0.10 per 100,000 and one management-event copy to S3 at no charge.
- [CloudTrail data-event selectors](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-trail.html) support a bucket/prefix-scoped S3 selector.
- [S3 Object Lock considerations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html) states that Object-Lock buckets cannot be server-access-log destinations and documents replication/inventory requirements.
- [S3 lifecycle documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-rules.html) limits incomplete-upload cleanup to `AbortIncompleteMultipartUpload`.
- [S3 replication requirements](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-requirements.html) states that SRR has no data-transfer charge and Object-Lock destinations must also have Object Lock.
- [AWS Region documentation](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) identifies `ca-central-1` and `ca-west-1` as Canadian regions.
