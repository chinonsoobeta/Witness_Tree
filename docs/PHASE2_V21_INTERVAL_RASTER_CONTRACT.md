# Version 2.1 selected snapshots and interval rasters

This local, executable contract pins the eleven required snapshot years (1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, and 2022) and the ten adjacent intervals. It prevents a common semantic error: an interval cannot be represented as a second endpoint image.

[`lib/phase2/interval-raster.ts`](../lib/phase2/interval-raster.ts) aggregates a sequence of adjacent annual detected-loss cells. A `1` means loss was observed in at least one annual pair in the whole selected interval. A `0` is allowed only when every pair explicitly reports no loss. If no loss is observed but one or more pairs are nodata, the result remains `255` (Unknown). A positively observed loss remains `1` even if another pair is Unknown; this does not imply complete interval coverage.

The schedule and non-production boundary are stored in [`data/phase2-v21-raster-contract.json`](../data/phase2-v21-raster-contract.json) and checked with:

```sh
npm run check:phase2-v21-raster-contract
```

This does not create output rasters, admit any source, perform a boundary intersection or aggregate, create tiles/downloads, make an accuracy claim, release anything, or make any output production eligible. Before a real run, every input must be admitted and checksum-bound, and each output must carry the input/output hashes, method and code versions, grid/CRS/geotransform/nodata, byte length, coverage, timing, and resource measurements. Those remain separate Phase 2 gates.
