# Current-wildfire derived readback IAM preflight

This is a read-only IAM audit and desired-state package for the exact BC
216-feature and Ontario 188-feature derived readback runner. It does not apply
IAM, call S3, complete an MPU, upload, write retention, or admit either source
to production.

The machine-checked desired state is
[`data/wildfire-derived-readback-iam-desired-state.json`](../data/wildfire-derived-readback-iam-desired-state.json),
and its offline checker is
[`scripts/check-wildfire-derived-readback-iam.mjs`](../scripts/check-wildfire-derived-readback-iam.mjs).

Run the local desired-state preflight with:

~~~sh
npm run check:wildfire-derived-readback-iam
~~~

It must print only a generic desired-state pass and explicitly state that live
IAM is not claimed. A separately prepared, redacted live snapshot can be
checked without credentials or AWS calls:

~~~sh
node scripts/check-wildfire-derived-readback-iam.mjs \
  --live /private/tmp/witness-tree-wildfire-derived-readback-iam-live.json
~~~

The live audit on 2026-08-21 used the configured `default` and
`WitnessTreeArchiveOperator` profiles; both resolved to account `286853118812`.
The role `WitnessTreeWildfireDerivedPromotionUploader` exists with no attached
role policies and one inline policy, `WitnessTreeWildfireDerivedExactObjects`.
Its trust policy allows only the operator user when
`aws:MultiFactorAuthPresent` is true. The inline policy allows `s3:PutObject`
and `s3:GetObject` on the four exact derived payload/sidecar resources,
`s3:GetObjectVersion` on those same four resources, and
`s3:PutObjectRetention` plus `s3:GetObjectRetention` on the two exact payload
resources. The exact versioned `HeadObject` permission is already present.

The operator has an attached policy named
`WitnessTreeWildfireDerivedPromotionAssumeOnly` whose only statement allows
`sts:AssumeRole` on this exact role. The role trust policy, rather than a
broader operator statement, enforces MFA for the role session. No live IAM
change was made.

The canonical minimal delta, when absent, is one statement preserving every
existing policy byte, statement order, and promotion capability:

~~~json
{
  "Sid": "ExactDerivedVersionedReadbacks",
  "Effect": "Allow",
  "Action": ["s3:GetObjectVersion"],
  "Resource": "the four exact derived payload and manifest ARNs in the machine record"
}
~~~

The existing payload-only `s3:GetObjectRetention` permission is already exact.
The runner never invokes the existing `PutObject` or `PutObjectRetention`
permissions. Removing those pre-existing promotion permissions would be a
separate, materially different authorization and is not included here. A
strictly read-only role would need a separately approved role rather than a
silent rewrite of this promotion role.

## Copy-paste owner authorization

> I authorize, in AWS account `286853118812`, only the owner-reviewed
> readback capability required by the repository's
> `data/wildfire-derived-readback-iam-desired-state.json` record for role
> `WitnessTreeWildfireDerivedPromotionUploader` in `ca-central-1`.
>
> Preserve the existing MFA-gated trust for
> `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` and preserve the
> existing operator policy
> `WitnessTreeWildfireDerivedPromotionAssumeOnly`, whose only permitted
> resource is the exact derived promotion role. Preserve every existing role
> policy statement and byte.
>
> The only permitted IAM delta is one exact statement with Sid
> `ExactDerivedVersionedReadbacks`, Effect `Allow`, and only
> `s3:GetObjectVersion` on the four exact BC/Ontario derived payload and
> `manifest.json` resources recorded in the machine-checked desired-state
> file. The existing `s3:GetObjectRetention` permission must remain restricted
> to the two exact payload resources. No wildcard action, wildcard resource,
> other bucket, other key, other role, IAM permission, delete, legal hold,
> governance bypass, replication, MPU, upload, or retention-write permission
> may be added.
>
> This approval authorizes no S3 operation. The owner-local runner remains
> readback-only: it may assume the exact role after MFA and perform only the
> four exact latest/versioned heads and two exact payload retention reads. It
> must stop before any storage operation if the role trust, operator path,
> policy statement, resource, checksum, version, or retention precondition is
> not exact. It may not complete, list, upload, rewrite a sidecar, write
> retention, delete, use a legal hold or bypass, infer production, or start
> Phase 2.

The live role passes the versioned-readback preflight because the required
statement is already present exactly. The earlier dry-run failure came from a
local bug: the already-present branch removed the required statement and then
compared that reduced list to the full live list. The corrected comparison
excludes the required Sid from both lists before checking that every other
statement remains byte-equivalent and in order. No IAM mutation was performed
or needed. The owner-local interactive S3 readback still requires a current
MFA TOTP and remains the next evidence step.

## Owner-local additive provisioner

There was no derived-readback IAM provisioner on the authoritative Phase 1
head. The repository now includes a dry-run-default, root-only provisioner:

~~~sh
node scripts/provision-wildfire-derived-readback-iam.mjs \
  --profile default \
  --attestation /private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json
~~~

The provisioner reads the exact account, role, MFA trust, and inline policy
`WitnessTreeWildfireDerivedExactObjects`; it accepts the exact
`ExactDerivedVersionedReadbacks` statement when already present or proposes
only that statement when absent. It
preserves all existing statement order and content, refuses the operator
profile, does not grant or require operator IAM-read permission, and writes a
mode-600 redacted owner attestation. Access Analyzer and exact allow/deny
simulations are recorded when available. An unavailable analyzer or
simulation is tolerated for dry-run planning but refuses `--apply`; the
pre-apply policy/trust re-read must also match the original SHA, and an apply
must read the inline policy back to the exact desired SHA.

After a separately reviewed owner authorization and a successful dry-run, the
conditional command is:

~~~sh
node scripts/provision-wildfire-derived-readback-iam.mjs \
  --profile default \
  --attestation /private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json \
  --apply
~~~

That command was not run in this audit. Authorization for it is limited to
AWS account `286853118812`, role
`WitnessTreeWildfireDerivedPromotionUploader`, and inline policy
`WitnessTreeWildfireDerivedExactObjects`. It may add only one exact
`s3:GetObjectVersion` statement on the four recorded BC/Ontario payload and
manifest ARNs. It may not change trust, the operator AssumeRole policy,
existing promotion or payload-retention statements, or add any IAM/S3
write, delete, legal-hold, governance-bypass, MPU, upload, TOTP, production,
or Phase 2 capability.

### Copy-paste authorization for the optional IAM apply

> I authorize the owner/root-local provisioner to run only in AWS account
> `286853118812` with the exact root identity, and only against role
> `WitnessTreeWildfireDerivedPromotionUploader` and inline policy
> `WitnessTreeWildfireDerivedExactObjects` in `ca-central-1`.
>
> The provisioner must first complete its dry-run and write the mode-600
> redacted attestation. If and only if that plan is reviewed, the live caller
> and MFA-gated trust are exact, the current policy is re-read unchanged, the
> Access Analyzer result has zero findings, and every exact allow/deny
> simulation passes, it may add one statement only:
> `Sid=ExactDerivedVersionedReadbacks`, `Effect=Allow`,
> `Action=s3:GetObjectVersion`, with the four exact payload/manifest
> resources in `data/wildfire-derived-readback-iam-desired-state.json`.
> It must read the policy back and require the exact desired SHA before
> recording an applied attestation.
>
> Preserve every existing role-policy statement and the operator's exact
> AssumeRole policy. Do not grant operator IAM-read permission. Exclude all
> other IAM changes, uploads, MPU completion or abort, S3 writes, retention
> writes, deletes, legal holds, governance bypass, TOTP requests, production
> admission, email, push, and Phase 2.
