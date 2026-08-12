# Alberta AVI geometry repair-or-quarantine rule

This documents the deterministic rule that resolves the 608 invalid geometries found by the read-only profile of the verified Alberta Vegetation Inventory Crown staging archive, and the counts that were actually observed when the rule was run.

The rule was run. It changed no source geometry, wrote no derived geometry, and did not make the Alberta source production eligible, ingested, or promoted to immutable object storage. Alberta remains blocked from transformation and ingestion.

## Attribution

The Open Government Licence - Alberta version 2.2 was retrieved from [open.alberta.ca/licence](https://open.alberta.ca/licence) on 2026-08-12. It requires the user to acknowledge the source by including any attribution statement specified by the Information Provider and, where possible, to link to the licence. It then specifies the exact wording to use when the Information Provider specifies none:

> Contains information licensed under the Open Government Licence – Alberta.

No dataset-specific attribution statement is published in the [Open Government catalogue record](https://open.canada.ca/data/en/dataset/64b0e73a-da5f-4f7f-bca1-b656b6e86c94), and none appears in the archive's own FGDB metadata, whose only use constraint states that use of the information is governed by the terms of the Open Government Licence - Alberta in force as of the date of access. The default statement therefore applies verbatim, together with a link to the licence. It is recorded in [`data/staged-acquisitions.json`](../data/staged-acquisitions.json) with its licence URL, licence version, basis, and the sources it was verified against.

The en dash inside `Licence – Alberta` is part of the licence's own wording and is reproduced exactly.

## Tools actually used

The rule runs under the same external virtual environment as the existing profiler and Québec transformation script, at `../Witness_Tree-data/tools/geospatial-venv`.

| Tool | Version |
| --- | --- |
| Python | 3.14.6 |
| pyogrio | 0.13.0 |
| GDAL | 3.12.4 |
| Shapely | 2.1.2 |
| GEOS | 3.13.1 |
| NumPy | 2.5.2 |

`fiona`, `geopandas`, and the `ogrinfo` command line tool are not installed on this machine, so the rule uses only pyogrio, Shapely, and NumPy.

## The rule

[`scripts/repair-alberta-geometry.py`](../scripts/repair-alberta-geometry.py) reads every feature of every layer of the extracted File Geodatabase, in source FID order, in fixed-size chunks. It first verifies that the raw archive still hashes to the verified staging SHA-256 `e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093`, and that the layer set is exactly `AVI_Crown`, `AVI_PostInventoryHarvest`, `AVI_CrownIndex`, `AVI_PostInventoryHarvestIndex`.

Each feature is placed in exactly one class:

1. **Unchanged.** `shapely.is_valid` reports the source geometry as valid. Nothing is computed or written for it.
2. **Repaired.** The source geometry is invalid, and `shapely.make_valid(geometry, method="structure", keep_collapsed=False)` returns a geometry that satisfies every one of these conditions:
   - it is not null and not empty;
   - it is valid;
   - it is still `Polygon` or `MultiPolygon`;
   - the source area is strictly positive;
   - `abs(repairedArea - sourceArea) / sourceArea` is at most `1e-6`.
3. **Quarantined.** Every other feature, including missing geometry, empty geometry, a repair that collapses or stays invalid, a repair that changes the geometry to a non-polygonal type, and a repair whose relative area change exceeds the tolerance. Each quarantined feature is written to the quarantine record with its layer, its source FID, an exact reason, and, where they exist, its measured source area, repaired area, and relative area change.

The area tolerance is the substance of the rule. The structured repair is allowed to remove the degenerate self-touching sliver that makes a ring self-intersecting, because that is a numerically negligible correction. It is not allowed to silently reshape a polygon. Anything above one part in a million is treated as a semantic change and is held for human review instead.

Properties the rule guarantees, all checked at runtime by the script itself:

- **Deterministic.** There is no randomness, no parallelism, and no wall-clock or filesystem-order dependence. Features are visited in source FID order and GEOS structured validation is deterministic. Two consecutive runs produced identical counts and an identical quarantine record SHA-256 of `e633f56ac029c19e785e0699464fc3c9763f7162939920f539823cd00d4dde7b`.
- **Re-runnable.** The source is opened read only. The script refuses to overwrite an existing quarantine record or run record, so a re-run is directed at a new path and can be compared byte for byte against the previous one.
- **Lossless in intent.** No feature is dropped. A feature that cannot be repaired within the rule is recorded, not discarded, and the source archive keeps every feature it always had.
- **Fully counted.** The script raises rather than reporting if `unchanged + repaired + quarantined` fails to equal the input feature count for any layer or in total, or if the number of quarantine entries fails to equal the quarantined count.

## Counts observed on 2026-08-12

These are the counts the run actually produced, recorded in [`data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json`](../data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json).

| Layer | Features in | Invalid in | Unchanged | Repaired | Quarantined |
| --- | ---: | ---: | ---: | ---: | ---: |
| AVI_Crown | 788,810 | 587 | 788,223 | 587 | 0 |
| AVI_PostInventoryHarvest | 3,631 | 19 | 3,612 | 19 | 0 |
| AVI_CrownIndex | 1 | 1 | 0 | 1 | 0 |
| AVI_PostInventoryHarvestIndex | 1 | 1 | 0 | 0 | 1 |
| **Total** | **792,443** | **608** | **791,835** | **607** | **1** |

791,835 + 607 + 1 = 792,443, which equals the input feature count. Every one of the 608 invalid geometries reported `Ring Self-intersection` as its reason, matching the existing read-only profile exactly.

The largest relative area change among accepted repairs was 7.008939612391968e-14 in `AVI_Crown`, roughly eight orders of magnitude inside the tolerance, which is consistent with removing a degenerate sliver rather than reshaping a polygon.

## The quarantined feature

One feature was quarantined: `AVI_PostInventoryHarvestIndex` FID 1, the single index footprint polygon of the post-inventory harvest layer. Its structured repair moved area from 560,238,430.5770779 to 544,103,360.3239112 square units, a relative change of 0.028800363153499882, which is about 2.88 percent and roughly 28,800 times the tolerance. That is a real change in the covered footprint, not a numerical sliver, so the rule holds it rather than accepting it.

The quarantine record lives outside Git at `../Witness_Tree-data/derived/alberta-avi-geometry-repair-v1/2026-08-12/quarantine.json`. It is 1,075 bytes with SHA-256 `e633f56ac029c19e785e0699464fc3c9763f7162939920f539823cd00d4dde7b`. `AVI_PostInventoryHarvestIndex` is an index or footprint layer rather than an inventory or harvest observation layer, so quarantining it does not remove any vegetation or harvest record. Deciding what to do with it is a source-owner question and is not closed here.

## How to re-run it

```sh
../Witness_Tree-data/tools/geospatial-venv/bin/python3 scripts/repair-alberta-geometry.py \
  --raw-archive /absolute/path/to/AlbertaVegetationInventoryCrown.zip \
  --source /absolute/path/to/AlbertaVegetationInventoryCrown.gdb \
  --quarantine /absolute/path/to/a/new/quarantine.json \
  --run-record /absolute/path/to/a/new/run-record.json
```

All four paths must be absolute, and the two output paths must not already exist.

## What this does not do

- It does not write a repaired Alberta dataset. Alberta is not admitted to transformation, so producing derived geometry would overstate its status.
- It does not ingest, promote to immutable object storage, or make anything production eligible.
- It does not close the pending decision in [`docs/TRANSFORMATION_CONTRACT.md`](TRANSFORMATION_CONTRACT.md). That contract requires a policy and attributed evidence to be reflected in a newly verified profile, and the checked-in profile in [`data/staged-geospatial-profile.json`](../data/staged-geospatial-profile.json) still records the 608 invalid source geometries, which remains accurate, because the source was not modified.
- It does not obtain legal review of the attribution wording. The wording is now taken from the licence text and the publisher metadata rather than left unresolved, but the legal review listed in [`docs/EXTERNAL_GATES.md`](EXTERNAL_GATES.md) is still open.
