# Phase 1 NTEMS transformation runner

[`scripts/run-phase1-ntems-transform.mjs`](../scripts/run-phase1-ntems-transform.mjs) is the local-only runner for the four approved NTEMS raster scopes: annual land cover, forest harvest, canopy cover, and canopy height.

It is fail-closed and defaults to read-only preflight. Preflight verifies the separate owner scope approval, the exact specification/evidence checksums, every local source ZIP checksum and byte length, ZIP-member identity, and GDAL grid/data-type/nodata/class semantics. Raster members are read through GDAL's `/vsizip/` virtual path; the runner does not extract or rewrite source archives.

```sh
npm run check:phase1-ntems-transform
node scripts/run-phase1-ntems-transform.mjs --preflight --spec-id ntems-annual-land-cover-v1 --data-root /controlled/Witness_Tree-data
```

Execution is a separate gate. `--execute` requires the matching owner-local authorization record, its exact fixed UTC `--created-at`, the final runner SHA-256, the selected specification SHA-256, and every exact input archive SHA-256/byte length/member. The four checked-in per-scope authorizations each require their matching `--spec-id`; the checked-in [`data/phase1-ntems-execution-authorization.template.json`](../data/phase1-ntems-execution-authorization.template.json) remains deliberately non-authorizing.

```sh
node scripts/run-phase1-ntems-transform.mjs --execute \
  --spec-id ntems-annual-land-cover-v1 \
  --execution-authorization data/phase1-ntems-annual-land-cover-execution-authorization.json \
  --created-at 2026-08-26T00:55:28Z \
  --data-root /controlled/Witness_Tree-data \
  --output-root /controlled/Witness_Tree-data/derived/phase1
```

Execution uses new, non-overwriting output paths and atomic temporary-file publication. Each output sidecar records the fixed authorization timestamp, input bindings, deterministic GDAL command, tool versions, output SHA-256, byte length, and QA results. Sidecars claim transformation only; ingestion, release, production admission, eligibility, and external mutation remain false.

Transformation outputs remain non-admitted until independent readback and a separately validated production-admission record pass. Run `node --test tests/phase1-ntems-transform.test.mjs` for focused command, metadata, authorization, and fail-closed tamper coverage.
