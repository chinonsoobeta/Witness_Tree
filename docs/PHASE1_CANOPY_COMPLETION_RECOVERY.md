# Phase 1 national canopy post-completion recovery

This package is an owner-local, fail-closed recovery path for the already
completed national canopy promotion. It does not complete an MPU, upload or
rewrite an object, delete an object, change IAM, bypass governance retention,
or use a legal hold. It is not source admission and does not make a production
or Phase 2 claim.

The current redacted operational record is
[`data/phase1-national-archive-finalization-audit.json`](../data/phase1-national-archive-finalization-audit.json).
It records the completed 155-part MPU and exact-byte `FULL_OBJECT` payload and
sidecar heads in primary and recovery, while retention and exact-version
readback remain blocked. This package does not change that record or grant
archive credit; the ledger remains 15/31 raw credit, 10 immutable rows, and
zero production-eligible rows until the required readbacks pass.

The exact approved scope is account '286853118812', role
'WitnessTreeArchivePromotionUploader', operator profile
'WitnessTreeArchiveOperator', and region 'ca-central-1'.

## IAM delta to provision out of band

The machine-checked desired delta is
'data/phase1-canopy-completion-recovery-iam-delta.json'. It adds one and only
one allow statement:

~~~json
{
  "Sid": "CanopyVersionedRecoveryReadback",
  "Effect": "Allow",
  "Action": ["s3:GetObjectVersion"],
  "Resource": [
    "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip",
    "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json",
    "arn:aws:s3:::witness-tree-raw-recovery-ca-central-1/raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip",
    "arn:aws:s3:::witness-tree-raw-recovery-ca-central-1/raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json"
  ],
  "Condition": {
    "Bool": {"aws:MultiFactorAuthPresent": "true"},
    "NumericLessThan": {"aws:MultiFactorAuthAge": "3600"}
  }
}
~~~

The checker rejects a versioned-read permission outside this statement,
wildcard S3 or IAM scope, forbidden mutation actions, and a missing exact
retention baseline. The retention baseline must already allow
's3:GetObjectRetention' and 's3:PutObjectRetention' on both exact payload
resources (primary and recovery); any existing unrelated approved scope is
preserved. The current live role evidence does not
meet either precondition: it lacks 's3:GetObjectVersion', and its existing
retention statement does not include the recovery payload. Therefore no owner
command is currently safe. The delta file intentionally does not broaden
retention permissions; an owner must provision an exact separately approved
recovery-retention scope or use an already-approved role whose live policy
passes the checker.

## Copy-paste authorization text

> I authorize the owner-local Phase 1 canopy post-completion recovery in AWS
> account '286853118812', using role
> 'WitnessTreeArchivePromotionUploader' from profile
> 'WitnessTreeArchiveOperator' in 'ca-central-1', only after the live role
> policy passes the repository checker and MFA is present.
>
> The exact object scope is the national canopy payload and its deterministic
> 'manifest.json' sidecar in primary bucket
> 'witness-tree-raw-archive-ca-central-1' and the matching objects in recovery
> bucket 'witness-tree-raw-recovery-ca-central-1', at the four exact resources
> in 'data/phase1-canopy-completion-recovery-iam-delta.json'.
>
> The only added IAM action authorized is 's3:GetObjectVersion' on those four
> resources, with 'aws:MultiFactorAuthPresent=true' and
> 'aws:MultiFactorAuthAge < 3600'. Existing exact retention capability must
> cover both payload resources; this package does not add retention scope.
>
> The approved recovery steps are: read the exact primary and recovery payload
> and sidecar heads with checksum mode enabled; use saved private version
> references when present or reconstruct them from those read-only heads; apply
> 'COMPLIANCE' retention through exactly '2033-08-12T00:00:00Z' only to the
> exact primary and recovery payload versions; read that retention back; and
> re-read all four exact versions to verify bytes and 'FULL_OBJECT' CRC64NVME
> checksums.
>
> This authorization expressly excludes MPU completion or listing, every
> upload, sidecar rewrite, delete, governance bypass, legal hold, IAM change,
> any other bucket/key/version, source admission, production inference, and
> Phase 2. The operation must stop before TOTP or storage mutation whenever
> any approval, private-state, IAM, head, checksum, version, or retention
> precondition fails.

The owner approval file consumed by the runner must be owner-owned mode 600
and must contain the exact fields and values checked by
'check-phase1-canopy-completion-recovery.mjs'; no private upload or object
version identifiers belong in this document or in Git.

## Conditional owner command

After the owner has recorded the approval file and provisioned the exact IAM
delta plus the exact recovery-payload retention capability, run preflight
first:

~~~sh
cd /path/to/authoritative-phase1-checkout
zsh scripts/run-phase1-canopy-completion-recovery.sh --preflight /absolute/path/to/approval.json /private/tmp/witness-tree-canopy-resume-155-20260820.json
~~~

Only if that preflight passes, the owner may run the interactive recovery:

~~~sh
cd /path/to/authoritative-phase1-checkout
zsh scripts/run-phase1-canopy-completion-recovery.sh --recover-canopy /absolute/path/to/approval.json /private/tmp/witness-tree-canopy-resume-155-20260820.json
~~~

These commands are conditional, not currently safe: the current live policy is
known to fail before TOTP. Repository code never provisions IAM and this task
does not run either command.
