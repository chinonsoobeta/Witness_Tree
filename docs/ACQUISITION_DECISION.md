# Acquisition decision required

**Status:** Decision required. No provider has been selected; no download, archive write, transformation, ingestion, or production-data release has occurred.

This record turns the approved architecture into an owner decision. It does not recommend a storage vendor.

## Verified priority-source compressed volumes

| Priority artifact | Compressed bytes |
| --- | ---: |
| NRCan annual forest-land-cover volume | 58,954,694,668 |
| Québec ecoforest volume | 12,399,475,076 |
| Québec historical detailed-fire GeoPackage | 414,244,435 |
| Alberta AVI Crown FGDB ZIP | 557,041,258 |
| **Minimum one-snapshot sum** | **72,325,455,437** |

The sum is a minimum for one retained compressed snapshot of these four candidate artifacts only. It excludes all other required sources, repeat retrievals, live-fire snapshots, metadata sidecars, derived products, backups, and retained historical versions. Ontario FRI Term 2 is also excluded because only its web explorer—not a downloadable data artifact—has been verified.

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

Candidate status does not authorize acquisition. [Source verification](SOURCE_VERIFICATION.md) records the current source/rights distinctions, and [external gates](EXTERNAL_GATES.md) remain open.

## Simplest staged option

First validate one small official index or resource: confirm its exact URL, licence/attribution, version, retrieval metadata, checksum procedure, archive key, and restoration/read path. Do not acquire the multi-gigabyte artifacts until that review succeeds and the decisions above are recorded. This is a staging exercise, not a provider selection.

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

**Next step:** obtain the owner decisions above, then run the one-small-resource validation and record the approved source-ledger and immutable-archive evidence. Do not claim successful acquisition or production readiness until the real evidence exists.
