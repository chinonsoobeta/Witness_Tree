# Place cause and recovery measurements

Measured 2026-11-10. This is a measurement record, not a publication. It is not
expert reviewed, not a formal release and not production eligible, and no page
reads it. Publishing any of it needs an owner decision (see "What publication
would rely on").

## What was measured

For every boundary the place pages have, in 30 m cells:

- recorded harvest cells and recorded fire cells for each year 1985 to 2022;
- the cause of each lost cell's latest loss;
- whether the land was treed again after the latest loss;
- the Unknown and unmapped cells, carried through every figure.

The boundaries are the four provinces (from the province masks the published
province figures used), the 2,291 published census subdivisions, the 44
economic regions, the 280 federal ridings of British Columbia, Alberta, Ontario
and Quebec (2023 representation order) and the 431 provincial ridings (BC 2023,
93; Alberta 2019, 87; Ontario 2022, 124; Quebec 2026, 127).

An economic region is not measured from its own boundary. It is the sum of all
3,033 census subdivisions assigned to it by
`derived/phase3-interval-place-zonal-v1/csd-to-economic-region.json` (point on
surface), which is how `data/phase3-economic-region-interval-measurements.json`
is built. Reserves and settlements count toward their region; they are not
published on their own.

## Files

| Role | Path |
| --- | --- |
| Measuring worker | `scripts/place_cause_recovery_zonal.py` |
| Launch script | `scripts/run-place-cause-recovery-zonal.sh` |
| Outputs (data root) | `derived/place-cause-recovery-zonal-v1/`: seven measurement files, each with a provenance sidecar and a completion digest, `input-digests.json`, `spot-checks.json` |
| Builder | `scripts/build-place-cause-recovery-measurements.mjs` |
| Record | `data/place-cause-recovery-measurements.json` |
| Checker | `scripts/check-place-cause-recovery-measurements.mjs` |
| Test | `tests/place-cause-recovery-measurements.test.mjs` |
| Spot checks | `scripts/place_cause_recovery_spot_check.py` |

Rasters read: the 39 VLCE2 land-cover years and the NTEMS harvest and fire
change-year rasters (`derived/bc-annual-series-20260909/`), the phase 2 forest
mask for 1984 and the 38 annual loss rasters
(`derived/phase2-real-national-1984-2022-v1/`), and the VLCE2 mapped extent.
They were copied to the internal disk for speed. All 81 copies were hashed
before the run, and every SHA-256 and byte length equals its entry in
`data/staged-acquisitions.json` or in the phase 3 census-subdivision
provenance. Boundary files are the ones the phase 3 place and riding runs used,
read from the data root.

## Rules

These are the published province figures' own definitions. The trajectory
walk, state codes and cause rule are imported from
`scripts/phase4_condition_recovery_v3.py`, not copied.

- **Treed** means VLCE2 class 210, 220 or 230 that year (set A).
- **Unknown** means any year whose class is off the VLCE2 legend. Such a cell
  is excluded from the whole record, and is never counted as lost, as not lost,
  or as zero.
- **Lost** means treed in one year and not treed the next, at least once. The
  loss year is the later year. Only the latest loss of a cell is classified.
- **Cause.** The cause is fire when the NTEMS fire year is within one year of
  the latest loss year, and harvest when the harvest year is. It is both when
  both are, and not recorded otherwise. The four groups are disjoint and there
  is no precedence between them, exactly as `cause_of` in the v3 worker defines
  them.
- **Treed again** means five consecutive treed years after the latest loss. The
  record keeps each lost cell's state (treed again, no return, or a return
  under way that is not yet five years old) and its cause, split at 2018: a
  latest loss from 2018 on cannot show five treed years by 2022.
- **Harvest and fire by year** counts the cells whose recorded year is that
  year, whatever their land cover, as the province series counts them. 1984
  has no column: no change can be dated to the first image, so it is Unknown,
  never zero.

The three regrowth figures the checker derives are:

- treed again: every latest loss with five treed years;
- not treed again: a latest loss before 2018 with no return by 2022;
- cannot be judged: a latest loss from 2018 on, or a latest loss before 2018
  whose return had started but was not yet five years old in 2022.

This three-way split is a proposal for review, not an owner decision. The raw
state, period and cause counts are stored so a different split can be derived.

## Two loss figures, and which one these counts use

The place pages' "lost at least once" (`unionLossCells`) and the v3 "lost" are
different quantities. The run recounted the phase 3 union from the phase 3
rasters for every boundary, and also counted cell by cell where it differs from
"lost under v3 and treed in 1984".

- **Union, but not v3 lost:** 0 cells in every set.
- **Union, but not v3 lost and treed in 1984:** 0 cells.
- **v3 lost, but not in the union:** these cells are exactly the v3 losses of
  cells that were not treed in 1984 (most are land that became treed later and
  was then lost).

