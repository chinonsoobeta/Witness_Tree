# Alberta PLVI full derived release — local readiness only

The full derived release was built as a closed join: 179,075 already-valid raw features were copied without the repair operation, and only the 12 recorded invalid `POLYGON_ID` values were replaced from the full-attribute MakeValid patch. It has 179,087 output features—the same as the raw source—with 63 attributes and EPSG:3400.

All output geometry is nonempty, valid, and polygonal: 179,086 `POLYGON` and one `MULTIPOLYGON`. The MultiPolygon is a valid repair result; it is not a non-polygonal geometry. The patch’s maximum relative area delta is `3.04060011759907e-12`, below the `1e-9` rule.

The source has one pre-existing duplicate `POLYGON_ID` (41405, multiplicity two). It is preserved rather than silently deduplicated. A sorted, attribute-only comparison of every copied valid feature has the same SHA-256 on source and release: `fbbaf3cea2466c78223ba1b7557708acae1cd7a7de932fd6cdb1b62fb76d13c6`.

The derived GeoPackage remains external and local at `../Witness_Tree-data/derived/alberta-plvi-full-repair-v1/2026-08-14/alberta-plvi-full-repaired-closed-join.gpkg`, 899,551,232 bytes, SHA-256 `5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b`.

This does **not** grant immutable promotion, owner admission, ingestion, or production use. The machine gate lists the precise remaining approvals in [`data/alberta-plvi-full-release-readiness.json`](../data/alberta-plvi-full-release-readiness.json).
