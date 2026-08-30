# Per-cell annual series

The countable half of the per-cell forest-loss product, covering all 38 annual
intervals from 1984-1985 to 2021-2022.

## Why this exists separately from the tiles

The published PMTiles archives are a drawing. Below the maximum zoom the tiler
simplifies geometry and, where a tile would otherwise be unusable, drops the
smallest patches. Adding up what a tile contains therefore returns a number
short by an amount that varies with zoom and feature density. That is a
property of the artifact, not a policy about it, which is why
`data/phase2-per-cell-tile-release.json` records `countable: false` and why the
gate refuses to let it become true.

The run store behind those tiles is exact. It records, per interval, how many
30 m cells were detected as loss, reconciled patch for patch against the
component inventory. One cell is 30 m by 30 m, which is 0.09 ha exactly, so the
hectares in this series are arithmetic on an exact count rather than a
measurement of a generalized polygon.

Counting from the inventory and drawing from the tiles is the whole design.

## What it records

`data/phase2-per-cell-annual-series.json`, built by
`scripts/build-phase2-per-cell-annual-series.mjs` and gated by
`npm run check:phase2-per-cell-annual-series`.

| Field | Meaning |
| --- | --- |
| `cellCount`, `hectares` | Detected loss in the interval, exact count and its area |
| `harvestCells`, `fireCells` | Cause split from the national disturbance rasters |
| `unattributedCells` | Detected loss the disturbance record does not attribute |
| `disturbanceYearsMissing` | Disturbance years absent for that interval |
| `patchesWithBothCauses` | Patches containing both harvest and fire cells |

Totals across all 38 intervals: 1,384,027,417 cells, 124,562,467.53 ha detected
loss, of which 21,845,952.18 ha is recorded harvest, 44,116,160.40 ha is
recorded fire, and 58,600,354.95 ha carries no recorded cause.

## What it is not

**Not complete.** The land cover source writes 0 outside the extent it maps, so
unmapped ground cannot be told apart from mapped ground with no loss. Every
figure is a minimum. See `PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md`.

**Not reviewed.** No expert review of this product was performed. The
requirement was retired by the owner on 30 August 2026 at 0/100 in every
province, with no approved reviewer roster and no recorded results. Retirement
withdrew the requirement; it did not satisfy it. See
`data/phase2-expert-review-retirement-2026-08-30.json`.

**Not checked against the ground.** Nothing here has been compared with
conditions in the field.

The 1984-1985 interval additionally has no disturbance record for 1984, so its
cause split is incomplete on that side rather than genuinely unattributed.

## The invariant that matters

The figure on screen must describe the patches on screen. `perCellAnnualForYear`
repeats the year-to-interval rule in `archiveForYear` deliberately, and
`tests/explore-per-cell-annual.test.ts` asserts the two agree for every year
from 1984 to 2022. A disagreement would put a total beside a drawing of a
different year, which is quieter and worse than showing nothing.
