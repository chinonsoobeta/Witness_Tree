# BC FTEN cutblock corroboration

An internal check on whether the per-cell detected-loss candidates in British
Columbia line up with the province's own forest tenure record. It is not shown
on the site, it does not stand in for review, and it moves no gate.

## Why it exists

The expert-review criterion was retired on 2026-08-30, withdrawn rather than
met. Retiring it removed the only planned outside look at the per-cell
detection. This is not a replacement for that look, and it cannot be: nobody has
compared the detection to imagery or to conditions on the ground. What it can do
is ask a narrower question that a public dataset can actually answer.

## The question it asks

The review packet holds 100 British Columbia candidates, drawn by the same
sampler in two equal strata: 50 cells where loss was detected, and 50 where the
data says no loss occurred. For each cell the runner asks the province's Forest
Tenure Cutblock Polygons layer whether any cutblock covers that ground, and
whether any such cutblock's disturbance window overlaps the candidate's
interval.

If the detection carries information, the loss-observed cells should sit on
tenure ground with matching timing more often than the known-no-loss cells. The
contrast between the two strata is the whole result. Neither number means
anything on its own.

## What was found, as of 2026-08-30

| | loss-observed | known-no-loss | Fisher exact, two-tailed |
|---|---|---|---|
| any cutblock | 34/50 | 23/50 | p = 0.043 |
| cutblock overlapping the interval | 18/50 | 4/50 | p = 0.0013 |

The in-interval row is the informative one. Tenure ground stays tenure ground
for decades, so the any-cutblock row is weak by construction and should not be
leaned on.

A p value here says the two strata differ. It does not say the detection is
correct, does not measure an error rate, and cannot substitute for inspecting
the imagery.

## What it cannot show

- A cutblock polygon records a **harvesting authority**, not a completed
  harvest. `PENDING`, `ACTIVE` and `RETIRED` are lifecycle states of a legal
  authority, and none of them is a determination that trees came down.
- Private land and some licence types are never reported to this layer. An
  absent cutblock is therefore not evidence that nothing happened, and the
  known-no-loss stratum's 23 hits are not 23 errors.
- Fire is out of scope entirely. This layer records tenure, so it says nothing
  about the fire-attributed cells, which are the larger share of the series.
- A bounding-box intersection is a proxy for containment. A polygon that clips
  the 45 m tolerance ring counts as an intersection.

## Why it is not a snapshot

The BC WFS declares `PagingIsTransactionSafe=false` and pages at 10,000
features, and its whole-layer count moves between observations: 222,198 on
2026-08-14, 222,607 on 2026-08-30. No complete, coherent copy can be taken from
it, which is why the acquisition remains blocked and why this record is stamped
as-of-query-time rather than as an edition.

Every query here is a box roughly 90 m across and returns single-digit feature
counts, so unsafe paging is never exercised. A box that reached the page limit
aborts the run rather than recording a partial count.

## The axis-order trap

With the short form `bbox=minLon,minLat,maxLon,maxLat,EPSG:4326` the service
reads longitude first. With the URN form `urn:ogc:def:crs:EPSG::4326` it reads
latitude first. Passing longitude-first coordinates with the URN form returns
`numberMatched="0"` under HTTP 200, with no warning of any kind.

That failure mode produces a clean-looking sheet of zeros, which would read as a
disconfirmation of the detection rather than as a broken query. Every run
therefore fires a positive control over known cutblock ground first and refuses
to record anything if the control matches nothing.

## Files

| File | Role |
|---|---|
| `scripts/run-bc-ften-cutblock-corroboration.mjs` | Runner. Needs the data root and network access. |
| `scripts/lib/two-proportion.mjs` | Fisher exact test for the 2x2 contrast. |
| `data/bc-ften-cutblock-corroboration.json` | The record. |
| `scripts/check-bc-ften-cutblock-corroboration.mjs` | Fail-closed gate, `npm run check:bc-ften-cutblock-corroboration`. |
| `tests/bc-ften-cutblock-corroboration.test.mjs` | Tamper tests. |

The gate recomputes every summary count and both p values from the results,
binds the candidate set to the same review packet the retirement record names,
and rejects any edit that sets `published`, `productionEligible`, `isEdition` or
`isSnapshot`, raises any claim, drops any caveat, or records a run whose
positive control did not fire.

Attribution: contains information licensed under the Open Government
Licence - British Columbia.
