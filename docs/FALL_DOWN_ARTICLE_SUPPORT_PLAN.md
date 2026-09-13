# Fall-Down article support: implementation plan

Status: plan only. Nothing in this document has been implemented.
Recorded 2026-09-12. Supersedes the deferred backlog recorded 2026-09-09.

## Why this exists

On 2026-09-09 we asked whether a reader could reach the conclusions of the
"The Fall-Down" British Columbia forestry article from the Witness Tree site.
The answer was no. Of seven substantive claims, four are absent, two are partly
visible but not derivable, and one is partly reproducible. The gap is mostly
structural: the site is an area instrument measured from imagery, and the
article is mostly a volume argument drawn from administrative records.

The owner has now authorised all four work packages below, including WP4, and
has explicitly accepted that WP4 changes what the site is.

## The constraint every package inherits

The site's publication discipline is not negotiable by this plan. Four rules
bind every row any package adds:

1. Annual intervals may not be summed. The province aggregate is one fixed
   window and it ignores the year control.
2. Unknown is never zero-filled and never proxy-imputed.
3. Coverage is graded per row, and an ungraded row may not be published.
4. Area measured from imagery and volume reported by an administrator are two
   different instruments. A row may carry one or the other. It may not silently
   mix them into a single derived figure.

The article sums 38 years of harvest freely. **Each package must state, in its
own record file, what it is entitled to assert.** A package that does not carry
that statement contradicts the site's rules rather than extending them, and must
not merge.

## Ordering

WP1 → WP2 → WP4 → WP3. WP1 and WP2 are independent of each other and may run in
parallel; WP4 depends on WP2's manifest precedent; WP3 is listed last because it
is blocked on a gate this plan does not open.

---

## WP1. Extend the official harvest comparison past 2019

**Goal.** `data/phase2-official-published-harvest-comparison.json` holds 118 rows
for BC, AB, ON and QC and stops at 2019 because every row is bound to
`statcan-table-2.10-2018`. Re-source from the National Forestry Database to reach
2022.

**Why it is first.** Cheapest item, and it carries the single most important
missing fact: the 33 percent area cliff in 2020 to 2022, which is currently
invisible anywhere on the site.

**Entitlement statement to write into the file's `publicationBoundary`.** The
extended rows compare a Witness Tree observed-loss interval against a published
harvest figure for the same interval. They are a comparison of two independent
instruments, not a correction of one by the other, and neither series may be
summed across intervals.

**Steps.**

1. Add an NFD acquisition under `raw/nfd-harvest/<YYYY-MM-DD>/` with
   `.metadata.json` and `.headers.txt`, following the existing raw layout. Record
   the publisher-declared version, or the literal `undeclared` if the publisher
   declares none. Never substitute a retrieval date for a version.
2. Stage it through `data/staged-acquisitions.json` (see WP2 for the schema and
   the trap).
3. Extend the row generator to emit `fromYear`/`toYear` pairs through 2022 with
   `referenceSourceId: "nfd-<table>-<edition>"`. Do **not** retro-fit the existing
   118 rows to NFD: leave them on StatCan and let the two reference sources sit
   side by side, each row naming its own.
4. Every new row needs `witnessTreeCoverageGrade` and
   `witnessTreeUnknownRequiredInputHectares` computed the same way the existing
   rows compute them. If an input is unavailable for a year, the grade says so
   and the hectares field carries the unknown. It does not carry zero.
5. Surface the 2020 to 2022 rows wherever the existing rows already surface.

**Done when.** `npm run test:suite` is green, `npm run check:bilingual` is green,
and a reader can see the 2020 to 2022 rows on the site without opening a JSON file.

**Traps.** The existing rows carry both a float and an exact decimal string
(`...Hectares` and `...HectaresExact`). Emit both. `strictNfdExactTotalStatus`
already has an `unknown-components` value; use it rather than inventing a new one.

---

## WP2. Publish the four-province annual harvest and fire series

