# Phase 2 raster-first boundary aggregation

`scripts/phase2_zonal_aggregate.py` produces boundary summaries from an
aligned forest-mask and Phase 2 change raster without vectorizing either
raster. It processes one
boundary feature at a time, transforms that bounded geometry to the raster CRS
when necessary, then rasterizes it only within finite pixel windows intersecting
its extent. It never emits national per-cell geometry, polygons, or joins.
For shapefile input, GDAL uses the format's specified ring orientation
(`OGR_ORGANIZE_POLYGONS=ONLY_CCW`) instead of performing quadratic containment
inference across every detailed cartographic ring. The sidecar records this
read policy; geometry is not simplified or dropped.

Both inputs must be exact aligned Byte grids with values `0`, `1`, and `255`
only, with `255` as nodata. Only a forest-mask value of `1` is a forested-cell
denominator; a change-raster `0` is merely no observed change and is never
proof of forest. In a multi-year interval, forest can appear after the
first-year denominator snapshot and then be lost. That observed loss is
reported separately as `observedLossOutsideFirstYearForestHectares` and is
excluded from the numerator, denominator, and percentage; it is never silently
reclassified as first-year forest loss. A `255` in either required input remains Unknown,
is excluded from the denominator, and produces a partial coverage grade. The
worker emits known forested hectares, loss hectares, outside-denominator loss,
unknown-required-input hectares, and a loss percentage only when the known denominator is positive.
It rejects geographic/non-metre CRSs rather than computing false hectares.

Every output sidecar binds the boundary edition and identifier field; forest-mask, change-raster,
time, and source versions; both raster hashes; CRS/reprojection evidence;
coverage outcome; output hash; code version and worker hash; algorithm parameters;
elapsed time; peak RSS; maximum allocated scratch-file bytes; and the Python, GDAL, and
NumPy versions. A sidecar cannot claim production unless its boundary is authoritative and
the input is explicitly admitted. This repository contract currently declares
no admitted national boundary aggregates and makes no production claim.

## Completed local province/territory pilot

The local province/territory run applied the 2020 forest
snapshot and the complete 2020–2022 interval-loss raster to all 13 Statistics
Canada 2021 province/territory cartographic boundaries. It produced 13 unique
`PRUID` rows. The output is 3,131 bytes with SHA-256
`ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d`.
The evidenced run took 438.804 seconds, peaked at 3,912,531,968 RSS bytes,
and used at most 10,514,432 allocated scratch bytes. Its sidecar binds the
worker, inputs, boundary ZIP, environment, output, parameters, and all rows.

Repository evidence is in
`data/phase2-v21-province-zonal-pilot-evidence.json`. Run
`npm run check:phase2-v21-province-zonal-pilot` for the static evidence gate
and `npm run readback:phase2-v21-province-zonal-pilot` on the owner machine for
the exact external-artifact readback. This historical run evidence remains
unchanged and non-admitting; the separate 2026-08-26 limited admission record
binds and admits its exact inputs and aggregate. Release and production remain
false, and Phase 2 is 2/4 while expert review and comparisons remain open.

Example local, non-production execution:

```sh
python3 scripts/phase2_zonal_aggregate.py \
  --forest-mask forest-mask.tif --change-raster interval-change.tif --boundaries districts.geojson \
  --output aggregates.json --sidecar aggregates.sidecar.json \
  --boundary-edition local-fixture --forest-mask-version fixture-v1 --change-raster-version fixture-v1 \
  --time-version 2020-2022 --source-version fixture-v1 --code-version local-source-revision \
  --boundary-classification illustrative --admission-status not-admitted
```
