# The land-cover product's mapped extent was missing from every zonal summary

Found 2026-08-29 while auditing the completed federal and provincial district
aggregation. Nothing has been published from the affected outputs, and no gate
has been moved on the strength of this document.

## What is wrong

The NTEMS VLCE2 annual land cover product declares nodata 255 and never writes
it. Outside the extent it maps, it writes 0. 0 is not one of its published
classes; those are 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220 and 230.

The derived forest masks are 1 for the forest classes and 0 for everything
else. That encoding throws away the only thing distinguishing a cell the
product mapped and found no forest in from a cell the product never mapped at
all. Both arrive as 0.

The zonal worker read those masks and had no third state to read, so it
counted every unmapped cell as measured, forest-free ground.

Two independent lines of evidence establish that value 0 means unmapped:

1. The publisher's own raster attribute table ships a row for value 0 next to
   the twelve classes. For all 37 years whose table is populated it counts
   exactly 17,219,937,123 cells, against 24,889,746,240 in the full grid. The
   two years missing a table are 1991 and 2005, the upstream packaging defect
   already recorded in `data/raster-defects.json`.
2. A cell-for-cell readback of every year against a single extent raster built
   from 1984, performed by `scripts/build_phase2_vlce2_mapped_extent.py
   --verify`. This is the stronger claim: it proves the zero cells are in the
   same places, not merely that there are the same number of them.

## The two consequences, which are not equally severe

**A district lying entirely outside the mapped extent gets a fabricated zero.**
It reports 0 hectares of forest, 0 hectares of loss, 0 hectares Unknown and a
coverage grade of `complete`. Read plainly that says the place was measured and
nothing was found. Nobody looked. This is the severe case, and it is not rare:
187 of 343 federal districts, 101 of 124 Ontario, 71 of 127 Quebec and 62 of 87
Alberta districts came back reporting zero forest under a complete grade.

Not every one of those is an unmapped district, and the distinction has to be
drawn per district rather than assumed. A dense urban district can be inside
the mapped extent and genuinely hold almost no forest, and reporting zero for
it is correct. British Columbia's two, Richmond-Steveston and
Vancouver-Yaletown, are exactly that case: sampling the 2020 source across
their extents finds no value 0 at all, only water, urban and a trace of
conifer. They were measured.

Sampling the same way settles the others. Ajax reads 100.00% value 0.
Stormont-Dundas-South Glengarry, which is farmland and woodlot, reads 99.98%.
Huntingdon reads 100.00%, Granby 98.92%, Calgary-Acadia 100.00%. Those were
not measured, and the product's own extent is why: it tracks Canada's forested
ecosystems, so the settled south and the prairies fall largely outside it while
British Columbia lies almost entirely within.

This is the reason the corrected grade is three-way rather than two. `complete`
and `none-mapped` are both answers of zero, and they mean opposite things.

**A district lying partly outside it keeps correct numbers under an incorrect
claim.** The known subtotals are read from the mapped part alone, so the extent
changes nothing about them: `knownForestedHectares` and
`knownObservedLossHectares` are identical before and after the correction. What
changes is what may be said about them. The complete total `lossHectares`, the
derived `observedLossPercent`, and the grade `complete` all assert that the
whole district was measured, and that assertion is false wherever any of it was
not.

Both are proven by execution rather than argument, in
`tests/phase2-annual-zonal-aggregation-v2-gdal.test.mjs`: two tests run the
frozen v1 worker and the corrected v2 worker over the same bytes and record
what each answers.

## What is affected

| Artifact | State |
| --- | --- |
| `derived/phase2-annual-riding-zonal-v1` (five district summaries, run 2026-08-29) | Defective. Never published. Kept unmodified as the evidence that the defect was real. Must not reach the site. |
| `derived/phase2-annual-province-zonal-v1` (admitted province aggregate) | Known subtotals remain sound. Corrected v2 execution now measures the coverage defect: all four provinces are partial. The public mapped-part figures remain minima with the exact unknown areas stated below. |
| Per-cell tile release | No false exterior loss polygons are evidenced: an exterior cell cannot satisfy the initial forest mask. The legacy loss rasters still encode exterior cells as ordinary 0 rather than Unknown, so a blank area cannot mean observed no-loss. The current repository release record is empty. Any populated release must bind the verified extent receipt and remain non-countable and nonproduction. |

The province aggregate is admitted, so correcting it is a separate decision
with its own record. This document does not make that decision, and does not
move its gate.