**Goal.** `derived/provincial-annual-series-20260909/` and
`derived/bc-annual-series-20260909/` are computed and sitting on the SSD. They are
not in the repository. Publishing them makes the Quebec fire finding reproducible.

**Entitlement statement.** These are annual observed-area series. They are
publishable per year. They may not be summed into a multi-year total, and the
province aggregate remains the existing fixed window.

**Steps.**

1. For each file, compute `byteLength`, `sha256` and `crc64nvme`, and read
   `retrievedAt` from the staged file's modification time in UTC. The manifest's
   own `lineageConventions` block defines all three; follow it literally.
2. Append entries to `data/staged-acquisitions.json` with
   `immutableObjectStorage: false`, `productionEligible: false`,
   `attributionState` set to what is actually verified, and a real `licenceId`
   and `licenceUrl`.
3. **The trap.** `tests/staged-acquisitions.test.mjs` asserts the sum of every
   entry's `byteLength` as a single literal (currently 48942077543). Adding
   entries breaks that assertion. Update the sum **in the same commit**, and add a
   per-entry checksum assertion for each new entry, following the
   `NTEMS_DEFINITIONAL` block's pattern. The per-entry assertions exist so that a
   silent substitution cannot hide inside a matching total; do not add entries
   without them.
4. Add a `docs/` record naming what was staged, from where, under what licence,
   and what it is entitled to assert.

**Done when.** `node --test tests/staged-acquisitions.test.mjs` is green,
`npm run verify:data-root-inventory` is green, and `npm run test:suite` is green.

**Traps.** These checks are data-root-bound: they need the SSD mounted. A check
that cannot read the SSD reports unavailable evidence, which is not the same as
contradicted evidence and must not be recorded as a failure.

---

## WP4. Volume, stumpage and allowable annual cut

**Goal.** Give the site a volume instrument alongside its area instrument.
The owner has authorised this and has accepted that it changes what the site is.

**What already exists.** The acquisition half is largely done. On the SSD:

- `derived/hbs-region-*-parsed-20260912.json`, holding 15 years of BC Harvest Billing
  System scale records, all six regions, with volume, value, dollars per cubic
  metre, log grade, tenure type and month. 1,512 region reports parsed, plus 567
  species and 567 grade reports.
- `derived/bcts-auction-results-20260912.json`, holding 5,822 BC Timber Sales auctions,
  2009 to 2026, each with auction date, volume, upset rate, status and **every
  bidder with client number and bonus bid**.
- `raw/bc-mps-appraisal-parameters/2026-09-12/`, holding 168 monthly stumpage appraisal
  parameter sheets, Interior and Coast.
- `raw/bc-interior-appraisal-manual/2026-09-12/`, holding six manual editions.

**A licence constraint that must be honoured in code, not just in prose.** The
168 MPS appraisal parameter PDFs carry an explicit Crown-copyright
non-redistribution notice. They are **not** OGL-BC. Their numbers may be cited as
fact with attribution; the documents themselves must never be served, bundled,
mirrored, or committed. Their manifest entries must carry
`redistributable: false`, and a check must enforce that no build output contains
them.

**Entitlement statement.** This is the hard part of the package and it is a
writing task as much as an engineering one.

- Scaled volume is what a scaler measured on a log that was already cut. It is
  not an estimate of standing timber and it says nothing about what remains.
- Stumpage is a price set by a published formula, not an observation. From
  mid-2023 the Interior formula includes a term driven by the unharvested
  allowable-cut gap, which means the appraised rate after that date is partly an
  effect of the harvest shortfall and is **not** independent evidence about the
  wood. Any stumpage series the site publishes must carry that break, visibly, at
  July 2023. See `docs/` record to be written under WP4 step 1.
- Allowable annual cut is an administrative determination. It is a policy number,
  not a measurement, and must be labelled as one.
- Area and volume may sit side by side. A cubic-metres-per-hectare figure derived
  by dividing one by the other crosses the instrument boundary in rule 4 above and
  is prohibited.

**Steps.**

