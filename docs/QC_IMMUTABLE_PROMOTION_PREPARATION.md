# Québec immutable-promotion preparation

This preparation binds exactly two already verified physical raw archives: the 12,399,475,076-byte `CARTE_ECO_MAJ_PROV_GPKG.zip` current ecoforest map and the 11,244,667,626-byte `CARTE_ECO_ORI_PROV_GPKG.zip` original/current-inventory archive. It excludes the Québec fourth-inventory archive, all extracted GeoPackages, publisher-footprint derivatives, and every other source.

Both archives exceed S3's 5 GB single-PUT limit. The owner-local runner therefore uses reviewed 128 MiB low-level multipart parts, sequentially. It derives a SHA-256 for every local part, requires the provider to return that checksum for each part, recomputes the provider-compatible composite SHA-256, and refuses completion unless the final object read-back has the expected byte length and composite checksum. It never uses `aws s3 cp`, a high-level transfer wrapper, deletion, retention bypass, legal-hold changes, replication, bucket administration, or IAM mutation.

The production-source labels contain the word “current”, but that is a product description—not a safe immutable identity. The append-only keys use `qc-ecoforest-map` and `qc-original-inventory`, plus the literal `undeclared` publisher-version marker. Neither key contains `current` or `latest`; each is derived from a retrieved instant and the raw SHA-256.

`scripts/run-qc-approved-multipart-promotion.sh` is a no-AWS dry run by default. Its `--preflight` path recalculates the exact byte length and SHA-256 of both controlled workspace-data artifacts before prompting for TOTP or making any AWS call. Its `--run` path requires an interactive terminal, reads a non-stored six-digit TOTP, reads only `mfa_serial` from the local `WitnessTreeArchiveOperator` profile, requires the exact virtual-MFA ARN for that operator, receives a one-hour MFA session, and assumes only `WitnessTreeQcArchivePromotionUploader`.

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
