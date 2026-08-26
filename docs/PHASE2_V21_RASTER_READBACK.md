# Phase 2 Version 2.1 raster readback

This is an explicit local, non-CI readback after the complete V2.1 batch exists. It is not a production admission, release, validation, boundary aggregation, or vector-generation gate.

The readback completed successfully on 2026-08-25 for all 21 outputs. The checksum-bound repository record is [`data/phase2-v21-raster-readback-evidence.json`](../data/phase2-v21-raster-readback-evidence.json); its offline CI check is `npm run check:phase2-v21-raster-readback`. All admission, release, boundary-aggregation, external-action, vector, and production-eligibility claims remain false.

Run it only after the runner has completed without `RUN_FAILED_NON_EVIDENCE.json`:

```sh
npm run readback:phase2-v21-raster-first -- \
  /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data \
  /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/phase2-v21-raster-first-1984-2022-v1
```

It fails closed unless the directory contains exactly eleven selected snapshots and ten whole-interval outputs; every interval contains every adjacent annual loss input; output, sidecar, and input bytes match their lineage; the current runner and worker hashes match the sidecars; GDAL observes the specified Byte/VLCE2 grid/CRS/nodata; all timing and resource telemetry is present and positive where meaningful; and every admission/release/boundary/external/vector claim is false.

On success the command creates `data/phase2-v21-raster-readback-evidence.json` with exclusive creation. The record intentionally contains only relative output names, byte lengths, and hashes: it excludes absolute workstation and source-input paths. Do not run it in CI and do not delete or overwrite a previous evidence record to manufacture a new attestation.
