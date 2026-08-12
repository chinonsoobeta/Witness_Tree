# Acquisition decision required

**Status:** Object-storage decision required. No provider has been selected. Two compressed source archives have been downloaded to a separate local staging tree and verified; no immutable object-storage write, transformation, ingestion, or production-data release has occurred.

This record turns the approved architecture into an owner decision. It does not recommend a storage vendor.

## Verified priority-source compressed volumes

| Priority artifact | Compressed bytes |
| --- | ---: |
| NRCan annual forest-land-cover volume | 58,954,694,668 |
| NRCan 2022 canopy-cover ZIP | 9,954,395,939 |
| NRCan 2022 canopy-height ZIP | 10,347,564,066 |
| Québec ecoforest volume | 12,399,475,076 |
| Québec historical detailed-fire GeoPackage | 414,244,435 |
| Alberta AVI Crown FGDB ZIP | 557,041,258 |
| **Minimum one-snapshot sum** | **92,627,415,442** |

The sum is a minimum for one retained compressed snapshot of these six candidate artifacts only. It excludes all other required sources, repeat retrievals, live-fire snapshots, metadata sidecars, derived products, backups, and retained historical versions. Ontario FRI Term 2 is also excluded because only its web explorer—not a downloadable data artifact—has been verified. CA Forest Harvest is excluded because its official catalogue currently names a harvest ZIP while linking to a fire-named ZIP; a working predictable harvest URL is not enough to resolve that authoritative identity conflict.

Unconfirmed until selected resources are retrieved and profiled:

- uncompressed working space;
- transform, intermediate, analytics, tile, and release volumes;
- CDN and user-download egress; and
- compute time, memory, scratch storage, and transfer costs.

## Required design constraints

The approved plan requires immutable object storage: one source/retrieval prefix with checksum and metadata sidecar, without overwriting a prior source or published result. Raw snapshots must remain reproducible with their recorded method version. See [the plan’s architecture and controls](../../work/witness-tree-plan.md#7-architecture) and [raw-archive contract](RAW_ARCHIVE.md).

Provisioning must distinguish **development**, **data review**, **staging**, and **production**. Data review is a required human-review boundary before staging; it is not a production environment. See [plan section 7.2](../../work/witness-tree-plan.md#72-environments-and-non-negotiable-controls).

## Decisions needed from owners

Before any multi-gigabyte acquisition, record approval for:

1. Storage provider, Canadian region/data-residency requirements, budget ceiling, retention period, immutability/versioning controls, backup/recovery, and egress policy.
2. Processing compute: owner, region, approved spend limit, scratch capacity, and operational access/secret handling.
3. Checksum and archive procedure: SHA-256 capture, metadata sidecar fields, key naming, prior-snapshot links, and verification responsibility.
4. Legal and attribution approval for every selected resource, including redistribution and any required publisher wording.
5. The exact selected artifacts and versions—including whether each priority source is approved for the first acquisition.

The owner authorized large dataset acquisition on 11 August 2026. That authorization permits staged downloads, but it does not resolve object-storage, compute, attribution, retention, or production-release decisions. [Source verification](SOURCE_VERIFICATION.md) records the current source/rights distinctions, and [external gates](EXTERNAL_GATES.md) remain open.

## Simplest staged option

The first two real transfers validated the 414,244,435-byte Québec historical-fire ZIP and 557,041,258-byte Alberta AVI ZIP: exact lengths, ZIP integrity, and SHA-256 passed. Their evidence is in [`data/staged-acquisitions.json`](../data/staged-acquisitions.json), while the 971,285,693 bytes remain outside Git in the separate staging tree. Québec attribution is metadata-verified. Alberta attribution and its geometry repair-or-quarantine policy remain open. Continue staged, resumable downloads only within available local capacity. Promotion to immutable object storage still requires the decisions above.

## Claude Code continuation

From the repository root:

```sh
cd /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree
sed -n '1,140p' docs/IMPLEMENTATION_STATUS.md
sed -n '1,220p' docs/SOURCE_VERIFICATION.md
sed -n '1,220p' docs/ACQUISITION_DECISION.md
git diff --check
git status --short
```

**Next step:** complete and verify the authorized staging transfers, obtain the remaining owner decisions, then copy verified bytes and sidecars into approved immutable object storage. Do not claim production readiness until that evidence exists.
