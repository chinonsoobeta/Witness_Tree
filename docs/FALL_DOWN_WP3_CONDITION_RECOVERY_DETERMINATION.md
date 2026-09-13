# WP3 determination: Explore "Condition and recovery" mode

Status: determined 2026-09-12. The mode stays empty. Its status string is
unchanged in English and French. This closes WP3 of
`docs/FALL_DOWN_ARTICLE_SUPPORT_PLAN.md` under its step 3.

This record opens no gate, admits no product and resolves no VLCE2 class.

## Question

Can the regeneration data the plan referred to be published in the Explore
"Condition and recovery" mode without resolving any of the 13 Unresolved classes
in `docs/VLCE2_FOREST_MASK_DECISION.md`?

## What exists

- **No regeneration lag tables exist in the repository or its records.** The plan
  named them as if they did. A search of `docs/`, `data/`, `scripts/` and `lib/`
  finds the phrase only in the plan itself.
- The nearest product is `data/phase4-recovery-trajectory-federal-2023.json`. Its
  status is `local-nonproduction-executed` and its claims are `admitted: false`,
  `released: false`, `productionEligible: false` and `ownerReviewed: false`.
- That product is built by `scripts/phase4_recovery_trajectory.py`, which reads
  yearly `forest-mask-{year}.tif` rasters and counts a cell as recovered when it is
  forest again for at least three consecutive years. The yearly masks come from
  VLCE2 classes 210, 220 and 230 (`scripts/phase2_raster_window.py`).
- WP2 staged the 39 annual VLCE2 land-cover rasters (`nrcan-annual-land-cover-v2`)
  with a publication boundary that says, in both languages, that local staging does
  not admit a forest mask or a recovery claim.

## Finding

The data cannot be published without crossing the gate.

A recovery claim is a statement that a cell became forest again. Every recovery
figure the project holds decides "forest again" with the VLCE2 class treatment
that `docs/VLCE2_FOREST_MASK_DECISION.md` says has not been decided ("Decision
required. No mask may be implemented from this record."). Publishing it would
present that treatment as settled. The only recovery record is also unadmitted
and unreviewed, so publishing it would also move an evidence gate merely because
the output exists.

There is no route around this that the plan allows. Illustrative data, a looser
recovery rule, or a proxy from an excluded source (Hansen, NASA/ORNL ABoVE,
GLC_FCS30D or the classifier's Landsat composites) would each fill the view with
something other than an admitted measurement.

## Outcome

- `components/explore/ExploreView.tsx` keeps both `condition-recovery` status
  strings exactly as they are. They already say that the mode has no real map data.
- `lib/explore/per-cell.ts` still returns `null` for the mode. Its comment said
  the land-cover class series "has never been acquired", which stopped being true
  when WP2 staged it. The comment now gives the real reason: the series is on the
  data root, but the forest-class treatment that recovery needs is not admitted.
  No behaviour changed.

## What would reopen this

All three of the following, as events that actually happened, not as
authorisations:

1. A recorded decision in `docs/VLCE2_FOREST_MASK_DECISION.md` that resolves the
   classes a "forest again" rule depends on.
2. Admission and owner review of a recovery product built on that decision.
3. A coverage grade and unknown area for every row the mode would show.
