# Phase 2 real loss-component inventory

The owner-approved versioned non-production run completed all 38 adjacent national loss pairs from 1984–1985 through 2021–2022. It produced 38 atomically finalized component-lineage JSONL files and one batch inventory in an owner-only local output directory. No partial file remains.

The exact readback record is [`data/phase2-real-loss-component-inventory-readback.json`](../data/phase2-real-loss-component-inventory-readback.json), and its portable [`summary`](../data/phase2-real-loss-component-inventory-summary.json) independently pins the readback and source-map bytes. A descriptor-bound streaming verifier independently rehashed every canonical source raster and every lineage file, parsed canonical JSONL, reconciled header/footer identity, loss-cell and component totals, and confirmed the exact final file set. Its bounded graph replay constructs the exact bipartite topology between prior-row components and current runs from their x-overlaps, derives each disconnected group, and requires exactly that group's non-canonical roots to alias directly to its minimum root. It rejects missing, extra, wrong-root or cross-group aliases, requires every emitted run to use its group's root, checks each finalized component's first cell and count against the resolved runs, and independently replays the ordered loss-run digest. The 38 lineage files contain 68,322,891,854 bytes; the inventory adds 32,968 bytes, for 68,322,924,822 retained bytes. They describe 1,384,027,417 loss cells, 303,530,909 four-connected components, 528,596,703 inclusive-x run records and 12,199,309 descending component aliases.

The final inventory inode records a 4,676.643920-second interval from shell redirection through preflight, processing and final write. That is below the approved 345,600-second limit. The executor used one sequential process, a 64 MiB GDAL cache, at most 64 raster rows, previous/current-row component state and zero scratch bytes. The retained lineage stayed below the approved 2 TiB cap. The full checksum and row-overlap-topology readback took 3,614.138533 seconds.

This closes the three execution blockers recorded by the earlier preflight: an exact 38-pair loss-cell inventory now exists, the stitcher completed every full-pair replay with per-component lineage, and actual elapsed/retained/scratch observations are recorded. It does not create patch polygons or normalized real events. Matching and precedence integration, all eight boundary intersections, aggregates, tiles, downloads, samples, statistics, independent scientific validation and release remain unexecuted. Every record remains `released: false` and `productionEligible: false`.

Independent audit accepted this component-lineage evidence at a fixed-rubric score of **54% (+3 percentage points from 51%)**. This execution is not a release, production-admission claim or production-maturity claim.

Run the portable evidence gate with:

```sh
npm run check:phase2-real-loss-component-inventory-evidence
```
