# Phase 2 national baseline batch

This increment implements the first owner-independent Phase 2 processing batch: deterministic annual forest masks and forested-hectare denominators from a checksum-bound land-cover grid and a versioned fractional boundary-cell crosswalk.

Run it with:

```sh
npm run run:phase2-national-baseline-batch -- manifest.json new-output-directory
```

The manifest must name the method, forest-definition version, data version, exact input SHA-256 values, and the explicit land-cover classes used as forest. The batch does not invent that class crosswalk. It requires one metre-based, north-up grid for both inputs, a continuous annual series, one cell value per pixel, safe fractional intersections, and a boundary edition. It never reprojects a categorical raster. Outputs are sorted, stable JSON written only to a new directory, with a lineage file binding the manifest, both inputs, and both output checksums.

The output aggregate carries the forested-hectare denominator, year, boundary edition, method version, forest-definition version, data version, and national-baseline coverage grade. Nodata remains nodata in the mask and never becomes non-forest.

## Honest boundary

This batch is deliberately non-production and requires `productionEligible: false`. Its fixture uses a small explicit class crosswalk only to prove the executable path. It does not approve a production forest-class crosswalk, transform the archived NTEMS bytes, ingest an event, vectorize a change patch, attribute harvest or fire, produce tiles, or close any Phase 2 exit criterion. The current Phase 1 source ledger explicitly leaves the NTEMS annual-land-cover and CA Forest Harvest transformations and ingestion blocked pending separate owner decisions.
