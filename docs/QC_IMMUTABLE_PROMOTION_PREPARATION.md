# Québec immutable-promotion preparation

This preparation binds exactly two already verified physical raw archives: the 12,399,475,076-byte `CARTE_ECO_MAJ_PROV_GPKG.zip` current ecoforest map and the 11,244,667,626-byte `CARTE_ECO_ORI_PROV_GPKG.zip` original/current-inventory archive. It excludes the Québec fourth-inventory archive, all extracted GeoPackages, publisher-footprint derivatives, and every other source.

**Current status:** both exact payloads and their manifests are complete, exact-version verified, and retained in COMPLIANCE mode through `2033-08-12T00:00:00Z`. The audited redacted attestation is integrated at [`data/qc-immutable-promotion-attestation.json`](../data/qc-immutable-promotion-attestation.json); its mode-600 private pair remains outside Git. Do not repeat the upload or attestation capture. This is immutable source evidence only and grants no transformation, ingestion, release, production admission, or eligibility.

Both archives exceed S3's 5 GB single-PUT limit. The completed owner-local run therefore used reviewed 128 MiB low-level multipart parts sequentially. It derived a SHA-256 for every local part, required the provider to return that checksum for each part, recomputed the provider-compatible composite SHA-256, and refused completion unless the final object read-back had the expected byte length and composite checksum. It did not use `aws s3 cp`, a high-level transfer wrapper, deletion, retention bypass, legal-hold changes, replication, bucket administration, or IAM mutation.

The production-source labels contain the word “current”, but that is a product description—not a safe immutable identity. The append-only keys use `qc-ecoforest-map` and `qc-original-inventory`, plus the literal `undeclared` publisher-version marker. Neither key contains `current` or `latest`; each is derived from a retrieved instant and the raw SHA-256.

The reviewed owner-local runner recalculates the exact byte length and SHA-256 before its historical MFA-gated execution path. That completed path required an interactive terminal, a non-stored six-digit TOTP, the account-scoped configured MFA serial, the exact `WitnessTreeArchiveOperator` principal, and only `WitnessTreeQcArchivePromotionUploader`. This description preserves the control design; it is not a current execution instruction.

Historical resumption was intentionally fail-closed. A persistent mode-700 state directory recorded each exact artifact’s intended key, digest, part size, multipart UploadId, accepted payload version, and sidecar version—but never AWS credentials or the TOTP. Existing provider parts had to match their exact expected byte length and part SHA-256 before reuse. Indeterminate initiation could not start a second upload, and the runner did not automatically abort or delete anything.

The historical exact approval text follows for audit provenance. It was later approved and consumed; it is not a current request.

> I approve, for this one operation only, MFA-gated sequential low-level multipart upload and S3 Object Lock **COMPLIANCE** retention through `2033-08-12T00:00:00Z` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1` for: (1) `CARTE_ECO_MAJ_PROV_GPKG.zip`, 12,399,475,076 bytes, SHA-256 `c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1`; and (2) `CARTE_ECO_ORI_PROV_GPKG.zip`, 11,244,667,626 bytes, SHA-256 `c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61`. I approve only these four append-only keys and their deterministic sidecars as recorded in `data/qc-immutable-promotion-preparation.json`. I require, for each object version, key, version ID, byte length, and provider checksum read-back, and for the two payload versions a COMPLIANCE retention read-back through the stated instant. This excludes the fourth inventory, transformations, extraction, ingestion, analysis, public release, production use, deletion, legal-hold changes, retention bypass, replication, bucket administration, and all other keys.

The historical separate IAM approval follows for audit provenance. It was later approved and provisioned.

> In AWS account `286853118812`, I authorize creation or update of only the MFA-assumable role `WitnessTreeQcArchivePromotionUploader`, trusted only by `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` when MFA is present. I authorize an operator policy allowing only MFA-gated `sts:AssumeRole` to that role. The role may allow only `s3:PutObject`, `s3:GetObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`, `s3:PutObjectRetention`, and `s3:GetObjectRetention`, restricted to exactly the four keys recorded in `data/qc-immutable-promotion-preparation.json` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1`; retention actions are restricted to the two payload keys. It has no delete, legal-hold, retention-bypass, replication, bucket-administration, wildcard-object, other-key, other-bucket, or IAM permission.

Both approvals, provisioning, execution, and evidence capture are complete. The historical commands are deliberately omitted so this preparation cannot be mistaken for a renewed upload instruction.

Completion is archival evidence only. The Québec source-ledger decisions are already recorded as accepted named immutable source-ledger evidence only; only downstream transformation, ingestion, release, and production decisions remain. It does not grant transformation, analysis, ingestion, public release, production admission, or production eligibility.

