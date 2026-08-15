# Québec fourth-inventory immutable-promotion preparation

## Status

This is a blocked preparation, not an AWS or IAM action. No object was uploaded,
no retention was applied, no IAM policy was created or attached, and no remote
object is claimed. The exact plan is
`data/qc-fourth-inventory-immutable-promotion-preparation.json`; its SHA-256 at
commit preparation is
`8cedb3551aa4c1c4bc1675b38175d8ace9dcfb44c7dd9629e81155280ec999ff`.

The target is pinned to bucket `witness-tree-raw-archive-ca-central-1` in
`ca-central-1`. Every object would receive `COMPLIANCE` retention at creation
through exactly `2033-08-12T00:00:00Z`. Compliance retention is irreversible
until that instant.

## Exact artifact set

The preparation contains exactly 62 object keys:

- 56 checksum-prefixed raw sheet ZIPs, totalling 16,177,306,782 bytes;
- the checksum-bound Données Québec metadata snapshot, official README,
  publisher download-index CSV, corrected-URL HEAD matrix, and exhaustive
  all-sheet profile; and
- one deterministic `collection-manifest.json` sidecar: 76,127 bytes, SHA-256
  `b3d85d1da40d68d79742c77ec418713f2ef968f74845c43e011df274d559616c`.

The collection manifest binds every sheet's exact original filename, byte
length, SHA-256, official URL, HTTP status, Content-Length, Last-Modified,
GeoPackage member byte length and ZIP CRC. It also binds collection digest
`394f05f984b164b7524e77b00fc73246a791d6c4112f7cc080c43fb3d8a2c0e0`,
profile SHA-256
`5450a1beade6f8dbbf73320a8751a3131bede150d95bb8847d9522b10ad985f9`,
publisher identity, edition, CC BY 4.0 terms, and required attribution. The
manifest and the five evidence objects are retained just like the raw payloads;
they are not mutable sidecars.

All object keys are append-only, checksum-scoped and enumerated in the plan.
There is no `latest` or `current` alias.

## Provincial map-only component

`CARTE_ECO_ORI_4_PROV_gpkg.zip` is deliberately excluded. The 56 official
sheet products are the complete named product and contain the original map plus
the inventory-result tables. The separate 8,096,656,664-byte provincial
archive contains only the map component, was not an input to the complete
all-sheet profile, and adds no raw input required to reproduce the canonical
row. Its exact SHA-256
`62f61998be33d1e3d2f23f6c77e90ca946a40bda0d5d86b00c976c339877d25b`
and official refetch URL remain in `data/qc-fourth-inventory-evidence.json`.
Archiving it would add a redundant 8.096 GB locked object and cost without
strengthening product reproducibility.

## Runner design

Safe dry run, which makes no AWS or IAM call:

```sh
node scripts/qc-fourth-inventory-immutable-promotion.mjs
```

The runner is pinned to the exact bucket, region, retention instant and 62-key
set. It performs a full local byte-length and SHA-256 preflight before obtaining
an MFA session or making the first S3 call. Objects at or below 512 MiB use
low-level `PutObject`; six larger sheets use low-level multipart uploads with
128 MiB parts. Multipart progress, part ETags and SHA-256 checksums are stored
in a caller-supplied controlled state directory. A rerun verifies `ListParts`
against that state and uploads only missing parts. Single-PUT objects resume at
the object boundary. The state file contains no credentials. The temporary MFA
session lasts one hour; if it expires, the run stops safely and a later run with
a fresh MFA code resumes from the saved exact-part or object boundary.

Object Lock is applied during `PutObject` or `CreateMultipartUpload`, so no
completed object has an unlocked interval. Each completed version is read back
by exact VersionId; byte length, full-object or locally recomputed composite
SHA-256, `COMPLIANCE` mode, and the exact retention instant must match. A
successful write without the complete read-back fails closed.

The runner has no S3 delete, abort-multipart, retention-bypass, legal-hold,
bucket-configuration, lifecycle, or replication operation. If execution fails,
completed retained versions and incomplete multipart uploads remain in place;
the runner resumes them and never rolls them back.

The low-level API shape follows AWS's current documentation for
[multipart upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html),
[upload checksums](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html),
[`CreateMultipartUpload`](https://docs.aws.amazon.com/cli/latest/reference/s3api/create-multipart-upload.html),
and [`CompleteMultipartUpload`](https://docs.aws.amazon.com/cli/latest/reference/s3api/complete-multipart-upload.html).

The intentionally non-runnable command shape is:

```text
node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute \
  --approve-exact-artifact-set --approve-iam-policy \
  --approve-compliance-retention --approve-mfa-session \
  --retention-until 2033-08-12T00:00:00Z \
  --aws-profile <EXACT_CONFIGURED_PROFILE> \
  --mfa-serial <EXACT_IAM_MFA_DEVICE_ARN> --mfa-code <FRESH_6_DIGIT_CODE> \
  --data-root <ABSOLUTE_WITNESS_TREE_DATA_DIRECTORY> \
  --state-dir <EXISTING_CONTROLLED_STATE_DIRECTORY> \
  --sidecar-dir <EXISTING_CONTROLLED_SIDECAR_DIRECTORY>
```

The placeholders are intentional blockers. They must not be guessed or stored
in Git.

## Exact IAM policy and separate approval wording

The proposed policy is
`data/qc-fourth-inventory-immutable-promotion-iam-policy.json`, SHA-256
`69816a61c0f0e9c5eef55e13db65d55069f250c10729ff5a1082876f587cfa82`.
It allows an MFA session and the minimum read/upload/retention/multipart-read
actions on the 62 exact object ARNs. It explicitly denies object access outside
those ARNs, denies bucket listing, and denies deletion, multipart abort,
retention bypass, legal-hold changes, bucket Object Lock/versioning/lifecycle
changes, bucket deletion, and replication. Because these explicit denies are
deliberately strict, the policy is only suitable for the exact dedicated
principal named by a future approval, not a general-purpose operator identity.
The exact retain-until instant is enforced and read back by the runner because
IAM has no direct exact-timestamp condition for this operation.

Future authority must be explicit and separate. The following wording is the
minimum unambiguous approval; filled placeholders must identify existing
controlled values:

**Artifact and retention approval**

> I approve uploading exactly the 62 objects enumerated by
> `data/qc-fourth-inventory-immutable-promotion-preparation.json` at SHA-256
> `8cedb3551aa4c1c4bc1675b38175d8ace9dcfb44c7dd9629e81155280ec999ff`
> to their enumerated keys in `witness-tree-raw-archive-ca-central-1`,
> `ca-central-1`, and applying irreversible S3 Object Lock `COMPLIANCE`
> retention through `2033-08-12T00:00:00Z`. I approve excluding the separately
> recorded map-only provincial archive. I understand the retained versions
> cannot be deleted and their retention cannot be shortened before that date.

**IAM and MFA execution approval**

> I approve attaching exactly
> `data/qc-fourth-inventory-immutable-promotion-iam-policy.json` at SHA-256
> `69816a61c0f0e9c5eef55e13db65d55069f250c10729ff5a1082876f587cfa82`
> to `[EXACT IAM PRINCIPAL ARN]`, using configured AWS profile
> `[EXACT PROFILE]` and MFA device `[EXACT MFA DEVICE ARN]` for one controlled
> execution and read-back. I approve no other IAM, bucket, key, deletion,
> bypass, lifecycle, legal-hold, logging, replication, transformation,
> ingestion, release, or production change.

Both approvals are required. Approval of one does not imply the other, and
neither is present in this preparation commit.
