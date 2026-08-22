# Québec immutable-promotion preparation

This preparation binds exactly two already verified physical raw archives: the 12,399,475,076-byte `CARTE_ECO_MAJ_PROV_GPKG.zip` current ecoforest map and the 11,244,667,626-byte `CARTE_ECO_ORI_PROV_GPKG.zip` original/current-inventory archive. It excludes the Québec fourth-inventory archive, all extracted GeoPackages, publisher-footprint derivatives, and every other source.

Both archives exceed S3's 5 GB single-PUT limit. The owner-local runner therefore uses reviewed 128 MiB low-level multipart parts, sequentially. It derives a SHA-256 for every local part, requires the provider to return that checksum for each part, recomputes the provider-compatible composite SHA-256, and refuses completion unless the final object read-back has the expected byte length and composite checksum. It never uses `aws s3 cp`, a high-level transfer wrapper, deletion, retention bypass, legal-hold changes, replication, bucket administration, or IAM mutation.

The production-source labels contain the word “current”, but that is a product description—not a safe immutable identity. The append-only keys use `qc-ecoforest-map` and `qc-original-inventory`, plus the literal `undeclared` publisher-version marker. Neither key contains `current` or `latest`; each is derived from a retrieved instant and the raw SHA-256.

`scripts/run-qc-approved-multipart-promotion.sh` is a no-AWS dry run by default. Its `--preflight` path recalculates the exact byte length and SHA-256 of both controlled workspace-data artifacts before prompting for TOTP or making any AWS call. Its `--run` path requires an interactive terminal, reads a non-stored six-digit TOTP, reads only `mfa_serial` from the local `WitnessTreeArchiveOperator` profile, accepts only a syntactically safe MFA ARN in account `286853118812`, receives a one-hour MFA session, pins that session to the exact `WitnessTreeArchiveOperator` principal, and assumes only `WitnessTreeQcArchivePromotionUploader`.

Resumption is intentionally fail-closed. A persistent mode-700 state directory records each exact artifact’s intended key, digest, part size, multipart UploadId, accepted payload version, and sidecar version—but never AWS credentials or the TOTP. Existing provider parts are listed and must have their exact expected byte length and part SHA-256 before they are reused. If initiation becomes indeterminate, the runner will not start a second upload; retain the state directory and obtain a read-only recovery audit. It does not automatically abort or delete anything.

Suggested exact approval follows. This is not approval by this document.

> I approve, for this one operation only, MFA-gated sequential low-level multipart upload and S3 Object Lock **COMPLIANCE** retention through `2033-08-12T00:00:00Z` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1` for: (1) `CARTE_ECO_MAJ_PROV_GPKG.zip`, 12,399,475,076 bytes, SHA-256 `c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1`; and (2) `CARTE_ECO_ORI_PROV_GPKG.zip`, 11,244,667,626 bytes, SHA-256 `c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61`. I approve only these four append-only keys and their deterministic sidecars as recorded in `data/qc-immutable-promotion-preparation.json`. I require, for each object version, key, version ID, byte length, and provider checksum read-back, and for the two payload versions a COMPLIANCE retention read-back through the stated instant. This excludes the fourth inventory, transformations, extraction, ingestion, analysis, public release, production use, deletion, legal-hold changes, retention bypass, replication, bucket administration, and all other keys.

Suggested separate IAM approval follows. It must be approved and provisioned separately from the artifact/retention approval.

> In AWS account `286853118812`, I authorize creation or update of only the MFA-assumable role `WitnessTreeQcArchivePromotionUploader`, trusted only by `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` when MFA is present. I authorize an operator policy allowing only MFA-gated `sts:AssumeRole` to that role. The role may allow only `s3:PutObject`, `s3:GetObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`, `s3:PutObjectRetention`, and `s3:GetObjectRetention`, restricted to exactly the four keys recorded in `data/qc-immutable-promotion-preparation.json` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1`; retention actions are restricted to the two payload keys. It has no delete, legal-hold, retention-bypass, replication, bucket-administration, wildcard-object, other-key, other-bucket, or IAM permission.

Only after both approvals and the role’s independent provisioning/read-only scope audit:

```zsh
zsh scripts/run-qc-approved-multipart-promotion.sh --preflight
zsh scripts/run-qc-approved-multipart-promotion.sh --run
```