## Measured province coverage correction

The corrected four-province run completed on 2026-08-29. Its 156-row annual
JSON is 88,613 bytes with SHA-256
`65b51ab93414e49a371901dab3a408fb8ab831e404f037395d28f1efa687c65d`.
The 143,415-byte provenance sidecar has SHA-256
`df0ce293b025c75c0b791dd5c357ea4fa92600dfd3af6664193ecc459abfa36a`
and binds the exact JSON, all 38 annual pairs, the four source features, the
corrected worker and mapped extent. Both remain local, non-admitted,
non-released and nonproduction.

The mapped extent is invariant across the 39 source years, so these coverage
areas are constant across every annual row:

| Province | Unknown and unmapped hectares | Cartographic province hectares | Unknown share | Corrected grade |
| --- | ---: | ---: | ---: | --- |
| British Columbia | 4,095.27 | 91,730,013.75 | 0.004464% | `partial-with-unknown` |
| Alberta | 15,372,023.76 | 63,992,872.89 | 24.021462% | `partial-with-unknown` |
| Ontario | 8,843,646.69 | 97,932,917.61 | 9.030311% | `partial-with-unknown` |
| Quebec | 22,204,952.19 | 147,544,902.00 | 15.049623% | `partial-with-unknown` |

British Columbia therefore changes from the sampling-based `complete` grade
to measured partial coverage. Its gap is small, but zero would still be a
false completeness claim. The existing 2020-2022 mapped-part hectares and
rate remain available as minima; they are not renamed as whole-province
totals.

## Measured riding coverage correction

The corrected five-jurisdiction riding wrapper also completed on 2026-08-29.
Every annual JSON, provenance sidecar and create-once completion marker is
present, and the wrapper rechecked and skipped the independently completed
Ontario and Quebec pairs before reporting all five summaries complete. The
latest 2021-2022 interval has these measured grades:

| Boundary edition | Districts | Complete | Partial with unknown area | None mapped |
| --- | ---: | ---: | ---: | ---: |
| Federal ridings, 2023 Representation Order | 343 | 69 | 91 | 183 |
| British Columbia provincial ridings, 2023 | 93 | 84 | 9 | 0 |
| Alberta provincial ridings, 2019 | 87 | 8 | 17 | 62 |
| Ontario provincial ridings, 2022 | 124 | 8 | 17 | 99 |
| Quebec provincial ridings, 2026 | 127 | 19 | 37 | 71 |
| **Total** | **774** | **188** | **171** | **415** |

All 586 incomplete rows keep `lossHectares` and `observedLossPercent` null.
Their mapped-part `knownObservedLossHectares` remains a separately labelled
subtotal, never a whole-district total. The fail-closed converter bound all
five annual files, sidecars, markers, source geometries and the verified mapped
extent into `data/phase2-riding-map-measurements.json`. That 517,447-byte local
map join has SHA-256
`b0a3c6fb715ebd37630154b277b443f41078dcd4d44c140f30634317a25f2c92`.
It remains non-admitted, non-released and nonproduction.

## The correction

`scripts/phase2_annual_zonal_aggregate_v2.py` takes a required `--mapped-extent`
raster and counts unmapped area as Unknown. Rows gain
`unmappedByProductExtentHectares` and `districtHectares`, and `coverageGrade`
becomes three-way: `complete`, `partial-with-unknown`, or `none-mapped` for a
district the product never looked at.

It is a new file rather than an edit. The v1 worker's sha256 is bound into
`data/phase2-annual-nfd-provisional-comparison-receipt-2026-08-27.json`, and
`scripts/phase2_annual_zonal_fractional_correction.py` re-hashes it before
trusting the province aggregate. Editing it in place would have broken a
binding whose entire purpose is to prove which code produced an admitted
number. v1 is frozen at the revision that produced that number; new runs use
v2.

The 39-year extent verification and the corrected province execution are now
complete. The district wrapper remains the fail-closed route for the five
riding summaries:

```sh
scripts/run-phase2-annual-riding-zonal.sh
```

The province wrapper refused to replace either member of its v2 output pair.
After each riding worker returns successfully, its wrapper writes
a create-once completion marker over the output and provenance digests. A
rerun skips a jurisdiction only when all three regular files exist and the
marker still matches; partial, changed, or symlinked output sets fail. This
allows a stopped five-jurisdiction run to resume without silently accepting an
interrupted or modified pair. Neither wrapper reads from or writes to the v1
output directories.
