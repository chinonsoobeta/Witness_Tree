# Phase 1 NRCan cover processing gate

The machine record [`data/phase1-nrcan-cover-processing-gate.json`](../data/phase1-nrcan-cover-processing-gate.json) reconciles the two named Phase 1 rows that are locally actionable but still downstream-blocked:

- `ntems-annual-land-cover` has 39 remotely retained VLCE2 payloads and sidecars, a verified common 30 m grid, and a checked defect rule for the 1991 and 2005 empty attribute tables. The grid record is read-only evidence; it does not perform a forest-mask operation.
- `ntems-canopy-cover` now has a checksum-bound read-only raster profile in [`data/nrcan-canopy-cover-profile.json`](../data/nrcan-canopy-cover-profile.json). The exact local ZIP passes `unzip -t`, and its Float32 2022 raster matches the recorded 30 m dimensions and geotransform. The source describes a strategic assessment metric, not an operational management product.

No repository-controlled Phase 1 production-admission target transformation specification or derived output exists for either row. A separately approved Phase 2 nonproduction method exists, but it does not supply or imply the Phase 1 target method, output, ingestion, release, or admission gates. The gate therefore records `namedTransformations: []`, leaves transformation and ingestion blocked, and keeps release, production admission, and production eligibility false. It does not infer a forest mask from the 13-class VLCE2 table, invent a canopy-cover clipping/masking method, treat raw archive evidence as transformed data, or use the example-only ingestion contract as a production adapter.

Run the checks with:

```sh
npm run check:nrcan-canopy-cover-profile
npm run check:phase1-nrcan-cover-processing-gate
```

At the time of this historical gate audit, the score was **14.25/31 raw credits and 38.7903226%**. This profile/gate work added no raw credit and no production claim. Before a Phase 1 target transformation can run, the owner/technical production-method decision, exact versioned specification, output checksum, full-resolution validation, ingestion evidence, release approval, and separate production-admission decision must all be recorded.
