# BC wildfire current-perimeter geometry policy

The exact raw snapshot has two invalid `MULTIPOLYGON` features: `G70362` and `V10755`, both reported by GEOS as nested shells. A read-only `ST_MakeValid` trial produced valid, nonempty polygonal output and retained both IDs, but the relative area deltas were `0.0000019830365765251236` and `0.03167100456325357`. The latter exceeds the 0.01% tolerance by a wide margin.

The policy is per-feature and deterministic: G70362 is repaired because its delta is below tolerance, while V10755 is quarantined. The 216-feature derived GeoPackage copies 215 valid raw features unchanged and replaces only G70362; it has zero invalid or empty geometries. Geometry-dependent coverage excludes one of 217 features. The raw archive remains unchanged. A later [owner decision](CURRENT_WILDFIRE_OWNER_ADMISSION.md) approves this exact disposition, but activation remains blocked on exact immutable readbacks for both raw and derived objects.