| Set | v3 lost cells | Phase 3 union cells | Lost, not in union | Share |
| --- | ---: | ---: | ---: | ---: |
| Provinces | 612,578,580 | 499,725,535 | 112,853,045 | 18.4% |
| Places (2,291) | 609,405,249 | 497,556,899 | 111,848,350 | 18.4% |
| Economic regions | 612,578,580 | 499,725,535 | 112,853,045 | 18.4% |
| Federal ridings | 612,610,636 | 499,745,176 | 112,865,460 | 18.4% |
| BC ridings | 138,627,397 | 120,270,281 | 18,357,116 | 13.2% |
| Alberta ridings | 123,756,842 | 75,994,494 | 47,762,348 | 38.6% |
| Ontario ridings | 112,184,090 | 103,142,117 | 9,041,973 | 8.1% |
| Quebec ridings | 238,741,237 | 200,806,895 | 37,934,342 | 15.9% |

By province, 38.6% of Alberta's v3 lost cells are not in the union. The figure
is 15.8% for Quebec, 13.2% for BC and 8.1% for Ontario. Among places with at
least 10,000 lost cells, the share runs as high as 92.3% (2414018).

**Every cause and treed-again count in the record uses the v3 lost base**, the
same base as the published province figures. A page that put these counts
beside `unionLossCells` would be mixing two bases, and the cause shares would
not divide the union. `lostTreedIn1984Cells` is stored so that a page can show
the relation.

## Check results

1. **Same loss, cell for cell.** `phase3UnionLossCells`, `phase3KnownForestCells`,
   `phase3UnknownCells` and `unmappedCells` equal the existing records for all
   2,291 places, 44 regions, 280 federal and 431 provincial ridings, and the
   four provinces (province span record). That is 3,050 boundaries, 0
   differing, and 2,496,966,932 union cells in all. In every set the per-cell
   mismatch between the union and "v3 lost and treed in 1984" is 0, and the
   mismatch between the two Unknown masks is 0.
2. **Parts add to the whole.** All 3,050 rows add up exactly:
   - cells are Unknown plus known;
   - known is never treed, plus treed and not lost, plus lost;
   - lost is the sum of the period, state and cause cells;
   - no loss from 2018 on is treed again;
   - regrowth's three parts add to lost.

   No harvest or fire is dated in unmapped cells (0), and none in Unknown
   cells (0). No harvest or fire value lies outside 0 or 1985 to 2022 (0).
3. **Boundaries add to provinces.** The four province rows equal, without
   exception:
   - `data/phase4-condition-recovery-v3.json` set A: mask, Unknown, known,
     never treed, ever treed, lost, recovered, not recovered, unconfirmed, and
     recovered after any loss;
   - the lost cells by cause in `data/phase4-condition-recovery-cause-and-check.json`
     (its recovered counts are v2's three-year rule and are not compared);
   - `data/harvest-fire-province-annual-series.json`: land cells, the Unknown
     (unmapped) cells, and harvest and fire for each year.

   The sums of the economic regions equal the province rows in all 112 values,
   in all four provinces, with no difference to explain.
4. **Hand spot checks.** A direct masked count that shares no code with the
   worker reproduces its row in all 112 values for each of:
   - census subdivision 4803001 (Alberta; 3,880,476 cells, of which 3,606,719
     are unmapped; 61,116 lost);
   - federal riding 59019, Nanaimo-Ladysmith (3,049,993 cells; 607,498 lost);
   - Quebec provincial riding 787, Lotbinière-Frontenac (3,684,303 cells;
     687,003 lost).

## Limits

- This is not expert reviewed, not ground-truthed, not a formal release and
  not production eligible. The French text for any page is unwritten.
- Treed again is a land-cover statement. It is not NFI forest and not
  regrowth to a stand. The BC RESULTS check under the three-year rule agreed
  61% (below the 80% target) and points to understated recovery. A five-year
  rule is stricter.
- Set B (with treed wetland, class 81) and the treed-wetland share that the
  2026-09-23 decision requires beside Alberta and Ontario were not measured
  per boundary.
- Unknown here equals unmapped in every province: every Unknown cell is class 0
  on the mapped extent's nodata, and no cell has nodata 255. That holds for
  these inputs and is not a rule.
- The riding sets do not tile the provinces. They are drawn from other
  boundary files, some with water and coastline beyond the 2021 cartographic
  province boundary, so their sums are not province figures. Lost cells summed
  over a set, minus the province's:
  - BC ridings +15,980; Alberta ridings -67,566; Ontario ridings +33,100;
    Quebec ridings +749,472;
  - federal ridings: BC +12,674, Alberta 0, Ontario +10,182, Quebec +9,200.

  Only the economic regions are a partition of the province figures.
- The 2,291 places do not cover the provinces: reserves and settlements are
  measured and counted in their regions but not published. The places hold
  3,173,331 fewer lost cells than the provinces.
- Losses from 2018 on cannot yet be judged, and the record ends in 2022.
