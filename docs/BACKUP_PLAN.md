# Backup plan for owner approval

Status: **proposal, 2026-09-29. Nothing has been created, replicated, or
uploaded.** This is step 1 of the backups sequence in
[PHASE8_IMPLEMENTATION_PLAN.md](PHASE8_IMPLEMENTATION_PLAN.md) section 5: the
shapes, their costs, and their consequences, put to the owner. Phase 8
`backups` stays `fail` until the approved copy exists, has been read back,
and a restore has been tested, as
[ARCHIVE_RECOVERY_COPY_SCHEMA.md](ARCHIVE_RECOVERY_COPY_SCHEMA.md) requires.

The gate asks for "an approved complete Canadian recovery copy … covering
every relied-on object, with a tested restore"
([EXTERNAL_GATES.md](EXTERNAL_GATES.md)).

## 1. What there is to protect

Sizes were read on 2026-09-29 from the data root
(`/Volumes/Extended_SSD/Witness_Tree-data`, one 1.8 TB drive) and from the
repository's release and archive records. Nothing was listed in S3. Confirm
bucket sizes from S3 Storage Lens or the `BucketSizeBytes` metric before
approving.

| Tier | Size | Files or objects | Copies today |
| --- | ---: | ---: | --- |
| Raw archive, S3 `witness-tree-raw-archive-ca-central-1` | about 122 GB of canonical payloads, plus wildfire snapshots since 2026-09-13 | 116 of the 120 canonical inventory artifacts | One. A same-region recovery bucket (`witness-tree-raw-recovery-ca-central-1`) holds copies for a few sources only, such as harvest and canopy height |
| Published releases, S3 delivery bucket behind CloudFront | about 80 GB in the release records (per-cell tiles 44.1 GB, four-province tiles 25.1 GB, span archive 10.3 GB, maps and overlays under 0.2 GB) | about 100 | One |
| Data root `derived/` | about 547 GB | 721,906 files, 674,545 of them under 128 KB | One |
| Data root `raw/` | about 286 GB, of which about 123 GB is canonical and already in S3 | 16,026 | About 163 GB exists only on the drive, for example `bc-vri-historical` (87 GB) and `glc-fcs30d-v2` (37 GB) |
| Data root `extracted/` | about 31 GB | 1 | Can be rebuilt from raw |
| Data root `work/`, `staging/`, `quarantine/` | about 71 GB | 6,568 | Scratch. Not proposed for backup |

Four canonical inventory artifacts have no S3 record: part of
`cwfis-historical` (0.78 GB) and the `provincial-electoral-boundaries`
components. Either archive them or record why they are not relied on.

## 2. Proposal

Put every copy in **`ca-west-1` (Calgary)**. It is Canadian, so nothing
crosses the border, and it survives the loss of `ca-central-1`, which a
second bucket in the same region does not.

| Part | What | Storage class | Why |
| --- | --- | --- | --- |
| A | Cross-Region Replication of the raw archive to a new ca-west-1 bucket with versioning and Object Lock. Batch Replication for the objects that already exist | Glacier Flexible Retrieval | Rarely read, and restorable within hours. The gate is about raw bytes first |
| B | Cross-Region Replication of the delivery bucket's `releases/` prefix to ca-west-1 | Glacier Instant Retrieval | The live site loads these files. After a loss they have to come back in minutes, not hours |
| C | The data root's `derived/` directory: pack each top-level dataset into one tar with a SHA-256 manifest, and upload it as a create-once object to a new ca-west-1 bucket | Glacier Flexible Retrieval | 722,000 small files would cost more in request and overhead fees than in storage. Packed, it is a few hundred objects |
| C2 (optional) | The same, for the roughly 163 GB of raw data that exists only on the drive | Glacier Flexible Retrieval | Only if any of it is relied on. Otherwise it is re-fetchable from its publisher |
| D (optional) | A second local drive, synced from the data root | — | Fastest restore, but in the same place as the first drive. It does not satisfy a Canadian recovery copy on its own. It is a purchase, not an S3 cost, and is not priced here |

`extracted/` and the scratch folders are left out, because they can be
rebuilt from raw.

## 3. Cost

On-demand prices for `ca-west-1`, from the AWS price list published
2026-09-28, in USD. They exclude tax and any account discount.

| Unit | Price |
| --- | --- |
| S3 Standard storage | $0.025 per GB-month |
| Standard-Infrequent Access | $0.0138 per GB-month |
| Glacier Instant Retrieval | $0.005 per GB-month (retrieval $0.03 per GB) |
| Glacier Flexible Retrieval | $0.00405 per GB-month (bulk retrieval $0, standard retrieval $0.011 per GB) |
| Glacier Deep Archive | not in the regional price list; confirm in the console before choosing it |
| Transfer ca-central-1 to ca-west-1 (replication) | $0.02 per GB |
| Upload from the owner's machine | $0 |
| Download to the internet (for a restore) | $0.09 per GB |
| PUT to a Glacier class | $0.033 per 1,000 |
| Batch Operations | $0.25 per job plus $1.00 per million objects |

| Part | One-time | Monthly |
| --- | ---: | ---: |
| A: raw, 122 GB | about $2.45 transfer, plus about $1 in batch and request fees | about $0.50 |
| B: releases, 80 GB | about $1.60 transfer | about $0.40 |
| C: derived, 547 GB, packed | $0 upload, under $1 in request fees | about $2.22 |
| **A + B + C** | **about $6** | **about $3.12** |
| C2: extra raw, 163 GB | $0 upload | about $0.66 |
| For comparison: A + B + C in S3 Standard | | about $18.75 |

**The Object Lock commitment in part A.** A replicated object keeps its
compliance-mode lock until 2033-08-12, and nobody can remove it, including
the account root. At Glacier Flexible Retrieval rates, the raw copy is about
$0.50 a month, or roughly $41 through 2033. In S3 Standard it would be
roughly $250. Glacier Flexible Retrieval also bills at least 90 days per
object, so part C should add new tars rather than replace old ones.

**A tested restore.** A restore of one dataset tar of about 10 GB costs
about $1 (standard retrieval plus download). A full restore of all three
parts, about 750 GB, would cost about $70, almost all of it download fees.

## 4. Decisions for the owner

| ID | Decision | Owner answer |
| --- | --- | --- |
| B1 | Destination region: `ca-west-1` as proposed, or a second bucket in `ca-central-1` (cheaper transfer, no protection against losing the region) | |
| B2 | Approve part A, including the lock through 2033-08-12 on every replica | |
| B3 | Whether the superseded flat-key versions in `data/immutable-promotions.json` replicate, or a filter leaves them out | |
| B4 | Approve part B | |
| B5 | Approve part C, and how often it is refreshed: after each admitted run, or on a schedule | |
| B6 | Part C2: which drive-only raw sets are relied on | |
| B7 | Part D: yes or no | |
| B8 | A monthly budget alarm for these buckets, and its amount | |
| B9 | Restore test: which payload, who runs it, and when. The primary object's retention has to be read back unchanged afterwards | |

## 5. After approval

The owner runs each step with their own AWS session. The repository side
then:

1. records B1–B3 in the `recoveryCopy` and `replication` decision fields of
   `data/archive-operations-readiness.json`;
2. writes `data/archive-recovery-copy.json` from the destination read-back
   and the restore exercise, never by hand, and runs
   `npm run check:archive-recovery-copy`;
3. adds a record for parts B and C, with object keys, byte lengths, and
   SHA-256 values checked against the release records and the tar manifests;
4. rebinds Phase 8 `backups`, and changes it to `pass` only when every
   relied-on tier has a verified copy and a tested restore.
