# Alberta PLVI immutable-promotion preparation

[`data/alberta-plvi-immutable-promotion-preparation.json`](../data/alberta-plvi-immutable-promotion-preparation.json) binds two local artifacts, not one: the immutable source ZIP and the checksum-bound full repaired GeoPackage. Their deterministic sidecars retain the official OGL-Alberta provenance and the derived release's raw, repair-patch, and profile lineage.

The proposed destination is the existing Canadian bucket `witness-tree-raw-archive-ca-central-1` in `ca-central-1`. The proposed role is limited to upload, version read-back, multipart cleanup, and payload retention for the four exact payload/sidecar keys in the record. It has no delete, retention-bypass, bucket, or IAM permission.

`scripts/run-alberta-plvi-approved-promotion.sh` is dry-run by default. Its `--run` path is deliberately owner-local: it rechecks both local byte lengths and SHA-256 values before prompting for a six-digit MFA TOTP, assumes only `WitnessTreePlviArchivePromotionUploader`, uploads the two payloads and deterministic sidecars, reads each version and checksum back, then requires a `COMPLIANCE` retention read-back through `2033-08-12T00:00:00Z`. It must not be run until the exact approval below is received.

Suggested artifact-specific immutable-promotion approval:

> I approve, for this one operation only, MFA-gated upload and S3 Object Lock **COMPLIANCE** retention through `2033-08-12T00:00:00Z` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1` for (1) `PrimaryLandAndVegetationInventoryPLVI.zip`, 675,544,895 bytes, SHA-256 `017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3`, and (2) `alberta-plvi-full-repaired-closed-join.gpkg`, 899,551,232 bytes, SHA-256 `5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b`. I approve only the four deterministic payload/sidecar keys recorded in the preparation record and require version, byte-length, provider-checksum, and retention read-backs. This does not approve ingestion, public release, or production use.

Only after those remote read-backs are captured and independently checked, suggested owner source-ledger admission wording is:

> I approve recording the verified remote archive evidence for the named PLVI raw ZIP and named derived repair release in the source ledger, with their stated OGL-Alberta attribution and lineage. This admission is archival provenance only; it does not approve any further transformation, ingestion, analytical use, public release, or production decision.