## Historical IAM recovery audit

The root-side read-only audit on 2026-08-21 found that `WitnessTreeQcArchivePromotionUploader` does not exist and no dedicated Québec AssumeRole policy exists for `WitnessTreeArchiveOperator`. No similarly named role or local policy exists. The operator's failed `AssumeRole` attempt therefore could not reach S3, and no storage mutation occurred.

The IAM approval recorded before this recovery audit was incomplete for this runner. It enumerated six S3 actions, but the runner performs mandatory `HeadObject --version-id` verification for payloads and sidecars. AWS authorizes that operation with `s3:GetObjectVersion`. Creating the role with only the original six approved actions would have permitted uploads and then failed during required version-specific verification.

The fail-closed exact desired state is [`qc-immutable-promotion-iam-desired-state.json`](../data/qc-immutable-promotion-iam-desired-state.json). It narrows multipart actions to the two payload keys, retention actions to the same two payload keys, and versioned readback to the four exact payload/manifest keys. It contains no wildcard resource, IAM-read permission, delete, legal hold, bypass, replication, bucket administration, other role, or other object.

## Completed evidence handoff

The separate owner-local, read-only capture completed. The first output remains owner-owned mode 600 outside Git. It contains the four concrete version identifiers and provider checksums, exact-version `HeadObject` evidence, and the two payload retention readbacks, while deliberately omitting multipart upload identifiers. The integrated second output contains hashes of the private receipt, versions, checksums, keys, and raw readback responses, but no concrete version, checksum, or upload identifier. Full verification remains available only to the local reviewer using the private pair:

```sh
node scripts/check-qc-immutable-promotion-attestation.mjs --pair \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation.json \
  /private/tmp/witness-tree-qc-immutable-promotion-attestation-redacted.json
```

The repository's current [`qc-immutable-promotion-attestation.json`](../data/qc-immutable-promotion-attestation.json) is the validated redacted half of the captured pair. Its schema rejects undeclared fields, including concrete upload, version, or provider-checksum fields. Full verification requires the exact mode-600 digest-bound private half; booleans, placeholder values, or plausible substitute identifiers cannot pass the pair checker.

The passing pair is owner-attested, internally consistent evidence produced by the reviewed owner-local capture path. It is not an independently signed AWS receipt and must not be described as provider-signed proof. The digest proves that the reviewed private and redacted records are the same pair; it does not create an independent provider signature. This operation did not authorize or prove a recovery replica: the preserved multipart state is recovery/resume evidence only. Transformation, ingestion, release, production admission, and production eligibility remain separate and false.

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

The historical no-TOTP local artifact preflight and IAM readiness checks passed before execution. The later completed run and captured pair now supply the bounded payload-version, retention, and archive evidence described above. They supply no admission, eligibility, or production claim, and there is no remaining Québec current/original storage step.

## Historical interrupted multipart recovery boundary

During the completed recovery, the mode-700 state directory and mode-600 state files had to remain unchanged after an interruption. A `NoSuchUpload` response to the saved `ListParts` request meant only that the saved upload ID was no longer active for the exact bucket and key. It could result from completion elsewhere, an explicit abort, lifecycle cleanup, or an incorrect/stale identifier; the response alone did not distinguish those causes.

The recovery runner required the recorded sidecar version and classified `ListParts` before any sidecar write path. Only a single canonical `(NoSuchUpload)` classification could activate recovery; mixed `AccessDenied`, proxy, multiline, or otherwise ambiguous errors stopped without a storage write. Its bounded diagnostics never rendered raw stderr, bucket, key, upload ID, version, checksum, endpoint, request detail, or credentials. These controls are retained as historical implementation evidence and do not authorize another run or capture.

After unambiguous `NoSuchUpload`, the runner performs no replacement initiation or part upload. It recomputes the approved local multipart composite SHA-256, verifies the recorded sidecar version, reads only the current exact payload key, requires a concrete version ID plus exact bytes, `COMPOSITE` checksum type and matching checksum, then performs two exact-version heads to close a read race. Private state remains byte-for-byte unchanged until all three payload heads pass. Only then may it record the candidate and continue the already-approved retention/readback steps. The returned COMPLIANCE retention instant must normalize exactly to `2033-08-12T00:00:00Z`; a same-day but different time fails. A missing or mismatched exact-key object preserves the old upload ID and stops; it cannot distinguish abort from lifecycle cleanup and requires a separately reviewed recovery authorization before any new multipart upload. Neither a bare unversioned head nor `NoSuchUpload` alone is archive evidence.
