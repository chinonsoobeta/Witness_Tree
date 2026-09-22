# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `b69c1e35e980bcaa1ab2264734c7b64a4687de63`
- Source branch: `codex/batch-b-map-hover`
- Open PR: [PR #177](https://github.com/chinonsoobeta/Witness_Tree/pull/177)
- Canonical domain: `https://www.witnesstree.ca`

Last deployment this repository observed: version 36, at 2026-09-20T18:27:40Z, in `data/deployed-map-render-evidence-2026-09-20-v36.json`. The control plane records any later version.

The branch head is one commit ahead of the application commit above and changes only this instruction file. No file under `app/`, `components/`, `lib/`, `public/` or `styles/` differs between the two. Select the application commit explicitly so the deployed application stays traceable to the tree the checks ran against.

## Why this deploy precedes the merge

Both gated files move in this branch: `components/explore/ExploreMapClient.tsx` and `lib/explore/map-style.ts`. The deployed-site render gate is therefore red until the owner deploys the application commit and the harness observes that Site. The `verify` job is the one required check on `main`, and PR #177 cannot merge until that observation exists.

This is the ordinary order for a map-client change, not a bypass. Deploy the application commit, observe the deployed Site, and then settle the gate through the normal protected merge path. No preview observation or break-glass record exists on this branch, and none will be created.

The deploy closes no gate by itself. It supplies the evidence required by the deployed-site rendering gate. It does not admit data, release a product, or open production.

## What this deploy publishes

This branch makes three user-visible changes:

1. A boundary answers anywhere inside its transparent fill, not only on its outline. Map-level pointer queries choose a boundary deterministically, clicks pin the readout, the clear action removes the pin, and the selected outline is highlighted. The same interaction works for federal ridings in English and provincial ridings in French.
2. Condition and recovery now says that the missing prerequisite is a recorded decision about which land-cover classes count as treed cover returning after a loss, plus an admitted and reviewed product built on that decision. The mode remains unavailable for every year. Forest loss, Recorded harvest and Wildfire are unaffected.
3. The British Columbia qualifier leaves the map-style province row. Province unmapped reasons now come from the shared reason module used by the presentations, so the map style does not carry a one-province exception.

Version 36 was built from `e8384d08`. Its pull request, #170, was squashed into `main` as `afbb7ac2`. The first-parent merges since that point, through the application commit, are:

- #166 Record the first observed real wildfire refreshes
- #171 Redesign the reading surfaces and give the record's largest figure a home
- #172 Rewrite the redeploy instructions for the revision that is now on main
- #173 Apply the canvas visual system: shape, colour and the province row
- #174 Add the place-name index for BC, Alberta, Ontario and Quebec
- #175 Batch A: year selects, unmapped reasons, home page on 1984 to 2022
- #176 Batch A: real place search

A later deployment may already have published some of these merges. The control plane knows which version and source commit it has published.

## Pre-deploy verification

Use a clean checkout of the exact application commit:

```sh
git fetch origin codex/batch-b-map-hover
git switch --detach b69c1e35e980bcaa1ab2264734c7b64a4687de63
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
npm run check:phase7-indigenous-explore-comparison-exit-status
npm run check:phase8-launch-readiness-exit-status
npm run check:phase9-public-beta-launch-exit-status
npm run check:cross-record-facts
npm run check:deployed-map-render
```

`npm run build` must precede `npm run test:suite`. The rendered-page tests import `dist/server/index.js`, so running the suite first in a clean checkout fails the landing and rendered-page assertions with `ERR_MODULE_NOT_FOUND`. The workflow orders the two the same way for the same reason.

The expected failures at this commit are exactly these two:

- `npm run test:suite` reports exactly two failing assertions: `the committed observation is current for the deployed client` and `neither weaker tier exists on this branch, so nothing stands in for the Site`.
- `npm run check:deployed-map-render` fails and names exactly `lib/explore/map-style.ts` and `components/explore/ExploreMapClient.tsx`.

The Phase 8 record reads `fail` and seven of sixteen at this commit. That is correct and expected. Do not edit the record to make the count look settled. Any failure beyond the two suite assertions and the two named render-gate files is a real regression and stops the deploy.

The suite prints a `FAILED:` summary near its end. Read that summary rather than searching the TAP stream. The local run reports the static availability line as `"status":"unavailable","portableExecutionStatus":"passed","unavailableFiles":28` with a receipt. Those 28 files are the runner's static `REQUIRES_DATA_ROOT` and `REQUIRES_MACOS_RUNNER` exclusions, not a detached-drive diagnosis and not a pass claim for those tests.

Check `python3` before believing a GDAL failure. Twenty-three tests spawn `python3` and need numpy and GDAL in that interpreter: the four `phase2-*zonal*` files, `phase2-v21-raster-first-runner`, and `phase2-annual-zonal-fractional-correction`. If it resolves to `/Library/Developer/CommandLineTools/usr/bin/python3`, those tests fail together with `ModuleNotFoundError`. Do not prepend that directory to `PATH` because it can replace the normal Homebrew Python. Use the full path to the Command Line Tools git if needed, and confirm:

```sh
python3 -c "import numpy, osgeo.gdal as g; print(numpy.__version__, g.__version__)"
```

If that prints two versions, a GDAL failure is real.

## Redeploy

In the ChatGPT Sites control plane, open the existing project with ID `appgprj_6a7bea9e59988191a9304d4c5a3f379d` and deploy commit `b69c1e35e980bcaa1ab2264734c7b64a4687de63`. Do not use a create-site action. Record the resulting Sites version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and an independent HTTP client:

1. **Identity.** Run `curl --compressed -fsS 'https://www.witnesstree.ca/en/explore?mode=condition-recovery'`. It must contain this new English fragment and not the old one:
   - New: `Condition and recovery needs a recorded decision on which land-cover classes count as treed cover returning after a loss, and an admitted, reviewed product built on that decision.`
   - Old: `Condition and recovery needs the annual land-cover class series, which has not been acquired or admitted.`

   Run the French URL `https://www.witnesstree.ca/fr/explorer?mode=condition-recovery` and check the corresponding fragments:
   - New: `L’état et le rétablissement exigent une décision consignée sur les classes de couverture terrestre qui comptent comme un couvert arboré revenant après une perte, ainsi qu’un produit admis et examiné fondé sur cette décision.`
   - Old: `L’état et le rétablissement exigent la série annuelle des classes de couverture terrestre, qui n’a été ni acquise ni admise.`

   Allow a few minutes for caching. The new fragment must be present and the old fragment absent in each language.
2. `npm run verify:deployed-revision` must exit 0. That proves every marker matched. It does not name the deployed commit, which is why step 1 exists.
3. `/en` and `/fr` must return 2xx and render in the correct language.
4. **The map change.** With federal ridings on, pointing anywhere inside a riding shows its readout and outlines it, and pointing outside every boundary shows nothing. A click pins the riding, and Clear removes the pin. Repeat in French with provincial ridings.
5. Run the current file's other checks: Explore, riding readouts, compare, search, PMTiles range and CORS, MapLibre's worker, and the documented GeoJSON/SVG fallback.
6. Record the Sites version, source commit, completion time in UTC, canonical URL, HTTP observations and browser observations. Do not state that the deploy closes production, Phase 2, Phase 8 or Phase 9.

## After a successful deploy

The owner reports three facts:

- Sites version
- Source commit
- Deployment completed at, in UTC

Codex then performs Part 2 of the Batch B handoff only after receiving the valid owner deploy report. The settlement is one commit and follows the Part 2 protocol: confirm the branch and application commit, validate the report, confirm the local gated bytes, repeat the bilingual identity check, run `npm run verify:deployed-revision`, run the live bilingual hover probe, run the map harness once with a new versioned evidence filename, update `scripts/check-deployed-map-render.mjs`, update only the two render-test comments, settle the Phase 8 record and its evidence digests, refresh the Phase 9 binding, update the Phase 8 test, update this instruction file, and run the final checksum audit. If the live probe or harness fails, stop and report; do not edit or delete the failed evidence.

Do not carry forward the current file's claim that version 36 settlement was completed in `4cf95d5a`. That commit settled version 34. Version 36's settlement is `8e9bacca` on the #170 branch, squashed into `main` as `afbb7ac2`.

## Stale admission pins and rollback

The superseded admission records may continue to contain stale pins by design. Do not refresh those pins as part of this deploy. A stale pin in a frozen or superseded admission record is not a reason to edit the record.

If a blocking verification fails, redeploy the last known-good commit through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
