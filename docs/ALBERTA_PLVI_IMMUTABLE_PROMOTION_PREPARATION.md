# Alberta PLVI immutable-promotion preparation

[`data/alberta-plvi-immutable-promotion-preparation.json`](../data/alberta-plvi-immutable-promotion-preparation.json) binds two local artifacts, not one: the immutable source ZIP and the checksum-bound full repaired GeoPackage. Their deterministic sidecars retain the official OGL-Alberta provenance and the derived release's raw, repair-patch, and profile lineage.

The proposed destination is the existing Canadian bucket `witness-tree-raw-archive-ca-central-1` in `ca-central-1`. The proposed role is limited to upload, version read-back, multipart cleanup, and payload retention for the four exact payload/sidecar keys in the record. It has no delete, retention-bypass, bucket, or IAM permission.

The reviewed IAM definitions are versioned in [`infra/aws`](../infra/aws): the trust policy names only `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` and requires an MFA session; the role policy permits the four canonical keys, limits retention to the two payload keys, and explicitly denies deletion, legal hold, retention bypass, replication, bucket administration, and IAM actions. The separate managed operator policy grants only MFA-gated assumption of this role. These files are a reviewed desired state, not evidence that AWS has accepted or applied it.

`scripts/run-alberta-plvi-approved-promotion.sh` is dry-run by default. Its `--run` path is deliberately owner-local: it rechecks both local byte lengths and SHA-256 values before prompting for a six-digit MFA TOTP, assumes only `WitnessTreePlviArchivePromotionUploader`, uploads the two payloads and deterministic sidecars, reads each version and checksum back, then requires a `COMPLIANCE` retention read-back through `2033-08-12T00:00:00Z`. It must not be run until the exact approval below is received.

The runner resolves its artifacts from the controlled absolute workspace-data root `/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data`, not from the temporary promotion worktree. Run `zsh scripts/run-alberta-plvi-approved-promotion.sh --preflight` first: it finds both files and verifies their exact byte lengths and SHA-256 values, then exits before any TOTP prompt or AWS call.

The owner-local `--run` path requires an interactive terminal and uses zsh's hidden `read -s` prompt. It prints a newline after input, does not echo or store the code, and rejects an empty or non-six-digit value before any AWS command.

The runner never calls IAM to discover an MFA device. It reads `mfa_serial` only from the local `WitnessTreeArchiveOperator` AWS profile, requires the exact virtual-MFA ARN for account `286853118812` and that operator, and otherwise stops before any STS or storage command. The ARN is never printed.

Suggested artifact-specific immutable-promotion approval:

> I approve, for this one operation only, MFA-gated upload and S3 Object Lock **COMPLIANCE** retention through `2033-08-12T00:00:00Z` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1` for (1) `PrimaryLandAndVegetationInventoryPLVI.zip`, 675,544,895 bytes, SHA-256 `017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3`, and (2) `alberta-plvi-full-repaired-closed-join.gpkg`, 899,551,232 bytes, SHA-256 `5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b`. I approve only the four deterministic payload/sidecar keys recorded in the preparation record and require version, byte-length, provider-checksum, and retention read-backs. This does not approve ingestion, public release, or production use.

Only after those remote read-backs are captured and independently checked, suggested owner source-ledger admission wording is:

> I approve recording the verified remote archive evidence for the named PLVI raw ZIP and named derived repair release in the source ledger, with their stated OGL-Alberta attribution and lineage. This admission is archival provenance only; it does not approve any further transformation, ingestion, analytical use, public release, or production decision.
