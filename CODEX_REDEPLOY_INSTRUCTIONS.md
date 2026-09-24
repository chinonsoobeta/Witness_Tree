# Owner redeploy instructions

## Prompt for Codex

> Deploy PR #183's Explore map fix and bring `main` up to date. Follow `CODEX_REDEPLOY_INSTRUCTIONS.md` on branch `claude/witness-tree-text-simplify-ynxsep` from top to bottom, and follow `CLAUDE.md`. In order:
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
- Application commit to deploy: `826f897edc547fe1ce218f518a8d4e6a205f81d9`
- Source branch: `claude/witness-tree-text-simplify-ynxsep`
- Open PR: [PR #183](https://github.com/chinonsoobeta/Witness_Tree/pull/183)
- Canonical domain: `https://www.witnesstree.ca`

Last deployment this repository observed: version 42, source commit `51b9adeb6e097b693f4109090a6206c01743694e`, completed at 2026-09-23T15:12:26Z, observed in `data/deployed-map-render-evidence-2026-09-23-v42.json`. The control plane records any later version.

**History.** The application commit descends from `51b9ade`, the commit the Site's source copy holds after version 42, so this deploy is a plain fast-forward. No history merge or reconciliation is needed. If Sites reports diverged history anyway, stop and report.

The branch head is past the application commit only by this file. No file under `app/`, `components/`, `lib/`, `public/` or `worker/` differs between the two. Select the application commit explicitly, so the deployed application traces to the tree the checks ran against.

## Why this deploy comes before the merge

`components/explore/ExploreMapClient.tsx` changed again after version 42, so the v42 observation no longer describes the client the Site would serve. The deployed-site render gate stays red until the owner deploys the application commit and the harness observes that Site. The `verify` job is the one required check on `main`, so PR #183 cannot merge until that observation exists.

This is the normal order for a map-client change, not a bypass. The deploy closes no gate by itself: it supplies the evidence the render gate requires. It does not admit data, release a product or open production.

## What this deploy publishes

One change, to the Explore map. Numbers, sources, licence attributions and stated limits are unchanged.

Recorded harvest and Wildfire used to open on an empty frame. They drew only the loss patches, which appear only when zoomed in, and no provinces at all. Condition and recovery built no map. Now:

- **Outlines everywhere.** Every mode draws the province outlines; Forest loss still shades them. Condition and recovery shows its "not available yet" message on a card over the outlines.
- **A hint on the map.** While a patch mode is zoomed out, a hint reads "Loss patches appear when you zoom in close." with a "Zoom in to see the patches" button.
- **The button lands on patches.** It keeps the reader's centre when that is inside a province. Otherwise it goes to the nearest province's commercial forest, instead of northern Manitoba, where the four-province view is centred and the record has no data. It zooms to 10, because the archive's zoom-8 tiles keep only a few of the largest patches.

No tile URL, source archive, style colour or data file changed. `lib/explore/map-style.ts` is untouched, so the gate names one file.

## 1. Pre-deploy verification

Use a clean checkout of the exact application commit:

```sh
git fetch origin claude/witness-tree-text-simplify-ynxsep
git switch --detach 826f897edc547fe1ce218f518a8d4e6a205f81d9
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

- `check:phase7-indigenous-explore-comparison-exit-status` fails naming `tests/explore.test.tsx`.
- `check:phase8-launch-readiness-exit-status` fails naming `components/explore/ExploreMapClient.tsx` or `tests/explore.test.tsx`.
- `check:deployed-map-render` fails and names exactly `components/explore/ExploreMapClient.tsx`.
- `npm run test:suite` fails only these tests, beyond the environment notes:
  - the two render-gate tests, `the committed observation is current for the deployed client` and `neither weaker tier exists on this branch, so nothing stands in for the Site`;
  - the Phase 7 and Phase 8 exit-status tests.

The Phase 0, 3, 4, 5 and 9 checks pass before the deploy. Any other failure is real: stop and report it.

**Environment notes.** Read the suite's `FAILED:` summary near the end, not the TAP stream; its `REQUIRES_DATA_ROOT` and `REQUIRES_MACOS_RUNNER` exclusions are not a pass claim. If `python3` resolves to the Command Line Tools interpreter, the numpy/GDAL tests fail together with `ModuleNotFoundError`. Confirm with `python3 -c "import numpy, osgeo.gdal as g; print(numpy.__version__, g.__version__)"`. If that prints two versions, a GDAL failure is real.

## 2. Redeploy

In the ChatGPT Sites control plane, open the existing project `appgprj_6a7bea9e59988191a9304d4c5a3f379d` and deploy commit `826f897edc547fe1ce218f518a8d4e6a205f81d9`. Do not use a create-site action. Record the resulting Sites version, deployment URL, start and completion timestamps, and source commit SHA.

## 3. Post-deploy verification

Allow a few minutes for caching, then verify from a browser and an independent HTTP client.

1. **The map client.** The ExploreMapClient chunk loaded by `https://www.witnesstree.ca/en/explore` contains `Loss patches appear when you zoom in close.` Version 42's chunk does not. This proves the observation describes this commit's client.
2. **In a browser:**
   - `/en/explore?mode=recorded-harvest` opens with the four province outlines and the zoom hint on the map, not an empty frame.
   - Pressing "Zoom in to see the patches" lands in Ontario's forest at zoom 10 with blue harvest patches visible.
   - `/en/explore?mode=wildfire` opens with outlines and the hint. A fire patch may or may not be in view after zooming, because fires are patchy.
   - `/en/explore?mode=condition-recovery` shows the outlines with the "isn't available yet" message on a card.
   - `/en/explore` (Forest loss) still shades the provinces and passes the usual checks: riding hover, compare, draw, PMTiles range and CORS, MapLibre's worker, and the GeoJSON fallback status `a still map is shown instead`.
3. `npm run verify:deployed-revision` exits 0.
4. Record the Sites version, source commit, completion time in UTC, canonical URL and the HTTP and browser observations. Do not state that the deploy closes production, Phase 2, Phase 8 or Phase 9.

If a blocking check shows the live Site itself is broken, roll back: redeploy commit `51b9adeb6e097b693f4109090a6206c01743694e` (Sites version 42) through the same Site and record the rollback. A failure in the map-check tooling alone is not grounds for rollback.

## 4. Settle the render gate

Do this in one commit on `claude/witness-tree-text-simplify-ynxsep`, following the version 42 settlement:

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

Refresh Phase 8 before Phase 9. Do not change any `status`, count or title. Keep each file's existing JSON indentation. The author of this branch re-read each reason below against the new content and found it still holds. Re-read them yourself anyway; if a reason no longer holds, stop and report it rather than appending the note.

| Record | Criterion id | Files to refresh | Note to append to `reason` |
| --- | --- | --- | --- |
| `data/phase7-indigenous-explore-comparison-exit-status.json` | `explore-modes-and-overlays`, `no-map-tabular-equivalence`, `native-time-control` | `tests/explore.test.tsx` | Later on 2026-09-23 tests/explore.test.tsx changed to pin that every Explore mode draws the province outlines and that the patch zoom lands inside a province; the four modes, the four overlays, the native year selects and the chart and table equivalence are unchanged, its digest was refreshed, and this reason still holds. |
| `data/phase8-launch-readiness-exit-status.json` | `cdn-tile-validation` | `components/explore/ExploreMapClient.tsx`, `tests/explore.test.tsx`, and any other file its evidence binds that step 4 changed | On `<date>` Sites version `<version>` deployed source commit 826f897edc547fe1ce218f518a8d4e6a205f81d9, whose map client draws the province outlines in every mode and aims the patch zoom inside a province; the browser observation at `data/deployed-map-render-evidence-<date>-v<version>.json` passed and binds the current map files. The criterion stays pass and Phase 8 stays at eight of sixteen. |
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
3. Confirm `main` serves what was deployed: `git diff --stat 826f897edc547fe1ce218f518a8d4e6a205f81d9 origin/main -- app components lib public worker` must print nothing. Only data, docs, scripts and tests differ, from steps 4 and 5.
4. Run `npm ci && npm run build && npm run check:deployed-map-render` on `origin/main`; it must pass.
5. Report to the owner:
   - the Sites version, source commit, completion time and observation file;
   - the merge commit on `main`;
   - that no gate in `docs/EXTERNAL_GATES.md` closed.

   The open release gates are listed in `docs/RELEASE_READINESS_2026-09-23.md`.
