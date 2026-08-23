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
in a caller-supplied owner-controlled mode-700 state directory. The data root
must be an owner-controlled, non-symlink `Witness_Tree-data` directory that is
not group- or other-writable. The state and sidecar directories must be
existing owner-controlled, non-symlink mode-700 directories, separate from one
another and from the data root. Generated state, multipart scratch, and
collection-manifest files are owner-controlled, non-symlink mode-600 files with
no hard-link aliases. A rerun validates the state record's exact key, byte
length, SHA-256, upload method, contiguous local part checksums, and provider
`ListParts` result before it uploads or completes anything. The entire run is
held under an exclusive owner-local lock in the state directory; a second
process or re-entrant call stops before creating a sidecar or making an AWS
call. A pre-call mutation intent is durably written before every `PutObject`,
`CreateMultipartUpload`, `UploadPart`, and `CompleteMultipartUpload`. If any
such response is lost, malformed, or ambiguous, the record is marked
`recoveryRequired` and future runs refuse the mutation rather than creating a
duplicate. A state with every
part present and `complete: false` is a valid pre-completion resume boundary;
it does not create a new multipart upload or re-upload a part. A successful
completion or single-PUT response is persisted with `complete: false` before
exact-version readback, and only the matching byte length, provider checksum,
and retention readback changes it to `complete: true`. A readback interruption
therefore resumes against the saved VersionId without repeating the write. If
a completion call returns no usable response and the provider no longer exposes
the UploadId, the runner fails closed because it cannot safely discover an exact
VersionId under the no-list policy. The state file contains no credentials. The
temporary MFA session lasts one hour; if it expires, the run stops safely and a
later run with a fresh MFA code resumes from the saved exact-part, completion,
or exact-version readback boundary.

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
but execution requires the owner-local wrapper
`scripts/run-qc-fourth-inventory-approved-promotion.sh`. The wrapper reads only
local `aws configure get mfa_serial`, accepts a fresh six-digit TOTP only from
an interactive prompt, verifies account `286853118812` and operator
`arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator`, assumes only
`arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader`,
verifies the exact role-session name and expiry, and exports only short-lived
credentials plus non-secret identity markers. It never calls `ListMFADevices`,
takes an MFA code as a command-line argument, or accepts inherited long-lived
credentials.

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

The owner wrapper is deliberately the only execution shape:

```text
scripts/run-qc-fourth-inventory-approved-promotion.sh --run \
  --data-root <ABSOLUTE_WITNESS_TREE_DATA_DIRECTORY> \
  --state-dir <EXISTING_MODE_700_STATE_DIRECTORY> \
  --sidecar-dir <EXISTING_MODE_700_SIDECAR_DIRECTORY>
```

The controlled directory paths must not be guessed or stored in Git. The owner
must provide real absolute paths only after checking the mode, ownership,
non-symlink, containment, and hard-link requirements above. Direct invocation
with `--session-ready` is not an owner authorization; the wrapper's exact
identity markers are required by the runner.

## Post-run evidence boundary

The runner's JSON result and private state file are operational evidence only;
they do not update the Phase 1 ledger or prove an independently reviewed
archive. The fourth-inventory-specific owner-gated read-only capture and
checker are:

```text
scripts/run-qc-fourth-inventory-approved-promotion.sh --capture \
  --state <OWNER_CONTROLLED_MODE_600_PROMOTION_STATE> \
  --data-root <OWNER_CONTROLLED_WITNESS_TREE_DATA_DIRECTORY> \
  --sidecar-dir <OWNER_CONTROLLED_MODE_700_SIDECAR_DIRECTORY> \
  --private-output <NEW_OWNER_CONTROLLED_MODE_600_PRIVATE_ATTESTATION> \
  --redacted-output <NEW_REDACTED_RECORD>

node scripts/check-qc-fourth-inventory-immutable-promotion-attestation.mjs \
  --pair <OWNER_CONTROLLED_MODE_600_PRIVATE_ATTESTATION> \
  <REDACTED_RECORD>
```

The capture mode obtains its own fresh interactive MFA session, verifies the
exact account, operator, approved role, fixed role-session name, STS identity,
and expiry, then makes only exact-version `HeadObject` and `GetObjectRetention`
calls for the 62 plan-bound objects. Before the first remote read it performs a
fresh local preflight of all 61 source/evidence files and the canonical
sidecar, then recomputes all six 128 MiB multipart part-hash sequences and
composite checksums from local bytes. It validates the completed mode-600 state
and publishes the private/redacted pair through exclusive staged files. The
private record preserves exact plan-file and parsed-plan digests, state digest,
local preflight facts, exact keys/VersionIds, and the verified account,
operator, role, role-session, MFA, and expiry facts. The digest-bound redacted
record exposes only ordinals, hashes, byte lengths, checksum types, local-part
digests, response digests, and exact retention facts; it contains no raw
version, upload, account, operator, role, object-key, or provider-checksum
identifier.

## Ambiguous-write recovery boundary

An ambiguous single-PUT, multipart-create, part, or completion response is not
retried automatically. The separate diagnostic tool below is read-only and
does not edit the promotion state, start a replacement upload, complete an
upload, change retention, or update any ledger:

```text
scripts/run-qc-fourth-inventory-readonly-recovery-owner.sh --recover \
  --state <OWNER_CONTROLLED_MODE_600_PROMOTION_STATE> \
  --data-root <OWNER_CONTROLLED_WITNESS_TREE_DATA_DIRECTORY> \
  --output <NEW_OWNER_CONTROLLED_MODE_600_RECOVERY_RECORD>
```

It is gated by a separate read-only approval and session marker. It may probe
only exact-key `ListParts` (when an UploadId was already durably recorded),
unversioned/exact-version `HeadObject`, and `GetObjectRetention`. A
`NoSuchUpload` result, or any inability to prove a matching exact version,
remains `recovery-required-no-automatic-duplicate`; it never authorizes a new
multipart upload. A passing diagnostic is operational evidence only and does
not make the fourth-inventory row immutable, transformed, ingested, released,
or production eligible.

The pending public record remains
`data/qc-fourth-inventory-immutable-promotion-attestation.json`. The existing
`scripts/capture-qc-immutable-promotion-attestation.sh` is scoped to the two
Québec current/original artifacts and must not be reused for this 62-object
collection. After an owner run, preserve the mode-700 state directory and
mode-600 state and private attestation files. Until the resulting pair is
independently reviewed, validated, and integrated, the fourth-inventory row
remains local verified/profiled only and no immutable credit, transformation,
ingestion, release, or production claim is permitted. Any separately approved
recovery readback remains outside this capture and must be proved independently.

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
