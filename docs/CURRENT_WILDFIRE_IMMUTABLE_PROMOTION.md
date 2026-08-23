# Current-wildfire immutable promotion

This is an owner-local, dry-run-by-default preparation for the four raw current-wildfire snapshots already identified in [`data/current-wildfire-immutable-promotion-preparation.json`](../data/current-wildfire-immutable-promotion-preparation.json). It is not authorization to run AWS, create IAM, archive a different object, transform data, clear the BC or Ontario geometry blocks, ingest, release, admit, or make a source eligible.

The canonical raw archive record is a placeholder-only attestation for these
four snapshots and sidecars. It proves no concrete version, provider checksum,
exact-version readback, retention, or recovery state. This preparation remains
a bounded owner-local command package and grants no credit.

## Exact approval wording

> I approve, for this one operation only, MFA-gated direct `s3:PutObject` upload and payload-version `s3:PutObjectRetention` in `witness-tree-raw-archive-ca-central-1` / `ca-central-1` for exactly the four raw current-wildfire payloads and four deterministic `manifest.json` sidecars below. Apply COMPLIANCE retention to each payload version through `2033-08-12T00:00:00Z`. Require returned version ID and CRC64NVME acknowledgement, payload version/byte-length/FULL_OBJECT CRC64NVME read-back, payload retention read-back, and sidecar version/FULL_OBJECT CRC64NVME read-back. This does not approve transformation, geometry admission, ingestion, release, production admission, production eligibility, deletion, legal holds, retention bypass, replication, bucket administration, wildcard access, or any other key.

That wording records the earlier archive-operation boundary. A later [owner scope decision](CURRENT_WILDFIRE_OWNER_ADMISSION.md) approves conditional geometry and operational semantics. This preparation does not prove archive, transformation, ingestion, release or production admission. The canonical redacted records are placeholder-only attestations and leave the six-object gate at 0/6 machine-verifiable.

> I authorize creation or update of only `WitnessTreeCurrentWildfirePromotionUploader`, trusted only by MFA-authenticated `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator`, and only an identity policy granting that user `sts:AssumeRole` on this role. The role may allow only `s3:PutObject`, `s3:GetObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts`, `s3:PutObjectRetention`, and `s3:GetObjectRetention` on the eight exact keys in `data/current-wildfire-immutable-promotion-preparation.json`; it has no delete, legal-hold, bypass, replication, bucket, wildcard, other-key, or `iam:*` permission.

### Pending additional IAM authorization

The historical wording above is preserved verbatim and omitted `s3:GetObjectVersion`. A `HeadObject` request that supplies a version ID needs that version-specific permission. The new record `data/current-wildfire-get-object-version-owner-approval.json` is deliberately `pending-owner-approval`; it is not retroactive approval. Before execution, the owner must separately approve `s3:GetObjectVersion` on the eight exact keys and bind that approval to an exact live-IAM attestation with zero findings and exact positive/negative simulations. The runner rejects the repository placeholder before MFA or storage.

| Snapshot | Exact payload (and manifest at the same prefix) | Bytes / SHA-256 |
| --- | --- | --- |
| CWFIS active fires | `raw/cwfis-current/undeclared/2026-08-14T20-24-34Z/fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86/payload/cwfif_national_activefires_2026-08-14t202242z.zip` | 45,917 / `fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86` |
| BC fire perimeters | `raw/bc-wildfire/undeclared/2026-08-14T20-31-39Z/46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83/payload/bc-wildfire-fire-perimeters_2026-08-14.geojson` | 4,813,292 / `46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83` |
| Alberta fire locations | `raw/ab-wildfire/undeclared/2026-08-14T13-42-09Z/f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0/payload/alberta-wildfire-locations_2026-08-14.geojson` | 423,853 / `f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0` |
| Ontario in-year perimeters | `raw/on-fire-disturbance/undeclared/2026-08-14T13-49-36Z/99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11/payload/ontario-in-year-fire-perimeters_2026-08-14.geojson` | 19,510,504 / `99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11` |

Each table payload authorizes exactly one companion key obtained by replacing `/payload/<filename>` with `/manifest.json`; no other key is in scope.

## Owner commands

Run the no-cloud preflight first:

```sh
scripts/run-current-wildfire-approved-promotion.sh --preflight
```

Only after the two approvals above and role provisioning, run the MFA-gated promotion:

```sh
scripts/run-current-wildfire-approved-promotion.sh --run \
  /absolute/owner-only-checkpoint.json \
  /absolute/owner-only-private-attestation.json \
  /absolute/owner-only-redacted-attestation.json
```

The runner uses direct conditional `PutObject` (`If-None-Match: *`) because every payload is below 5 GB, and every readback supplies the exact returned version ID. Before each write or retention mutation it durably records a mode-600 checkpoint boundary. If the provider response is lost or rejected, the checkpoint becomes `owner-review-required`; a retry is blocked so an ambiguous second version is not created. Automatic rerun is allowed only before an owner identity session is recorded. Any interruption after that point requires owner review and reconciliation before a new session, even when the last recorded object boundary completed cleanly.

After all eight exact objects and four payload retentions verify, the runner transactionally publishes two new mode-600 files: a private attestation containing the exact operator/role and S3 JSON responses, and a redacted attestation containing only digest cross-links. If the second publication races or fails, the first is rolled back when ownership can be proved; otherwise the runner reports an inspection-required state rather than claiming atomicity.

The private/redacted pair is owner-attested, internally consistent evidence, not independently signed AWS proof. It does not update the canonical repository record automatically. The recovery-replica contract requires a distinct recovery bucket, concrete recovery version IDs, exact byte lengths, FULL_OBJECT CRC64NVME responses, primary/recovery digest equality, `REPLICA` status, and payload retention readback. This runner neither authorizes nor performs those external recovery calls, so recovery remains explicitly unproved. No transformation, ingestion, release, or production eligibility follows from a passing pair.
