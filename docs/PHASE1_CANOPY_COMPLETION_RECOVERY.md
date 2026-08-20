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
retention baseline. The retention baseline must allow
's3:GetObjectRetention' and 's3:PutObjectRetention' on both exact payload
resources (primary and recovery). The separately authorized recovery-only
retention statement is bound by
'data/phase1-canopy-recovery-retention-iam-delta.json'.

The owner/root provisioner is dry-run by default:

~~~sh
node scripts/provision-phase1-canopy-recovery-iam.mjs \
  --profile default \
  --attestation /private/tmp/witness-tree-canopy-recovery-iam-attestation.json
~~~

It requires the exact account root identity, reads only role
'WitnessTreeArchivePromotionUploader' and inline policy
'ExactApprovedPromotionOnly', proves the change is one appended statement
without changing or reordering any existing statement, validates the policy,
runs Access Analyzer and exact allow/deny simulations, and writes a redacted
owner-owned mode-600 planned attestation. Only when every check passes may the
same command be run with '--apply'. The apply path re-reads the policy to catch
a race, writes only the exact candidate, requires a canonical policy SHA
readback, and replaces the planned attestation with an applied attestation.

As of the latest live root dry run, the prerequisite
'CanopyVersionedRecoveryReadback' statement is absent. Therefore the dry run
fails before the recovery-retention delta, no IAM mutation occurs, and no
applied attestation or recovery command is currently valid. The narrowly
scoped recovery-retention authorization does not authorize adding the missing
versioned-read statement.

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
> The existing 'CanopyVersionedRecoveryReadback' statement must already allow
> only 's3:GetObjectVersion' on those four exact resources with its existing
> MFA conditions and must remain unchanged. The only permitted IAM change is
> the exact 'CanopyRecoveryPayloadRetentionOnly' statement from
> 'data/phase1-canopy-recovery-retention-iam-delta.json', adding only
> 's3:GetObjectRetention' and 's3:PutObjectRetention' on the one exact recovery
> payload resource. No IAM read permission is added to the promotion operator.
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

The owner approval file, private 155-part state, and applied IAM attestation
consumed by the runner must each be owner-owned mode 600
and must contain the exact fields and values checked by
'check-phase1-canopy-completion-recovery.mjs'; no private upload or object
version identifiers belong in this document or in Git.

The runner validates the root-generated applied attestation locally and never
calls IAM with the promotion operator. Only after all three local files pass
does it request MFA. Before either retention write it reads all four exact
objects with checksum mode, resolves every concrete version through an exact
versioned head, validates exact bytes and FULL_OBJECT CRC64NVME checksums, and
reads retention on both exact payload versions. It then writes only absent
payload retention, reads both retentions back, and re-reads all four exact
versions.

## Conditional owner command

After the owner has recorded the approval file and provisioned the exact IAM
delta plus the exact recovery-payload retention capability, run preflight
first:

~~~sh
cd /path/to/authoritative-phase1-checkout
zsh scripts/run-phase1-canopy-completion-recovery.sh --preflight \
  /private/tmp/witness-tree-canopy-recovery-approval-20260820.json \
  /private/tmp/witness-tree-canopy-resume-155-20260820.json \
  /private/tmp/witness-tree-canopy-recovery-iam-attestation.json
~~~

Only if that preflight passes, the owner may run the interactive recovery:

~~~sh
cd /path/to/authoritative-phase1-checkout
zsh scripts/run-phase1-canopy-completion-recovery.sh --recover-canopy \
  /private/tmp/witness-tree-canopy-recovery-approval-20260820.json \
  /private/tmp/witness-tree-canopy-resume-155-20260820.json \
  /private/tmp/witness-tree-canopy-recovery-iam-attestation.json
~~~

These commands remain conditional and currently stop before TOTP because no
applied attestation can be produced while the required versioned-read
statement is absent.
