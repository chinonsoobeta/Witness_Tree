# Owner redeploy instructions

## Prompt for Codex

> Deploy PR #183 and bring `main` up to date. Follow `CODEX_REDEPLOY_INSTRUCTIONS.md` on branch `claude/witness-tree-text-simplify-ynxsep` from top to bottom, and follow `CLAUDE.md`. In order:
>
> 1. Verify the application commit.
> 2. Deploy it to the existing ChatGPT Sites project. Never create a new Site.
> 3. Verify the live site.
> 4. Settle the deployed-map render gate.
> 5. Rebind the listed evidence records with the dated notes given.
> 6. Run every check.
> 7. Merge PR #183 once CI is green.
> 8. Confirm `main` matches what was deployed.
>
> Stop and report on any failure the instructions don't name as expected. Don't edit or delete failed evidence. Don't create a preview observation or a break-glass record.

By handing this prompt to Codex, the owner authorizes the evidence-record edits listed in step 5, and only those.

## Decision boundary

Deployment is an owner-owned decision. This file does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `a30b750b4ad61a7035b0f2642de616955999ebdf`
- Source branch: `claude/witness-tree-text-simplify-ynxsep`
- Open PR: [PR #183](https://github.com/chinonsoobeta/Witness_Tree/pull/183)
- Canonical domain: `https://www.witnesstree.ca`

Last deployment this repository observed: version 41, source commit `cf54e5a8b5e255c6cf9d122c4a8962e8227aec8a`, completed at 2026-09-23T02:37:13.093437Z, observed in `data/deployed-map-render-evidence-2026-09-23-v41.json`. The control plane records any later version.

The branch head is past the application commit only by documentation commits (the readiness record and this file). No file under `app/`, `components/`, `lib/`, `public/` or `worker/` differs between the two. Select the application commit explicitly, so the deployed application traces to the tree the checks ran against.

## Why this deploy comes before the merge

`components/explore/ExploreMapClient.tsx` changes on this branch, so the v41 observation no longer describes the client the Site would serve. The deployed-site render gate stays red until the owner deploys the application commit and the harness observes that Site. The `verify` job is the one required check on `main`, so PR #183 cannot merge until that observation exists.

This is the normal order for a map-client change, not a bypass. The deploy closes no gate by itself: it supplies the evidence the render gate requires. It does not admit data, release a product or open production.

## What this deploy publishes

Numbers, sources, licence attributions and the stated limits are unchanged. What changes for a reader:

- **Top of each page.** Pages with figures open with a collapsed note, "What these figures can't tell you" / "Ce que ces chiffres ne disent pas". Pages without figures state their status under the title. An evidence key sits beside marked figures.
- **Search.** Suggestions appear as you type, from a new worker route, `GET /api/search/suggest?locale=en|fr&q=…`. Choosing one shows the record without leaving the page.
- **Tiles.** One tile style across Data, Releases, Explore and search.
- **Explore.**
  - One toolbar holds the modes and a Boundaries menu, with a reading panel beside the map.
  - The List view is retired.
  - The map has one legend, under the frame.
  - The duplicate legends and table under the map are gone; the yearly losses added together are a column in the figures table.
- **Wording.** "Detected loss" replaces "Detected change" on Compare and Methods. French page titles end in "Arbre témoin". Home says "ha detected" rather than "ha recorded".
- **Plain words.** No "Phase 2", "gate" or "checkpoint" on public pages; they say "the final release". Home's cards speak to readers, and "Other provinces are coming soon" became "The record covers these four provinces only". The component gallery is titled "How figures are marked".
- **One set of facts.** Methods gives the same forest definition as the glossary (at least 1 ha and 20 m wide), both describe the first-and-last-year control, and English pages say "riding" throughout.
- **Compare is short.** The tables of ridings that can't be ranked are closed by default, and coverage and evidence read as plain text in the tables.
- **Accessibility and layout.** See `docs/RELEASE_READINESS_2026-09-23.md`, both passes.

The map client's change is its legend, its controls (full screen is an icon; "Zoom in to see the patches" sits in the legend) and its fit padding. No tile URL, source, layer, style or rendering expression changed, and `lib/explore/map-style.ts` is untouched, so the gate names one file.

## 1. Pre-deploy verification

Use a clean checkout of the exact application commit:

```sh
git fetch origin claude/witness-tree-text-simplify-ynxsep
git switch --detach a30b750b4ad61a7035b0f2642de616955999ebdf
git status --short
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm run test:suite
npm run check:bilingual
npm run check:claims
npm run check:premise-loss-vocabulary
npm run check:year-range-format
npm run check:accessibility
npm run check:contrast
npm run check:style-tokens
npm run check:hex-literals
npm run check:brand-token
npm run check:budgets
npm run check:persistent-identifiers
npm run check:deployed-revision-markers
npm run check:boundary-overlays
npm run check:cross-record-facts
npm run check:phase0-foundations-exit-status
npm run check:phase3-frontend-foundation-exit-status
npm run check:phase4-exit-status
npm run check:phase5-live-wildfire-exit-status
npm run check:phase7-indigenous-explore-comparison-exit-status
npm run check:phase8-launch-readiness-exit-status
npm run check:phase9-public-beta-launch-exit-status
npm run check:deployed-map-render
```

`npm run build` must come before `npm run test:suite`, because the rendered-page tests import `dist/server/index.js`.

**Expected failures at the application commit, before the deploy.** Everything else must pass, apart from the environment notes below.

- These checks fail, each naming a stale evidence checksum:
  - `check:phase0-foundations-exit-status` names `components/governance/GovernancePage.tsx`.
  - `check:phase4-exit-status` names `components/transparency/MethodologyPage.tsx`.
  - `check:phase7-indigenous-explore-comparison-exit-status` names one of `GovernancePage.tsx`, `lib/comparison/ranking.ts`, `RankedRidingsTable.tsx`, `SideBySideComparison.tsx`, `ExploreView.tsx` or `tests/explore.test.tsx`.
  - `check:phase8-launch-readiness-exit-status` names `components/explore/ExploreMapClient.tsx` or `tests/explore.test.tsx`.
  - `check:phase9-public-beta-launch-exit-status` names `data/phase8-launch-readiness-exit-status.json`.
- `check:deployed-map-render` fails and names exactly `components/explore/ExploreMapClient.tsx`.
- `npm run test:suite` fails only these tests, beyond the environment notes:
  - the two render-gate tests, `the committed observation is current for the deployed client` and `neither weaker tier exists on this branch, so nothing stands in for the Site`;
  - the Phase 4, 7, 8 and 9 exit-status tests;
  - the tests in `tests/phase0-phase3-exit-status.test.mjs`, all failing on the same `GovernancePage.tsx` checksum.

Any other failure is real: stop and report it.

**Environment notes.** Read the suite's `FAILED:` summary near the end, not the TAP stream; its `REQUIRES_DATA_ROOT` and `REQUIRES_MACOS_RUNNER` exclusions are not a pass claim. If `python3` resolves to the Command Line Tools interpreter, the numpy/GDAL tests fail together with `ModuleNotFoundError`. Confirm with `python3 -c "import numpy, osgeo.gdal as g; print(numpy.__version__, g.__version__)"`. If that prints two versions, a GDAL failure is real.

## 2. Redeploy

In the ChatGPT Sites control plane, open the existing project `appgprj_6a7bea9e59988191a9304d4c5a3f379d` and deploy commit `a30b750b4ad61a7035b0f2642de616955999ebdf`. Do not use a create-site action. Record the resulting Sites version, deployment URL, start and completion timestamps, and source commit SHA.

## 3. Post-deploy verification

Allow a few minutes for caching, then verify from a browser and an independent HTTP client (`curl --compressed -fsS …`).

1. **Identity: new strings present and old strings absent.**
   - `https://www.witnesstree.ca/en` contains `ha detected` and not `ha recorded`.
   - `https://www.witnesstree.ca/fr` contains `ha détectés` and not `ha consignés`.
   - `https://www.witnesstree.ca/en/compare` contains `Detected loss share` and not `Detected change share`.
   - `https://www.witnesstree.ca/fr/methodes` has the title `Méthodologie · Arbre témoin`.
   - `https://www.witnesstree.ca/en` contains `The record covers these four provinces only` and not `coming soon`.
   - `https://www.witnesstree.ca/en/releases` contains `Final release` and not `Phase 2`.
   - `https://www.witnesstree.ca/en/methods` contains `On Explore you choose a first and a last year` and not `The year control starts at`.
2. **The new worker route.** `https://www.witnesstree.ca/api/search/suggest?locale=en&q=prince` returns HTTP 200 JSON with a `suggestions` array, and carries the site's security headers. The same URL with `locale=xx` returns 400.
3. **The map client.** The ExploreMapClient chunk loaded by `https://www.witnesstree.ca/en/explore` contains `Zoom in to see the patches` and does not contain `Zoom to patches`. This proves the observation describes this branch's client.
4. `npm run verify:deployed-revision` exits 0. It proves the markers match, not which commit is deployed; that is why steps 1 to 3 exist.
5. `/en` and `/fr` return 2xx in the correct language. In a browser, check:
   - typing `prince g` on `/en` opens suggestions, and Enter shows the chosen record;
   - Explore's map loads, with one legend under it, the Boundaries menu, riding hover, full screen and zoom;
   - Compare, Draw and measure, PMTiles range and CORS, and MapLibre's worker all work;
   - the GeoJSON/SVG fallback status still reads `a still map is shown instead` (`une carte fixe est donc affichée à sa place`).
6. Record the Sites version, source commit, completion time in UTC, canonical URL and the HTTP and browser observations. Do not state that the deploy closes production, Phase 2, Phase 8 or Phase 9.

If a blocking check shows the live Site itself is broken, roll back: redeploy commit `cf54e5a8b5e255c6cf9d122c4a8962e8227aec8a` (Sites version 41) through the same Site and record the rollback. A failure in the map-check tooling alone is not grounds for rollback.

## 4. Settle the render gate

Do this in one commit on `claude/witness-tree-text-simplify-ynxsep`, following the version 41 settlement:

1. Confirm the local bytes of `components/explore/ExploreMapClient.tsx` and `lib/explore/map-style.ts` match the deployed application commit.
2. Run `npm run verify:deployed-map-render` once against `https://www.witnesstree.ca/en/explore`. Save its record as `data/deployed-map-render-evidence-<date>-v<version>.json`.
3. Point `RENDER_EVIDENCE_PATH` in `scripts/check-deployed-map-render.mjs` at that record, and update only the two render-test comments in `tests/deployed-map-render.test.mjs`.

## 5. Rebind the evidence records

The rule (`docs/UI_REDESIGN_CONFIDENCE_FIRST_PLAN.md`, C5):
- re-read each bound criterion's reason;
- confirm it still holds against the new file;
- confirm the gate count does not change;
- append the dated note below to the reason;
- refresh the SHA-256 of the named files.

Refresh Phase 8 before Phase 9. Do not change any `status`, count or title. Keep each file's existing JSON indentation.

The author of this branch has already re-read each reason below against the new content and found it still holds. Re-read them yourself anyway. If a reason no longer holds, stop and report it rather than appending the note.

| Record | Criterion id | Files to refresh | Note to append to `reason` |
| --- | --- | --- | --- |
| `data/phase0-foundations-exit-status.json` | `forest-definition-published-bilingually`, `legal-signoff-recorded-in-decision-log`, `both-names-registered-in-both-languages` | `components/governance/GovernancePage.tsx` | Later on 2026-09-23 GovernancePage.tsx drew the Releases page's CSV and GeoPackage links as file tiles, its public wording says "the final release" where it said "Phase 2", and the glossary's annual-interval entry describes the first-and-last-year control, without changing what any statement claims; its digest was refreshed, and this reason still holds. |
| `data/phase4-exit-status.json` | `published-match-and-non-match-rates` | `components/transparency/MethodologyPage.tsx` | Later on 2026-09-23 MethodologyPage.tsx changed "detected change" to "detected loss" to match the product's loss vocabulary, gave the full published forest definition including the 20 m width, and described Explore's first-and-last-year control; the page still reports match and non-match rates as unavailable, its digest was refreshed, and this reason still holds. |
| `data/phase7-indigenous-explore-comparison-exit-status.json` | `right-of-reply-live`, `engagement-register-published`, `mistik-request-recorded` | `components/governance/GovernancePage.tsx` | Same note as the Phase 0 rows. |
| same | `no-indigenous-ranking`, `ranking-scope-enforced` | `lib/comparison/ranking.ts` | Later on 2026-09-23 ranking.ts renamed its visible labels from "detected change" to "detected loss"; the rankable types are unchanged, its digest was refreshed, and this reason still holds. |
| same | `normalisation-forced` | `lib/comparison/ranking.ts` | Later on 2026-09-23 ranking.ts renamed its visible labels from "detected change" to "detected loss"; the sole ranking function still orders by the detected-loss share of forested area and has no absolute-hectares sort, its digest was refreshed, and this reason still holds. |
| same | `comparison-row-context` | `components/comparison/RankedRidingsTable.tsx`, `components/comparison/SideBySideComparison.tsx` | Later on 2026-09-23 SideBySideComparison.tsx renamed its labels from "detected change" to "detected loss", and RankedRidingsTable.tsx dropped a duplicate landmark name, closed the unranked tables by default and shows coverage and evidence as plain text in its tables; every row still renders percentage, hectares, forested hectares, coverage and evidence, the digests were refreshed, and this reason still holds. |
| same | `insufficient-coverage-separated` | `lib/comparison/ranking.ts`, `components/comparison/RankedRidingsTable.tsx` | Later on 2026-09-23 ranking.ts renamed its visible labels, and RankedRidingsTable.tsx dropped a duplicate landmark name and closed its three labelled unranked tables by default; the unranked collection and the three labelled tables are otherwise unchanged and still separate from the ranking, the digests were refreshed, and this reason still holds. |
| same | `explore-modes-and-overlays`, `no-map-tabular-equivalence`, `native-time-control` | `components/explore/ExploreView.tsx`, `tests/explore.test.tsx` | Later on 2026-09-23 ExploreView.tsx added the yearly losses added together to its figures table for multi-year spans, renamed its hidden map heading and says "riding" where it said "district", and tests/explore.test.tsx followed the map legend moving under the map; the four modes, the four overlays, the native year selects and the chart and table equivalence are unchanged, the digests were refreshed, and this reason still holds. |
| `data/phase8-launch-readiness-exit-status.json` | `cdn-tile-validation` | `components/explore/ExploreMapClient.tsx`, `tests/explore.test.tsx`, and any other file its evidence binds that step 4 changed | On `<date>` Sites version `<version>` deployed source commit a30b750b4ad61a7035b0f2642de616955999ebdf, whose map client gives the map one legend under the frame; the browser observation at `data/deployed-map-render-evidence-<date>-v<version>.json` passed and binds the current map files. The criterion stays pass and Phase 8 stays at eight of sixteen. |
| `data/phase9-public-beta-launch-exit-status.json` | `quarterly-reproducibility-test-passes` | `data/phase8-launch-readiness-exit-status.json` | Later on 2026-09-23 the Phase 8 record changed again to bind the redeployed map client and its observation, with the Phase 8 count unchanged; this criterion does not depend on that change, stays fail, and Phase 9 stays at zero of four. |

Leave these alone:
- **Frozen admission records.** The Phase 2 and Phase 6 coarse-grid owner-admission packets and records bind the Phase 8 record as it was on the day they were written. A stale pin in a frozen or superseded admission record is not a reason to edit it.
- **The superseded Phase 8 record,** `data/phase8-launch-readiness-exit-status-as-admitted-2026-09-18.json`.
- **Historical observations,** `data/deployed-map-render-evidence-*.json`.

Then:
- update the Phase 8 row in `docs/IMPLEMENTATION_STATUS.md` with the new version, commit and observation;
- update this file's "Last deployment" line;
- update the Phase 8 test's pass list if it names the observation file.

## 6. Final checks

Re-run the whole list in step 1 on the branch head. Everything must pass, including both render-gate tests and every exit-status check, apart from the environment notes. Push, and confirm CI on PR #183 is green on that head.

## 7. Merge and confirm `main`

1. Merge PR #183 through the normal protected path, using the repository's usual merge method.
2. `git fetch origin main` and confirm the merge commit is `main`'s head.
3. Confirm `main` serves what was deployed: `git diff --stat a30b750b4ad61a7035b0f2642de616955999ebdf origin/main -- app components lib public worker` must print nothing. Only data, docs, scripts and tests differ, from steps 4 and 5.
4. Run `npm ci && npm run build && npm run check:deployed-map-render` on `origin/main`; it must pass.
5. Report to the owner:
   - the Sites version, source commit, completion time and observation file;
   - the merge commit on `main`;
   - that no gate in `docs/EXTERNAL_GATES.md` closed.

   The open release gates are listed in `docs/RELEASE_READINESS_2026-09-23.md`.