Completion is archival evidence only. It does not grant transformation, analysis, ingestion, public release, production admission, or production eligibility. A separate owner decision is still required to record archival admission in the source ledger.

## Live IAM recovery audit

The root-side read-only audit on 2026-08-21 found that `WitnessTreeQcArchivePromotionUploader` does not exist and no dedicated Québec AssumeRole policy exists for `WitnessTreeArchiveOperator`. No similarly named role or local policy exists. The operator's failed `AssumeRole` attempt therefore could not reach S3, and no storage mutation occurred.

The IAM approval recorded before this recovery audit was incomplete for this runner. It enumerated six S3 actions, but the runner performs mandatory `HeadObject --version-id` verification for payloads and sidecars. AWS authorizes that operation with `s3:GetObjectVersion`. Creating the role with only the original six approved actions would have permitted uploads and then failed during required version-specific verification.

The fail-closed exact desired state is [`qc-immutable-promotion-iam-desired-state.json`](../data/qc-immutable-promotion-iam-desired-state.json). It narrows multipart actions to the two payload keys, retention actions to the same two payload keys, and versioned readback to the four exact payload/manifest keys. It contains no wildcard resource, IAM-read permission, delete, legal hold, bypass, replication, bucket administration, other role, or other object.

## Safe post-run evidence handoff

After the promotion runner finishes successfully, preserve its private state and run this separate owner-local, read-only capture with a fresh MFA session:

```sh
zsh scripts/capture-qc-immutable-promotion-attestation.sh --capture \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation.json \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation-redacted.json
```

The first output must remain owner-owned mode 600 outside Git. It contains the four concrete version identifiers and provider checksums, exact-version `HeadObject` evidence, and the two payload retention readbacks. It deliberately omits multipart upload identifiers. The second output contains hashes of the private receipt, versions, checksums, keys and raw readback responses, but no concrete version, checksum or upload identifier. Hand off the redacted output and the private file's SHA-256; provide the private mode-600 path only to the local reviewer running:

```sh
node scripts/check-qc-immutable-promotion-attestation.mjs --pair \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation.json \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation-redacted.json
```

The repository's current [`qc-immutable-promotion-attestation.json`](../data/qc-immutable-promotion-attestation.json) is intentionally pending. Its schema rejects undeclared fields, including concrete upload, version or provider-checksum fields. A redacted record, booleans, placeholder values, or plausible identifiers without the exact mode-600 digest-bound pair cannot pass the checker.

A passing pair is owner-attested, internally consistent evidence produced by the reviewed owner-local capture path. It is not an independently signed AWS receipt and must not be described as provider-signed proof. The digest proves that the reviewed private and redacted records are the same pair; it does not create an independent provider signature. Pair validation remains required before any canonical evidence change. This operation did not authorize or prove a recovery replica: the preserved multipart state is recovery/resume evidence only. Transformation, ingestion, release, production admission and production eligibility remain separate and false.

### Exact additional owner authorization — approved 2026-08-21

> In AWS account `286853118812`, I additionally authorize creation of only role `WitnessTreeQcArchivePromotionUploader`, inline policy `WitnessTreeQcArchiveExactObjects`, and dedicated operator policy `WitnessTreeQcArchivePromotionAssumeOnly`, exactly as recorded in `data/qc-immutable-promotion-iam-desired-state.json`.
>
> The role trust must allow only `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` to call `sts:AssumeRole` when `aws:MultiFactorAuthPresent` is true. The dedicated operator policy may allow only `sts:AssumeRole` on that exact role and may be attached only to `WitnessTreeArchiveOperator`. Preserve every existing operator policy, statement, order, version, and attachment.
>
> On each of these exact four object ARNs, the inline role policy may allow only `s3:PutObject`, `s3:GetObject`, and the separately authorized `s3:GetObjectVersion` because the approved runner requires version-specific payload and sidecar readbacks:
>
> - `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/payload/carte_eco_maj_prov_gpkg.zip`
> - `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/manifest.json`
> - `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/qc-original-inventory/undeclared/2026-08-14T15-15-58Z/c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61/payload/carte_eco_ori_prov_gpkg.zip`
> - `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/qc-original-inventory/undeclared/2026-08-14T15-15-58Z/c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61/manifest.json`
>
> Only on the two payload ARNs above, not the manifests, the inline role policy may additionally allow `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`, `s3:PutObjectRetention`, and `s3:GetObjectRetention`. No wildcard, IAM-read, `s3:DeleteObject`, `s3:DeleteObjectVersion`, legal-hold, bypass, replication, bucket permission, other role, other key, upload beyond the two approved artifacts, production, or Phase 2 permission is authorized.
>
> Provisioning must use the root/administrator profile, pass Access Analyzer with zero findings, simulate the exact allowed and denied cases, re-read trust and policies immediately before mutation, stop on a race, and read back the exact resulting documents and attachments. This authorizes IAM provisioning only, not an S3 operation. The owner-local runner still requires a fresh MFA TOTP after provisioning.

