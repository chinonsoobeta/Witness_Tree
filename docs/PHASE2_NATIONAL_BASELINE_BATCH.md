# Historical Phase 2 national baseline batch

This historical increment implemented two owner-independent Phase 2 processing batches: deterministic annual forest masks and forested-hectare denominators, followed by a deterministic annual detected-change spine over those masks. It is retained as versioned nonproduction evidence and is not the Version 2.1 eleven-snapshot, ten-interval execution.

Run it with:

```sh
npm run run:phase2-national-baseline-batch -- manifest.json new-output-directory
```

The manifest must bind the exact method-parameter file, method version and canonical parameter SHA-256, plus the forest-definition version, data version, exact input SHA-256 values, and the explicit land-cover classes used as forest. The batch refuses a method/class mismatch. It requires one metre-based, north-up grid for both spatial inputs, a continuous annual series, one cell value per pixel, safe fractional intersections, and a boundary edition. It never reprojects a categorical raster. Outputs are sorted, stable JSON written only to a new directory, with a lineage file binding the manifest, all three inputs, and every output checksum.

The output aggregate carries the forested-hectare denominator, year, boundary edition, method version, forest-definition version, data version, and national-baseline coverage grade. Nodata remains nodata in the mask and never becomes non-forest.

The change batch detects only a valid `forest -> non-forest` transition between adjacent years. Four-neighbour cells become one patch. Each patch has a stable checksum-derived identifier, a grid-CRS `MultiPolygon` with one non-overlapping cell polygon per source cell, exact cell lineage, area derived from the metre-based grid, and normalized non-production event metadata. Any transition touching nodata is excluded from detected change and listed explicitly as unresolved.

## Honest boundary

This batch is deliberately non-production and requires `productionEligible: false`. Its fixture uses a small explicit class crosswalk only to prove the executable path. Its patch geometry is synthetic grid-cell geometry, not a production polygonized NTEMS output. It does not approve a production forest-class crosswalk, transform the archived NTEMS bytes, ingest a production event, attribute harvest or fire, produce tiles, or close any Phase 2 exit criterion. The current Phase 1 source ledger explicitly leaves the NTEMS annual-land-cover and CA Forest Harvest transformations and ingestion blocked pending separate owner decisions.
