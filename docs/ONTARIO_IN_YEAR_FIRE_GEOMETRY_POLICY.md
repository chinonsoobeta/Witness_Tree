# Ontario in-year fire geometry policy

The 2026-08-14 Ontario in-year fire raw GeoJSON is retained unchanged. It has 188 features and nine `Ring Self-intersection` findings. This policy does not alter the raw snapshot, promote it to immutable storage, admit it to a source ledger, ingest it, or make it production eligible.

For a local-only derived release, 179 valid features are copied unchanged. Each of the nine identified `OBJECTID` values is repaired deterministically with GDAL SQLite `ST_MakeValid`; only non-empty Polygon or MultiPolygon output is accepted. The repair must retain the same `OBJECTID` and attributes, and its relative area delta must be at most `1e-9`. All nine repairs are far below that threshold, so none is quarantined.

The resulting GeoPackage has 188 features, 188 distinct object IDs, valid non-empty polygonal geometry throughout, and no loss or duplication. Its checksum-bound details and all nine audit rows are in [the machine record](../data/ontario-in-year-fire-geometry-policy-2026-08-14.json). The derived file stays external and local. A later [owner decision](CURRENT_WILDFIRE_OWNER_ADMISSION.md) approves the exact 179-unchanged plus nine-repair, zero-exclusion disposition and downstream scope, but activation remains blocked on exact immutable readbacks for both raw and derived objects.