The owner approved the complete block above verbatim on 2026-08-21, and root-side provisioning completed. Independent normalized readback produced trust SHA-256 `d500f965cea406ab82e55f3985eee035ce07649977d474a399bd6b9fd42960da`, inline role-policy SHA-256 `a06181bb6034076dd0bb79731a1141e597293a7ad3e084cda5bd92995e7f7173`, and operator-policy SHA-256 `81947e11bcf89ae0679afd220ff6ab78e5bf49ddb8245fba0cb0587001791375`. The role has exactly inline policy `WitnessTreeQcArchiveExactObjects` and no attached policy; the dedicated operator policy is attached only to `WitnessTreeArchiveOperator`; normalized operator inline state is unchanged and its attached state differs only by that dedicated policy. Access Analyzer returned zero findings, and live simulations allow the exact role and seven exact payload actions while denying another role, unrelated objects, deletion, and IAM read.

The initial root apply harness exited after the authorized attachment because it compared pretty-printed readback JSON bytes with compact desired JSON bytes. That was a formatting-only harness defect, not policy drift or an incomplete apply. The canonical checker now hashes parsed, key-sorted JSON, and its regression test proves pretty and compact encodings compare equally. The normalized post-check passed all expected hashes and attachments.

The no-TOTP local artifact preflight also passes. IAM is ready, but no S3 call was made and no payload version, retention, archive-completion, admission, eligibility, or score claim exists. The next storage step remains owner-local and requires a fresh MFA TOTP.

## Interrupted multipart recovery boundary

The mode-700 state directory and mode-600 state files must be preserved unchanged after an interrupted run. A later `NoSuchUpload` response to the saved `ListParts` request means only that the saved upload ID is no longer active for the exact bucket and key. It can result from completion elsewhere, an explicit abort, lifecycle cleanup, or an incorrect/stale identifier; the response alone does not distinguish those causes, and multipart uploads do not otherwise prove an expiry here.

The owner reruns the same approved command with fresh MFA. For saved upload state, the runner requires the recorded sidecar version and classifies `ListParts` before any sidecar write path. It explicitly requests the AWS CLI's legacy single-line error format because newer CLI defaults add structured detail lines to the same provider error. Only a single canonical AWS `ListParts` error line with code `(NoSuchUpload)` activates recovery; mixed `AccessDenied`, proxy, multiline or otherwise ambiguous errors stop without a storage write. A stopped `ListParts` request reports only the sanitized stage and exact AWS error code, or `ambiguous`/`unavailable`; it never renders raw stderr, bucket, key, upload ID, version, checksum, or credentials. This diagnostic does not change recovery eligibility or saved state. Recovery never uploads or overwrites a sidecar.

After unambiguous `NoSuchUpload`, the runner performs no replacement initiation or part upload. It recomputes the approved local multipart composite SHA-256, verifies the recorded sidecar version, reads only the current exact payload key, requires a concrete version ID plus exact bytes, `COMPOSITE` checksum type and matching checksum, then performs two exact-version heads to close a read race. Private state remains byte-for-byte unchanged until all three payload heads pass. Only then may it record the candidate and continue the already-approved retention/readback steps. The returned COMPLIANCE retention instant must normalize exactly to `2033-08-12T00:00:00Z`; a same-day but different time fails. A missing or mismatched exact-key object preserves the old upload ID and stops; it cannot distinguish abort from lifecycle cleanup and requires a separately reviewed recovery authorization before any new multipart upload. Neither a bare unversioned head nor `NoSuchUpload` alone is archive evidence.