1. Write `docs/BC_VOLUME_INSTRUMENT_ADMISSION.md`: what each of the three
   quantities is, what it can support, what it cannot, and the July 2023
   appraisal-formula break with its magnitude. Nothing else in WP4 starts until
   this exists, because every later step depends on the vocabulary it fixes.
2. Stage all four acquisitions through the WP2 manifest path, with the MPS
   licence flag above.
3. Add the check that enforces the non-redistribution flag against build output.
4. Add a volume data surface to the site, bilingual from the start. Model it on
   the existing row-and-grade pattern rather than inventing a second shape: every
   row names its source, its year, its region, and its coverage grade.
5. Add the vocabulary terms to whatever the bilingual check reads, in both
   languages, with the caveats attached rather than in a footnote.

**Done when.** `npm run check:bilingual`, `npm run test:suite`,
`npm run check:cross-record-facts` and the new redistribution check are all green,
and a reader can reach the volume claims without being able to reach the
prohibited derivations.

**Traps.** `grep -rilE "cubic metre|\bAAC\b|stumpage" app components lib data`
currently returns nothing. This package is the first volume content in the
codebase, so there is no existing pattern to copy for the vocabulary checks; expect
to extend `check:premise-loss-vocabulary` or add a sibling rather than reuse it.

---

## WP3. Explore's "Condition and recovery" mode

**Goal.** The mode's status string in `components/explore/ExploreView.tsx`
currently reads "No real map data. Illustrative data view: 1988; every other year
has neither." The regeneration lag tables would fill it.

**Why it is last, and why it is a decision.** Recovery is a regeneration claim,
and regeneration lands near the VLCE2 forest-mask gate: 13 classes are Unresolved
and mask implementation is not permitted. **This plan does not open that gate and
Codex must not open it.**

**Steps.**

1. Determine whether the regeneration lag tables can be published without
   resolving any of the 13 VLCE2 classes. Write the finding into a `docs/` record.
2. If they can, fill the mode and rewrite `modeStatus` in both `en` and `fr` to
   describe what is actually there.
3. If they cannot, **leave the mode empty and leave the status string honest.**
   An empty mode that says it is empty is the correct behaviour, and there is
   precedent: the mostly-unranked Compare tab is the corrected behaviour and was
   explicitly not widened to fill it. Do not lower a threshold, widen a scope, or
   substitute illustrative data to make this view look populated.

**Done when.** Either the mode carries real data and says so, or a `docs/` record
states why it cannot and the status string is unchanged. Both outcomes close WP3.

---

## Rules for the implementing agent

- Never turn Unknown into zero, and never close an unknown area by proxy
  imputation.
- Never weaken, narrow or remove a checker to make CI green.
- Never use `--admin` to bypass protected branch rules.
- Never rebind an owner-admitted checksum. A checksum binding may be refreshed
  only after confirming the bound criterion's stated reason remains true and the
  gate count does not change, and every affected downstream status record must be
  audited afterwards.
- Never move a gate merely because the code that would satisfy it now exists.
- Hansen, NASA/ORNL ABoVE, GLC_FCS30D, source-coverage labels and the Landsat
  composites used by the classifier are excluded as independent truth.
- All project data stays on the external SSD. Do not create a second copy on the
  internal drive. The SSD copy is the only copy, so every operation is
  non-destructive.
- Never use bare `git stash` or `git stash pop`: the stash stack is shared across
  worktrees. Use `git stash push -u -m "<unique-tag>"`, capture the SHA from
  `git stash list --format='%H %gs'`, restore with `git stash apply <sha>`, then
  drop by re-finding the tag.
- The em dash U+2014 is banned repository-wide and linted. Recast the sentence.
  An en dash is correct for numeric ranges and for a missing-value cell.
- CI fails fast: the verify job stops at the first red gate, so one reported
  failure is a floor, not a total. Sweep locally against a clean main before
  pushing.
- Deploys are ChatGPT Sites control plane only. Merging to main does not update
  the live site.
