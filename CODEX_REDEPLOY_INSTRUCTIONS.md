# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `e8384d089c2d32ebbf2c6d89972b8b4b2b9f2c8f`
- Source branch: `fix/explore-map-chrome-in-flow`
- Open integration: [PR #170](https://github.com/chinonsoobeta/Witness_Tree/pull/170)
- Canonical domain: `https://www.witnesstree.ca`

The branch head sits one commit ahead of the application commit above, and that commit changes only this instruction file. Select the application commit explicitly so the deployed application stays traceable to the tree the checks ran against.

## Why this deploy precedes the merge

`scripts/check-deployed-map-render.mjs` binds the deployed-Site map observation to the client that was observed. This branch changes `components/explore/ExploreMapClient.tsx`, so the 2026-09-20 observation of version 34 no longer describes the client the Site would serve. The gate is failing, `verify` is the one required status check on `main`, and PR #170 cannot merge until the Site has been redeployed from this commit and the harness has been re-run against it.

This is the ordinary order for a change that touches the map client: deploy the branch, observe the deployed Site, then merge. It is not a bypass. The gate stays red until a real observation of a real deployment replaces the stale one. No preview-tier record and no break-glass record is committed on this branch, and none is to be created for it.

Note what this deploy does **not** owe. The gate binds two files and this branch moves one: `lib/explore/map-style.ts` is untouched, so the failure names `ExploreMapClient.tsx` alone. The change is a layout change. It takes the province chooser and the layer panel out of the floating strip over the map frame and puts them in normal flow above and below it, because both grow with their content while the frame's height is fixed, so the frame's height was the only thing keeping them from overlapping. Nothing about the PMTiles path, the delivery origin, the immutable archive, or the GeoJSON fallback changes. The redeploy is owed because the gate measures the rendered page rather than reading the diff, which is the point of it.

The deployment does not close any gate by itself. It supplies the evidence one gate requires.

## Pre-deploy verification

Run these commands in a clean checkout of the exact application commit:

```sh
git fetch origin fix/explore-map-chrome-in-flow
git switch --detach e8384d089c2d32ebbf2c6d89972b8b4b2b9f2c8f
git status --short
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:suite
npm run check:claims
npm run check:style-tokens
npm run check:accessibility
npm run check:brand-token
npm run check:bilingual
npm run check:budgets
npm run check:contrast
npm run check:hex-literals
npm run check:persistent-identifiers
npm run check:boundary-overlays
npm run check:year-range-format
```

`npm run build` must precede `npm run test:suite`. The rendered-page tests import `dist/server/index.js`, so running the suite first fails the landing and rendered-page assertions with `ERR_MODULE_NOT_FOUND` in a clean checkout. This mirrors the workflow, which orders the two the same way for the same reason at `.github/workflows/ci.yml`.

Require a clean worktree and a successful build. Two known failures are expected at this commit and are the reason for the deploy, not a reason to withhold it:

- `npm run check:deployed-map-render` fails, naming `components/explore/ExploreMapClient.tsx`.
- `npm run test:suite` reports exactly two failing assertions, `the committed observation is current for the deployed client` and `neither weaker tier exists on this branch, so nothing stands in for the Site`. Both read that same gate.

Everything else must be green, and `npm run test:suite` now prints a `FAILED:` summary naming every failing assertion in its last few lines. Read that summary rather than searching the TAP stream: until 2026-09-20 the runner called `process.exit()` and discarded its own output mid-write, so a failing suite could report failure without ever naming what failed, both in CI and locally.

Any failure beyond the two above is a real regression and stops the deploy. The documented SSD-dependent receipt checks may skip when the external Witness Tree data root is detached; do not convert a skip into a pass claim.

The Phase 8 record already states this debt rather than hiding it. `cdn-tile-validation` reads `fail` at this commit and Phase 8 reads seven of sixteen, not eight. That is correct and expected: a test ties the criterion to `resolveDeployedMapRender()` precisely so it cannot read pass while its own gate is red. Do not edit the record to make the count look settled.

## Redeploy

In the ChatGPT Sites control plane, open the existing project named above and deploy commit `e8384d089c2d32ebbf2c6d89972b8b4b2b9f2c8f`. Do not use a create-site action. Record the resulting deployment version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and from an independent HTTP client:

1. `https://www.witnesstree.ca/en` and `https://www.witnesstree.ca/fr` return 2xx and render in the correct language.
2. `/en/explore` and `/fr/explorer` render the forest-change map, native time control, finder, and all four boundary choices: federal ridings, provincial ridings, economic regions, and watersheds.
3. Federal and provincial riding selection shows the measured coverage readout. Incomplete coverage remains `Unknown`; economic regions and watersheds remain boundary-only.
4. `/en/compare` and `/fr/comparer` load the real federal comparison rows, preserve the selected pair, view, and sort in the URL, and never rank an unknown share.
5. `/en/search` and `/fr/recherche` find bilingual federal riding names with accent and punctuation normalization.
6. The immutable province and boundary PMTiles origins return `206 Partial Content` for byte-range requests, include suitable CORS headers, and match the release URLs and checksums recorded in repository evidence. A `200` full-object response is not a successful PMTiles range check.
7. MapLibre loads its worker asset without console errors. Confirm the PMTiles layers render from the external delivery origin and that an induced PMTiles failure activates the documented GeoJSON/SVG fallback rather than a blank map.
8. This commit moves the Explore map chrome, so confirm what it moved, at a narrow width and in French, where the legend is longest and the failure first appeared. The province chooser sits entirely above the map frame and the layer panel entirely below it. Neither is drawn over the frame, and neither covers the other. The only things floating over the map are the scale and the zoom cluster. Check `/fr/explorer` at 375 px with every boundary overlay on and the span legend expanded: the old layout put the layer panel over the chooser once the legend grew from four short bands to five spelled-out ones, and a clearance that content can exhaust is what the change removes.
9. Record the final canonical URL, deployment version, deployed SHA, HTTP observations, browser observations, and any rollback action. Do not state that deployment closes production, Phase 2, Phase 8, or Phase 9 gates.

## After a successful deploy

Report the deployed SHA and the canonical URL back to the repository owner. The map-render harness is then re-run against the deployed Site and the records are settled from what it measured. That settlement is six files, and it follows the same shape as the 2026-09-20 settlement in `4cf95d5a`:

1. Run the harness against the live page and write a dated observation:

   ```sh
   npm run verify:deployed-map-render -- \
     --url https://www.witnesstree.ca/en/explore \
     --write-evidence \
     --evidence-path data/deployed-map-render-evidence-YYYY-MM-DD.json
   ```

   The date in the filename is the date the run actually happened on. The harness refuses a defaulted filename for exactly this reason: a defaulted name can claim a date the run did not happen on. All five checks must pass. If any fails, the deploy has a real defect and the record is not written.

2. Point `RENDER_EVIDENCE_PATH` in `scripts/check-deployed-map-render.mjs` at the new file. Do this before computing any digest, because that script is itself checksum-bound evidence in Phase 8 and editing it moves its own digest.
3. In `data/phase8-launch-readiness-exit-status.json`, set `cdn-tile-validation` back to `pass`, add the new observation to its evidence list, and refresh the digests of `components/explore/ExploreMapClient.tsx`, `tests/explore.test.tsx` and `scripts/check-deployed-map-render.mjs`. Extend the criterion's reason with what was measured and on which deployment version. `completedCriteria` returns to 8 and `percentage` to 50.
4. Refresh the Phase 8 binding in `data/phase9-public-beta-launch-exit-status.json`. Its criterion is quarterly reproducibility, which this does not touch, so its reason and its zero of four do not move.
5. Return the count and pass-list assertions in `tests/phase8-launch-readiness-exit-status.test.mjs` to eight, and update `tests/deployed-map-render.test.mjs` for the new evidence path.
6. Run `npm run test:suite` and confirm zero failures, then merge PR #170 through protected CI in the normal way.

Do not edit the Phase 8 record or the observation file ahead of the harness run. The earlier dated observations are frozen accounts of what was measured on their days and are never refreshed; they are expected to disagree with the current files, which is how the gate detects that a client has moved.

Two checksum bindings are expected to remain stale and are not settled by this deploy. `data/phase2-1984-2022-admission-record-2026-09-18.json` and `data/phase2-1984-2022-owner-admission-packet.json` both pin `data/phase8-launch-readiness-exit-status.json` by digest, and that pin broke on `main` at #168, before this branch existed. Both are owner-admitted records. Do not rebind them; only a successor record settles them, and that is a separate owner decision.

If a blocking verification fails, redeploy the last known-good commit through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
