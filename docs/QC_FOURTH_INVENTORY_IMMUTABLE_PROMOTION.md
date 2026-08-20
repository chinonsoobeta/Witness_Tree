# Québec fourth-inventory immutable-promotion preparation

## Status

This is a blocked preparation, not an AWS or IAM action. No object was uploaded,
no retention was applied, no IAM policy was created or attached, and no remote
object is claimed. The exact plan is
`data/qc-fourth-inventory-immutable-promotion-preparation.json`; its SHA-256 at
commit preparation is
`fce3e053e68cbed57bf612476235361c37108d911609c82bc5d5a3cdeb82d258`.

No live IAM desired-state record is committed. The exact object-only policy in
`data/qc-fourth-inventory-immutable-promotion-iam-policy.json` is a review
input, not evidence that any role, policy, MFA session, or remote object exists.

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

The runner intentionally remains fail-closed. Its safe dry run is available,
but execution requires an owner-local MFA role-session runner that is not
enabled until the separate exact artifact/retention approval exists. That future
runner may read only local `aws configure get mfa_serial`, must accept a safe
nonempty `arn:aws:iam::286853118812:mfa/<path>` without printing it, pin the
caller to the operator user/account, and assume only the role above. It must
never call `ListMFADevices` or take an MFA code as a command-line argument.

The deliberately non-executable command shape is:

```text
node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute \
  --approve-exact-artifact-set --approve-iam-policy \
  --approve-compliance-retention --approve-mfa-session \
  --retention-until 2033-08-12T00:00:00Z --session-ready \
  --data-root <ABSOLUTE_WITNESS_TREE_DATA_DIRECTORY> \
  --state-dir <EXISTING_CONTROLLED_STATE_DIRECTORY> \
  --sidecar-dir <EXISTING_CONTROLLED_SIDECAR_DIRECTORY>
```

`--session-ready` is intentionally unavailable in this repository. It cannot
be supplied with long-lived credentials or manually passed MFA values. The
controlled directory paths must not be guessed or stored in Git.

## Exact IAM policy and separate approval wording

The proposed object policy is
`data/qc-fourth-inventory-immutable-promotion-iam-policy.json`, SHA-256
`9259e120095f87da7420ff545aea55175ccdefa0be04687d4a9b4626880118d1`.
It allows only the minimum read/upload/retention/multipart-read
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
> `fce3e053e68cbed57bf612476235361c37108d911609c82bc5d5a3cdeb82d258`
> to their enumerated keys in `witness-tree-raw-archive-ca-central-1`,
> `ca-central-1`, and applying irreversible S3 Object Lock `COMPLIANCE`
> retention through `2033-08-12T00:00:00Z`. I approve excluding the separately
> recorded map-only provincial archive. I understand the retained versions
> cannot be deleted and their retention cannot be shortened before that date.

**IAM and MFA execution approval**

> In AWS account `286853118812`, I authorize creation or update only of
> `WitnessTreeQcFourthArchivePromotionUploader`, trusted only by
> `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` when MFA is
> present. I authorize attaching to that user only an MFA-gated
> `sts:AssumeRole` policy for that role. I authorize attaching exactly
> `data/qc-fourth-inventory-immutable-promotion-iam-policy.json` at SHA-256
> `9259e120095f87da7420ff545aea55175ccdefa0be04687d4a9b4626880118d1` to
> that role for the exact 62 keys enumerated by the preparation plan. This
> excludes all deletes, multipart aborts, bypasses, legal-hold changes,
> replication, bucket administration, wildcard object scope, other keys,
> other buckets, and other IAM changes. This IAM approval does not authorize
> upload until the separate artifact-and-retention approval above is also given.

Both approvals are required. Approval of one does not imply the other, and
neither is present in this preparation commit.
