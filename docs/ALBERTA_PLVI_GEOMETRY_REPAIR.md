# Alberta PLVI geometry repair patch

The checksum-bound PLVI archive contains 179,087 polygons. Read-only validation found 12 invalid polygons: each was a `Ring Self-intersection`, all had positive published `Shape_Area`, and every invalid `POLYGON_ID` is listed in the recorded repair run.

The repair rule is the smallest bounded intervention: `GDAL SQLite ST_MakeValid(geometry)` is applied only to those 12 identifiers. A repair is accepted only when it remains a valid `Polygon` in EPSG:3400 and differs from its publisher `Shape_Area` by at most `1e-9` relatively. The observed maximum was `2.64347785840858e-12`; all 12 repairs passed. The separate patch has 12 features, no invalid/non-polygon geometry, and SHA-256 `c1e8a3fe57e3562e72ab4307de6e9bdb1d16f4c97e29d3a7048b7ed7cb85abac`.

The complete, machine-checked lineage—including all source IDs, reasons, areas, tolerance, raw SHA-256, patch size, and patch SHA-256—is [`data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json`](../data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json).

No source feature was silently lost: the patch contains each of the 12 invalid source identifiers exactly once, while the original 675,544,895-byte raw ZIP remains unchanged. The patch is local external evidence only. It is **not** immutable, owner-admitted, ingested, or production eligible; applying it to a full derived PLVI release still needs a separately approved transformation and ownership decision.
