# Immutable raw-archive provisioning record

**Status:** One empty bucket exists. Nothing has been uploaded. This record states only what was created and read back from the AWS console; it does not authorize an upload, a promotion, a transformation, an ingestion, or a public release.

This record supplements the [immutable storage decision](IMMUTABLE_STORAGE_DECISION.md), the [immutable storage contract](IMMUTABLE_STORAGE_CONTRACT.md), and the [provider options](IMMUTABLE_STORAGE_PROVIDER_OPTIONS.md).

## Provisioned resource

| Field | Value |
| --- | --- |
| Provider | AWS S3 (Amazon Simple Storage Service), general purpose bucket |
| Bucket name | `witness-tree-raw-archive-ca-central-1` |
| Bucket ARN | `arn:aws:s3:::<bucket-name>` (that is, `arn:aws:s3:::witness-tree-raw-archive-ca-central-1`) |
| Region | Canada (Central), `ca-central-1` |
| Created (UTC) | 2026-08-12T06:39:07Z |
| Console-displayed creation date | August 11, 2026, 23:39:07 (UTC-07:00) |

The AWS account ID is deliberately omitted from this record. S3 bucket ARNs do not contain an account ID, so the ARN above is complete as written.

## Configuration read back from the console

Every value below was read from the bucket's Properties and Permissions tabs after creation. None of it is assumed from the creation form.

| Setting | Displayed state |
| --- | --- |
| AWS Region | Canada (Central) ca-central-1 |
| Bucket Versioning | Enabled |
| Versioning suspension | Blocked. The console states versioning cannot be suspended because Object Lock is enabled. |
| Object Lock | Enabled |
| Default retention | Disabled |
| Default encryption | Server-side encryption with Amazon S3 managed keys (SSE-S3) |
| Bucket Key | Enabled (applies only to KMS encryption, which is not in use here) |
| Blocked encryption types | Server-Side Encryption with Customer-Provided Keys (SSE-C) |
| Block all public access | On |
| Object Ownership | Bucket owner enforced (ACLs disabled) |
| MFA delete | Disabled |
| Server access logging | Disabled |
| Event notifications | None configured |
| Amazon EventBridge notifications | Off |
| Transfer acceleration | Disabled |
| Requester pays | Disabled |
| Static website hosting | Disabled |
| Lifecycle rules | None created |
| Cross-Region Replication | Not configured |
| Tags | None |
| Objects | None |

## Why no default retention is set

Object Lock is enabled on the bucket, but **no default retention period is configured**. This is deliberate.

S3 Object Lock retention in compliance mode cannot be shortened, overridden, or deleted by anyone, including the AWS account root user, for the whole duration of the retention period. A default retention period would therefore be applied automatically to every object written to the bucket, at a duration nobody has approved, and the cost and deletion consequences of that duration would be irreversible.

Enabling Object Lock on the bucket without a default is the reversible half of the decision: the bucket is capable of write-once retention, and retention will be applied per object at upload time once the owner has chosen and approved a duration. A wrongly chosen default would not be reversible.

Retention duration remains an owner and legal decision, as stated in the immutable storage decision.

## Mapping to the "Required storage controls" table

Each row of the Required storage controls table in [IMMUTABLE_STORAGE_DECISION.md](IMMUTABLE_STORAGE_DECISION.md) is mapped to its real current state. Most rows are not satisfied.

| Control | Current state | Evidence and gap |
| --- | --- | --- |
| Region and replication | Not satisfied | The primary bucket is in `ca-central-1`, a Canadian region, and no replication rule exists, so no cross-border replication is configured. But no replica, backup, inventory, or source-processing location has been chosen or documented, so the row's full requirement is unmet. |
| Versioning | Not satisfied | Bucket Versioning reads Enabled and cannot be suspended while Object Lock is on. The second half of the row, retaining every provider version ID in a sidecar, has no implementation and no object to record. |
| Immutability | Not satisfied | Object Lock reads Enabled, so the bucket supports compliance-grade write-once retention. No retention period is approved, no default retention is set, no per-object retention has been applied, and no legal-hold procedure exists. |
| Access | Not satisfied | Block all public access reads On and Object Ownership reads Bucket owner enforced, so there is no public or ACL-based access. There is no dedicated service identity, no least-privilege read policy, no bucket policy, no limited break-glass role for administering retention, and no access audit logging. No IAM user, role, or access key was created by this provisioning step. |
| Encryption and audit | Not satisfied | Default encryption reads SSE-S3, which satisfies the explicit encryption-selection part of the row. Server access logging reads Disabled, no CloudTrail data events are configured for this bucket, and no retention or deletion-attempt log review process exists. |
| Lifecycle | Owner decision pending | No lifecycle, expiration, transition, or replica rule exists, so no rule currently bypasses anything. The row cannot be satisfied until an approved retention period exists to measure rules against, and until a multipart cleanup rule is decided. |
| Recovery | Not satisfied | No Canadian recovery copy exists, and no provider durability or recovery evidence has been documented or tested. |

## Standing limits

No object has been uploaded. No source is promoted, remote-verified, or production-eligible. Retention duration, budget ceiling, recovery-copy policy and the accountable operator remain owner decisions. Upload requires AWS credentials that this agent is not permitted to create or handle.

## Not done in this step

- No IAM user, role, access key, secret key, or session token was created, viewed, copied, or handled.
- No file was uploaded to the bucket.
- No Cross-Region Replication was enabled.
- No lifecycle rule was created.
- No account setting, billing setting, or existing bucket was changed.
- No default retention period was set, for the reason given above.
