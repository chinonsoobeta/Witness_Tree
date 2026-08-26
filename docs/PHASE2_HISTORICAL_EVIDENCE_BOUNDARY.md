# Phase 2 historical evidence boundary

The repository retains audited evidence from the historical `phase2-real-national-1984-2022-v1` execution: 39 annual forest masks, 38 adjacent annual loss rasters, two disturbance rasters, and a 38-pair component-lineage inventory. The canonical local output directory is recorded in [`data/phase2-historical-evidence-status.json`](../data/phase2-historical-evidence-status.json).

This is historical, versioned, nonproduction evidence only. It uses the earlier 39-year annual schedule and is not a Version 2.1 run. It does not provide the required Version 2.1 11 selected snapshots and 10 whole-interval output rasters, source admission, scientific validation, boundary comparison, boundary aggregates, release approval, or production admission.

`npm run check:phase2-historical-evidence-status` validates the boundary and confirms the recorded historical evidence paths contain all 79 raster files and all 38 component-lineage files. It intentionally does not claim that those payloads are suitable for release or that the historical method can be substituted for the Version 2.1 contract.

The retained historical runner, preflight, and readback tools are local audit tools. They require the explicitly named historical data directory and are intentionally not part of hosted CI. The runner writes only a new, exact historical output directory; it is not a Version 2.1 executor.
