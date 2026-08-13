# Canadian immutable-storage provider options

**Status:** Recommendation only. The recommended AWS option has since been provisioned as one empty bucket in `ca-central-1` with versioning and Object Lock enabled; no object, no default retention policy, and no replication configuration exist, and nothing has been uploaded. Its read-back configuration is recorded in `docs/IMMUTABLE_STORAGE_PROVISIONING.md`. No Azure container or Google Cloud bucket has been created.

This evaluates the three requested managed-object-storage options against the controls in [the immutable-storage decision](IMMUTABLE_STORAGE_DECISION.md). It is not a legal residency opinion and does not change the requirement to document every copy of raw bytes, including inventory, backups, replicas, logs, and processing scratch.

## Recommendation

Choose **Amazon S3 in `ca-central-1` (Canada (Central)) with S3 Object Lock in compliance mode** for the first proof of concept, subject to the owner choices below. It is the smallest operational fit: S3 Object Lock is purpose-built for object-version retention; compliance mode prevents any user, including the account root user, from deleting or overwriting a protected version or shortening its retention. AWS identifies `ca-central-1` as a Canadian region, and S3 is available there. [AWS Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) · [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) · [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html)

This is a recommendation for a limited raw-archive proof of concept, not a claim that one vendor is universally more secure or economical. AWS is preferred here because the project’s existing promotion contract asks for a distinct provider version ID and a compliance-grade retained object; S3 exposes this model directly and needs no application-specific translation beyond recording the S3 version ID and retention-until time.

## Common non-negotiable requirements

Every option can meet the core WORM need only when configured and evidenced correctly. Before any source upload, the owner must establish:

- a single Canadian primary location and an explicit rule that disables non-Canadian replication, backup, inventory, logging, analytics exports, and processing scratch;
- version identity, checksum verification from remote bytes, private access, least-privilege uploader/read roles, administrator audit logs, encryption choice, and an approved legal-hold process;
- a locked/compliance retention configuration, rather than an unlocked test policy or ordinary versioning alone; and
- a retention duration, storage ceiling, recovery approach, and accountable operator.

Regional labels describe where a service’s regional storage is located; they do **not** prove that every ancillary product, support process, control-plane log, customer-managed-key configuration, export, or user-selected replication target stays in Canada. That evidence remains a setup gate.

## Comparison

