# BC Wildfire current-perimeters staging

The plan row `bc-wildfire` is represented by one checksum-bound local snapshot of the official BC Wildfire Service `BCWS_FirePerimeters_PublicView/FeatureServer/0` layer. The official catalogue and public ArcGIS item identify Open Government Licence – British Columbia, current-season coverage including active and inactive fires, and nightly operational refresh.

The raw GeoJSON is outside Git at `Witness_Tree-data/raw/bc-wildfire-fire-perimeters/2026-08-14/bc-wildfire-fire-perimeters_2026-08-14.geojson`. It is 4,813,292 bytes with SHA-256 `46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83`. The service declared a 1,000-record limit and the single response contains 217 features, so no paging or merge was used. Read-only GDAL/GEOS profiling found EPSG:4326 polygon and multipolygon geometries, no missing or empty geometries, and two invalid nested-shell polygons (`G70362` and `V10755`) retained without repair.

This is local staging only: not immutable storage, a live operational feed, a complete incident record, transformed data, ingested data, or production output. The publisher says the data are reference-only, may not reflect the most current fire situation, and individual-fire update frequency varies. A refresh must stage a separate response and repeat count, checksum, profile, attribution, invalid-geometry, and retention checks.

The raw snapshot remains unchanged. [`BC_WILDFIRE_GEOMETRY_POLICY.md`](BC_WILDFIRE_GEOMETRY_POLICY.md) records a separate local derived release: it retains 216 usable features by repairing G70362 within the stated tolerance and quarantines V10755. This policy does not grant archival, owner-admission, transformation, ingestion, release, or production status.
