# Phase 1 national canopy post-completion recovery

This package is an owner-local, fail-closed recovery path for the already
completed national canopy promotion. It does not complete an MPU, upload or
rewrite an object, delete an object, change IAM, bypass governance retention,
or use a legal hold. It is not source admission and does not make a production
or Phase 2 claim.

The current redacted operational record is
[`data/phase1-national-archive-finalization-audit.json`](../data/phase1-national-archive-finalization-audit.json).
It records the completed 155-part MPU. The later redacted evidence record
[`data/nrcan-canopy-height-remote-archive-evidence.json`](../data/nrcan-canopy-height-remote-archive-evidence.json)
now proves exact-version primary/recovery bytes, matching `FULL_OBJECT`
CRC64NVME checksums, and COMPLIANCE retention through `2033-08-12T00:00:00Z`.
This grants raw archive evidence only; production eligibility remains false.

The exact approved scope is account '286853118812', role
'WitnessTreeArchivePromotionUploader', operator profile
'WitnessTreeArchiveOperator', and region 'ca-central-1'.

## IAM delta to provision out of band

The machine-checked desired delta is
'data/phase1-canopy-completion-recovery-iam-delta.json'. It retains one exact
allow statement:

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
  ]
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
'ExactApprovedPromotionOnly', proves both proposed changes are sequential
single-statement appends without changing or reordering any existing
statement, validates the final policy, runs Access Analyzer and exact
allow/deny simulations, and writes a redacted owner-owned mode-600 planned
attestation. Only when every check passes may the same command be run with
'--apply'. The apply path re-reads the policy to catch a race, appends and
reads back 'CanopyVersionedRecoveryReadback', re-checks for another race,
appends 'CanopyRecoveryPayloadRetentionOnly', and requires the final canonical
policy SHA readback before replacing the planned attestation with an applied
attestation.

The authorized apply and recovery completed. The applied attestation and
private version-reference state are owner-owned mode 600. Independent read-only
verification confirmed all four exact versions and both payload retentions.
No multipart completion, upload, sidecar rewrite, delete, governance bypass,
or legal-hold operation was part of the recovery.

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

The preflight command now passes without TOTP or AWS calls. The recovery
command is ready for the owner to run interactively; it must still stop if any
fresh exact head, version, checksum, or retention read differs.
