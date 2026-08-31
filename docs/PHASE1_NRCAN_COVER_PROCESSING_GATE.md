# Phase 1 NRCan cover processing gate

The machine record [`data/phase1-nrcan-cover-processing-gate.json`](../data/phase1-nrcan-cover-processing-gate.json) is the historical 2026-08-21 snapshot for the two named Phase 1 rows. Its canopy-cover specification, run, and output facts are now superseded by the dated [`canopy-cover successor`](../data/phase1-nrcan-cover-processing-gate-supersession-2026-08-31.json); the original record remains unchanged.

- `ntems-annual-land-cover` has 39 remotely retained VLCE2 payloads and sidecars, a verified common 30 m grid, and a checked defect rule for the 1991 and 2005 empty attribute tables. The grid record is read-only evidence; it does not perform a forest-mask operation.
- `ntems-canopy-cover` now has a checksum-bound read-only raster profile in [`data/nrcan-canopy-cover-profile.json`](../data/nrcan-canopy-cover-profile.json). The exact local ZIP passes `unzip -t`, and its Float32 2022 raster matches the recorded 30 m dimensions and geotransform. The source describes a strategic assessment metric, not an operational management product.

At the time of the snapshot, no repository-controlled Phase 1 production-admission target transformation specification or derived output existed for either row. The repository now contains the unapproved `ntems-canopy-cover-v1` execution specification and one exact checksum-bound canopy-cover output. Those later execution facts do not create a production-admission target specification and do not authorize ingestion, release, production admission, or production eligibility. The historical gate therefore retains `namedTransformations: []`; the successor records the later output while keeping both production flags false.

Run the checks with:

```sh
npm run check:nrcan-canopy-cover-profile
npm run check:phase1-nrcan-cover-processing-gate
```

At the time of this historical gate audit, the score was **14.25/31 raw credits and 38.7903226%**. This profile/gate work added no raw credit and no production claim. Before a Phase 1 target transformation can run, the owner/technical production-method decision, exact versioned specification, output checksum, full-resolution validation, ingestion evidence, release approval, and separate production-admission decision must all be recorded.
