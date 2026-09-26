# Phase 4 provincial matching run, 2026-09-26

The first computed run of the Phase 4 matching criterion for British Columbia
and Québec. Record: [`data/phase4-provincial-matching-report.json`](../data/phase4-provincial-matching-report.json).
Outputs on the data root: `derived/phase4-provincial-matching-2026-09-26/`.

**Status: computed, awaiting owner admission.** The Phase 4 gate stays failed
until the owner admits the source evidence, transformation and release, a
release record exists, and an outside reviewer for each province signs off.

## Result

| | Changes assessed | Matched | Match rate | Matched by area |
| --- | ---: | ---: | ---: | ---: |
| British Columbia | 33,943,585 | 4,292,031 | 12.6% | 57.7% |
| Québec | 66,787,699 | 6,905,933 | 10.3% | 55.1% |
| **Both** | **100,731,284** | **11,197,964** | **11.1%** | **56.1%** |

Non-match reasons, both provinces: 86,411,020 changes overlap no official
record; 2,858,179 overlap a record dated outside the tolerance; 249,943 overlap
records by less than half; 14,178 fail on both counts.

Matched changes by record kind: fire 5,705,243; harvest 5,302,627; insect
121,043 (Québec); windthrow 69,051 (Québec).

Most unmatched changes are small. By count 11% match; by area 56% do.

## Method

- **Detected changes.** Every per-cell loss patch in the admitted four-province
  store, 1984–1985 to 2021–2022, assigned to the province holding most of its
  cells. The observation year is the interval's closing year.
- **Official records.** Reprojected to the national 30 m EPSG:3978 grid and
  rasterized one source at a time by GDAL's cell-centre rule
  (`scripts/phase4_rasterize_records.py`):
  - BC: Harvested Areas of BC (consolidated cutblocks; RESULTS and VRI records
    only, because the satellite change-detection records would match the
    satellite loss by construction), FTA 4.0 cutblocks with a disturbance start
    date, and historical fire perimeters. 695,647 records.
  - Québec: the up-to-date ecoforest map's stand-origin disturbances with their
    year (fire BR, windthrow CHT, insect ES, cut codes C… and RECUP…;
    plantation, seeding and other treatments excluded), and the fire perimeter
    layer. 2,115,508 records.
- **Candidates.** A record that shares a cell with a change and whose event
  year is within five years of the observation year.
- **Matching.** `lib/pipeline/matching.ts`, unchanged: at least half the
  smaller area, ±2 years (±3 before 1995), best overlap wins. Non-match reasons
  from `lib/phase4/provincial-matching.ts` (`nonMatchReasonKey`).

## Checks

- An independent recount (`scripts/phase4_independent_check.py`) joins flat cell
  keys by sort and re-applies the rules without the matcher's code. It agrees
  exactly on BC 1990–1991, BC 2021–2022, Québec 1991–1992 and Québec 2013–2014.
- Rasterized area equals the summed polygon area within 0.4% for every BC
  source-year checked, except 2010 fires (9% less), where overlapping perimeters
  share cells.
- Two full runs gave identical counts.
- `tests/phase4-match-provincial.test.ts` covers each outcome on a hand-built store.

## Rights

BC: consolidated cutblocks by written permission (2026-09-18); FTA cutblocks
and historical fire perimeters under OGL-BC. Québec: CC BY 4.0. See
[`data/bc-harvest-source-rights-2026-09-26.json`](../data/bc-harvest-source-rights-2026-09-26.json).

## Limits

- A change with no record is not evidence that nothing happened: records can be
  missing, unpublished, outside a reporting boundary, or on private land.
- The non-match reasons are tolerance failures, not causes.
- Québec code families were grouped from the stratification standard; codes not
  confirmed are under 2% of records.

## Running it

Heavy inputs were staged on the internal disk and the outputs copied back to
the SSD, verified byte for byte. Memory is bounded throughout: rasterization is
one 64 MB tile per task on a pool of five workers per province; matching is one
interval per child process with a 2 GB heap on a pool of eight (peak 750 MB per
task); overlaps are counted in a fixed-capacity typed-array table that refuses
to grow past its cap.

```sh
python3 scripts/phase4_rasterize_records.py --gpkg WORK/records/records-BC.gpkg --src bc-fta-4-cutblocks --out WORK/runs/BC/bc-fta-4-cutblocks --workers 5
node scripts/run-phase4-provincial-matching.mjs --work WORK --workers 8 --heap 2048
node scripts/build-phase4-provincial-matching-report.mjs --work WORK --checks WORK/checks/all.json
```

The whole matching run takes about 95 seconds on a 10-core Apple M4.