| Option | Canadian location evidence | WORM mechanism and fit | Important caveats | Assessment |
| --- | --- | --- | --- | --- |
| **AWS S3 Object Lock** | AWS lists `ca-central-1` as Canada (Central), geography Canada; S3 has a regional endpoint there. [Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) · [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html) | Object Lock works on object versions. In **compliance** mode, a protected version cannot be overwritten/deleted by any user, including root; the retention period cannot be shortened. [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) | Same key can create another version, so the project must retain its append-only checksum prefix rule and prohibit mutable aliases. Do not use governance mode as the production control: authorized users can bypass it. A legal hold is removable by a permitted user, so it supplements—not replaces—approved compliance retention. Cross-Region Replication and every destination must be separately reviewed for Canadian residency. | **Recommended.** Direct match to version-ID and compliance-retention evidence required by the project. |
| **Azure Blob immutable storage** | Microsoft documents Canada Central and Canada East as the Canadian pair for Azure Storage geo-redundancy. [Azure region pairs](https://learn.microsoft.com/en-us/azure/reliability/regions-paired) | Container-level or version-level WORM supports time-based retention and legal holds. A locked time-based policy cannot be deleted or shortened; objects cannot be modified/deleted while retained. [Immutable Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview) | An **unlocked** policy can be shortened or deleted and is unsuitable for the project’s final gate. Version-level WORM requires blob versioning; container-level WORM is the simpler choice for a dedicated raw-archive container. Version-level WORM and a container legal hold cannot coexist on the same container. Soft-delete, versioning, Data Lake namespace, geo-replication and logging choices need a compatibility/residency review. | Viable alternative, especially for an owner already operating Azure in Canada Central. Slightly more policy-scope choices to document. |
| **Google Cloud Storage Bucket Lock** | Cloud Storage documents regional locations `northamerica-northeast1` (Montréal) and `northamerica-northeast2` (Toronto); regional data is redundant across multiple zones within its region. [Bucket locations](https://cloud.google.com/storage/docs/locations) | A bucket retention policy prevents deletion or replacement before the retention period. Bucket Lock permanently prevents reducing or removing that policy. [Bucket Lock](https://cloud.google.com/storage/docs/bucket-lock) | Bucket Lock is a bucket-wide policy, so isolate raw source snapshots in a dedicated bucket. Locking is irreversible and places a project lien; account continuity and a deletion/exit procedure need governance. A dual-region/multi-region choice must not be assumed Canadian—choose one listed Canadian **regional** location unless the exact replication geography is independently documented. | Viable alternative, particularly if the owner already has a Canadian GCP project. Its bucket-wide irreversible policy is less flexible for mixed retention needs. |

## Capacity and cost boundary

The current planning floor is **200 GB of immutable raw capacity**. Its evidence is in [the immutable-storage decision](IMMUTABLE_STORAGE_DECISION.md): 92,627,415,442 bytes (92.63 decimal GB / 86.26 GiB) for the six priority compressed candidate artifacts, plus one complete replacement, totals 185,254,830,884 bytes (185.25 GB / 172.53 GiB). The 200 GB floor leaves only modest metadata headroom; it excludes extraction, transformations, tile outputs, extra backup copies, new source versions, and live-fire snapshots.

No price is estimated here. Storage, API, retrieval, egress, replication, inventory, logging, encryption-key, and minimum-duration charges are provider- and configuration-dependent. Use the current provider calculator for the selected Canadian region and retention/lifecycle configuration, then obtain the owner’s budget approval before provisioning.

## Owner choices required before implementation

The following decisions cannot be inferred from documentation or delegated to an uploader:

1. Provider and account/project/subscription; exact primary Canadian region; named archive bucket/container; and accountable operator.
2. Retention duration and legal-hold authority/process. This is consequential and cannot be safely guessed because the locks are deliberately difficult or impossible to undo.
3. Budget ceiling, approved storage class/lifecycle, anticipated retrieval/egress pattern, and whether a Canadian recovery copy is needed beyond the provider’s regional durability.
4. Encryption model (provider-managed versus customer-managed key), public-access block, dedicated uploader/read/admin roles, audit-log retention destination, and an explicit cross-border denial policy for replication, logs, inventory, backups, analytics, and scratch.
5. Whether the proof uses only a harmless test object or is authorized to promote either verified raw source. Source attribution/release gates remain independent; Alberta is admitted to transformation design only and no current staged source is remotely verified.

## Exact proof-of-concept sequence after approval

This sequence is intentionally provider-specific only after the owner selects AWS. Step 2 has been carried out in part: the bucket exists with Object Lock and versioning enabled, public access blocked, and SSE-S3 selected, but with no dedicated uploader, reader, or break-glass roles. Steps 3 to 6 have **not** run and are **not** authorized now.

1. Record the five owner choices above in a private, redacted configuration record. Set the primary location to `ca-central-1`; reject any replication, backup, inventory, log-export, or scratch destination not evidenced as Canadian.
2. Create a new dedicated private S3 bucket in `ca-central-1` with Object Lock enabled and versioning enabled. Block public access, require TLS, select encryption, and create narrowly scoped uploader, reader, and break-glass administration roles. Do not reuse a general-purpose bucket.
3. Configure a **compliance-mode** default retention period that the owner has approved. Verify with `GetObjectLockConfiguration` and retain redacted configuration output. Test an ordinary delete and a retention-shortening request against a non-source test object; both must fail while retained. Record the resulting object version ID and retention-until time.
4. Upload one small, non-source test payload and its sidecar under the project’s immutable prefix layout. Independently download the exact payload bytes, calculate SHA-256, compare byte length and hash to the local values, and record the payload/sidecar version IDs, region, retention evidence, and reviewer/time in a private proof record.
5. Enable and capture the approved audit/inventory evidence. Confirm the bucket location, Object Lock setting, version IDs, retained objects, blocked public access, and no non-Canadian replication/export target. Verify no credentials, signed URLs, or personal data appear in Git or the sidecar.
6. Have an independent reviewer mark the test proof accepted or rejected. Only an accepted proof plus per-source attribution/release approval may authorize a future provider adapter and raw-source promotion. A completed test is not a source ingestion, transformation, public release, or production claim.

For Azure, the equivalent proof must use a dedicated Canada Central container with a **locked** container-level time-based WORM policy; for GCP, a dedicated Montréal or Toronto regional bucket with the approved retention policy **locked** using Bucket Lock. In all cases, prove an attempted delete/overwrite is rejected and verify remote bytes independently before the project may use `remote-verified`.

## Official sources used

- AWS: [Regions](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html), [S3 endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html), and [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).
- Microsoft: [Immutable Blob Storage overview](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview) and [Azure region pairs](https://learn.microsoft.com/en-us/azure/reliability/regions-paired).
- Google Cloud: [Cloud Storage bucket locations](https://cloud.google.com/storage/docs/locations) and [Bucket Lock](https://cloud.google.com/storage/docs/bucket-lock).
