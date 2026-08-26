# Québec fourth-inventory immutable-promotion preparation

## Status

The exact 62-object archive is complete. Independent, read-only, exact-version
readback is recorded in
`data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json` and checked
by `npm run check:qc-fourth-inventory-exact-archive-readback`. It binds the
approved plan, all 62 private version IDs (only as a redacted aggregate hash),
byte lengths, SHA-256 checksum values/types (56 `FULL_OBJECT`, six
`COMPOSITE`), and `COMPLIANCE` retention through exactly
`2033-08-12T00:00:00Z`. It contains no ARNs, credentials, or version IDs.

This is raw immutable-archive evidence only. It does not establish owner
admission, transformation, ingestion, release, recovery replication, or
production eligibility. The exact plan is
`data/qc-fourth-inventory-immutable-promotion-preparation.json`; its SHA-256 at
commit preparation is
`fce3e053e68cbed57bf612476235361c37108d911609c82bc5d5a3cdeb82d258`.

The applied IAM state is separately recorded in
`data/qc-fourth-inventory-iam-applied-readback-2026-08-25.json` and checked by
`npm run check:qc-fourth-inventory-iam-applied-readback`. It binds the two
MFA-trusted, 12-hour roles, their two exact 31-object inline-policy hashes, and
the MFA-gated operator assume-role policy in account `286853118812` / region
`ca-central-1`. It is IAM evidence only: it does not establish any upload,
retention, object readback, admission, transformation, ingestion, release, or
production use.

The applied role trust and operator assume-role grant require
`aws:MultiFactorAuthPresent=true`. MFA is enforced before either role session is
issued. The two exact S3 object policies are deliberately unconditional: IAM
does not propagate that MFA context into S3 authorization for role credentials.
This preserves the same five actions and exact 31-key resource set per role;
all other requests remain implicitly denied.

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

The owner-local wrapper is now `scripts/run-qc-fourth-inventory-approved-promotion.sh`.
Its default mode validates the immutable preparation only; `--preflight` hashes
all 61 local source/evidence files and validates the deterministic in-memory
collection manifest without prompting for MFA or calling AWS. `--run` repeats
that preflight, creates only two fixed owner-local 0700 directories under the
controlled `Witness_Tree-data/work/qc-fourth-inventory/` path, then obtains
separate direct MFA role sessions for the two fixed 31-object batches and
invokes the exact execution program once per batch with all four recorded
approval flags. This split is required because IAM rejected the original
62-object policy after the empty first role was created: the duplicated
`NotResource` explicit-deny list exceeded IAM's per-role inline-policy limit.

It accepts no data-root, state-directory, sidecar-directory, role, profile, or
MFA-code arguments. The code is read hidden from the terminal by the shared
direct-MFA helper, never printed or stored, and never appears in a command line.
The helper reads only the local configured `mfa_serial`, pins the caller to the
approved operator/account, and does not call `ListMFADevices`.

```sh
zsh scripts/run-qc-fourth-inventory-approved-promotion.sh --preflight
zsh scripts/run-qc-fourth-inventory-approved-promotion.sh --run
```

The execute path remains resumable through its fixed state directory. It is raw
archive evidence only; successful upload/readback does not authorize a semantic
transformation, join selection, source-ledger admission, public release, or
production eligibility.

## Exact IAM policy and separate approval wording

`data/qc-fourth-inventory-immutable-promotion-iam-batches.json` fixes two
non-overlapping 31-object batches. The provisioner derives two small Allow-only
policies from the already checked exact-object ledger:
`WitnessTreeQcFourthArchiveExactObjectsBatchOne` on the existing
`WitnessTreeQcFourthArchivePromotionUploader`, and
`WitnessTreeQcFourthArchiveExactObjectsBatchTwo` on the new
`WitnessTreeQcFourthArchivePromotionUploaderBatchTwo`. Each permits only the
minimum read/upload/retention/multipart-read actions on its own exact objects;
all other objects and actions are implicitly denied. The legacy 62-object JSON
remains the checked object ledger and must not be applied. This avoids the
oversized duplicated explicit-deny list without widening scope.
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
> `WitnessTreeQcFourthArchivePromotionUploader` and
> `WitnessTreeQcFourthArchivePromotionUploaderBatchTwo`, each trusted only by
> `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator` when MFA is
> present. I authorize attaching to that user only an MFA-gated
> `sts:AssumeRole` policy for those roles. I authorize attaching exactly the two
> fixed 31-object policies derived by
> `scripts/provision-qc-fourth-inventory-iam.mjs` from
> `data/qc-fourth-inventory-immutable-promotion-iam-batches.json`, collectively
> covering the exact 62 keys enumerated by the preparation plan. This
> excludes all deletes, multipart aborts, bypasses, legal-hold changes,
> replication, bucket administration, wildcard object scope, other keys,
> other buckets, and other IAM changes. This IAM approval does not authorize
> upload until the separate artifact-and-retention approval above is also given.

Both approvals are required. Approval of one does not imply the other, and
neither is present in this preparation commit.
