# Québec stand-copy runner

`scripts/run-qc-stand-copy.mjs` is the local, fail-closed runner for the two
approved Québec Phase 1 stand-copy scopes:

* `qc-current-ecoforest`
* `qc-original-current-inventory`

It is read-only by default. A preflight verifies the immutable packet, owner
scope approval, and specification bytes; the raw archive and extracted
GeoPackage checksums and byte counts; the exact archive member; layer, field,
CRS, FID, and feature count; and missing, empty, and invalid geometries. It
does not infer semantics or execute joins. The operation is a one-layer copy
with the source CRS and geometry bytes preserved. The current-ecoforest source
profile is also bound to its recorded checksum.

```sh
node scripts/run-qc-stand-copy.mjs --scope qc-current-ecoforest
node scripts/run-qc-stand-copy.mjs --scope qc-original-current-inventory
```

`--execute` is intentionally a separate gate. It requires
`--execution-approval FILE`, where the future record must use
`witness-tree/phase1-transformation-execution-approval/1`, bind the exact
packet, scope-only owner approval, specification, runner SHA/method version,
and preflighted input hashes, and set execution authorization true while
leaving ingestion, release, production admission, eligibility, and external
mutation false. No such record is present in this repository. The runner will
refuse execution until one exists and matches exactly.

When authorized, `ogr2ogr` writes to a new temporary GeoPackage. A standard
library SQLite helper appends `source_fid`, the deterministic
`output_record_id`, `source_raw_sha256`, and `source_layer`; it compares source
and output row/geometry fingerprints and performs a second deterministic run.
Only after both runs match are the artifact and canonical sorted-key JSON
sidecar atomically renamed into the requested output directory. Existing
artifacts are never overwritten. The sidecar contains no timestamps,
hostnames, process IDs, or absolute local paths and makes no admission or
release claim.

Do not use this runner for the blocked fourth-inventory scope, and do not treat
its output as ingested, released, or production-admitted evidence.

After a completed pair is published, use the separate read-only
[`verify-qc-stand-copy-readback.mjs`](../scripts/verify-qc-stand-copy-readback.mjs)
for post-publication checks. Its default is a no-GDAL/no-SQLite presence
preflight; `--verify` is required for the actual `ogrinfo`/SQLite readback,
and `--write-evidence` is required before it creates a write-once evidence
JSON. The readback verifier does not invoke this runner or make an admission
claim.
