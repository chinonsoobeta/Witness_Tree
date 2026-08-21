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
`aws:MultiFactorAuthPresent` is true. The inline policy currently allows
`s3:PutObject` and `s3:GetObject` on the four exact derived payload/sidecar
resources, and `s3:PutObjectRetention` plus `s3:GetObjectRetention` on the two
exact payload resources. It is missing `s3:GetObjectVersion`, so the runner's
exact versioned `HeadObject` readback remains blocked.

The operator has an attached policy named
`WitnessTreeWildfireDerivedPromotionAssumeOnly` whose only statement allows
`sts:AssumeRole` on this exact role. The role trust policy, rather than a
broader operator statement, enforces MFA for the role session. No live IAM
change was made.

The minimal delta is one appended statement, preserving every existing policy
byte and existing promotion capability:

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

The live role currently fails the versioned-readback preflight because the
required statement is absent. Until an owner separately provisions and
read-backs that exact delta, the safe command is the offline desired-state
check only; the interactive S3 readback command remains blocked.
