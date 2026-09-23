# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `cf54e5a8b5e255c6cf9d122c4a8962e8227aec8a`
- Source branch: `claude/witness-tree-text-simplify-ynxsep`
- Open PR: [PR #182](https://github.com/chinonsoobeta/Witness_Tree/pull/182)
- Canonical domain: `https://www.witnesstree.ca`

Last deployment this repository observed: version 39, source commit `b69c1e35e980bcaa1ab2264734c7b64a4687de63`, completed at 2026-09-22T05:17:31.421743Z, with the browser observation in `data/deployed-map-render-evidence-2026-09-22-v39.json`. The control plane records any later version.

The branch head may be one commit past the application commit because this file was rewritten after it. No file under `app/`, `components/`, `lib/`, `public/` or `styles/` differs between the two. Select the application commit explicitly so the deployed application stays traceable to the tree the checks ran against.

## Why this deploy precedes the merge

`components/explore/ExploreMapClient.tsx` changes on this branch, so the v39 observation no longer describes the client the Site would serve. The deployed-site render gate is red until the owner deploys the application commit and the harness observes that Site. The `verify` job is the one required check on `main`, and PR #182 cannot merge until that observation exists.

This is the ordinary order for a map-client change, not a bypass. Deploy the application commit, observe the deployed Site, and then settle the gate through the normal protected merge path. No preview observation or break-glass record exists on this branch, and none will be created.

The deploy closes no gate by itself. It supplies the evidence required by the deployed-site rendering gate. It does not admit data, release a product, or open production.

## What this deploy publishes

One user-visible change: the site's text, in English and French, is rewritten in plain language. Long paragraphs become two or three sentences and technical terms are replaced by everyday words unless a figure depends on them. Numbers, sources, licence attributions and the stated limits (detected loss is a minimum, unknown is never zero, a satellite cannot show cause, the patches cannot be added up) are unchanged.

The map client's change is copy only: captions, legends, fallback and status sentences. No tile URL, source, layer, style or rendering logic changed, and `lib/explore/map-style.ts` is untouched, so the gate names one file.

## Pre-deploy verification

Use a clean checkout of the exact application commit:

```sh
git fetch origin claude/witness-tree-text-simplify-ynxsep
git switch --detach cf54e5a8b5e255c6cf9d122c4a8962e8227aec8a
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

`npm run build` must precede `npm run test:suite`. The rendered-page tests import `dist/server/index.js`, so running the suite first in a clean checkout fails the landing and rendered-page assertions with `ERR_MODULE_NOT_FOUND`.

Before the owner redeploy, the expected failures at the application commit are exactly these:

- `npm run test:suite` reports exactly two failing assertions: `the committed observation is current for the deployed client` and `neither weaker tier exists on this branch, so nothing stands in for the Site`.
- `npm run check:deployed-map-render` fails and names exactly `components/explore/ExploreMapClient.tsx`.

The pre-deploy Phase 8 record reads `fail` for `cdn-tile-validation` and seven of sixteen. That is correct before observation. Any other failure is real: stop and report it.

The suite prints a `FAILED:` summary near its end. Read that summary rather than searching the TAP stream. Its 28 static `REQUIRES_DATA_ROOT` and `REQUIRES_MACOS_RUNNER` exclusions are not a pass claim for those tests.

Check `python3` before believing a GDAL failure. If it resolves to `/Library/Developer/CommandLineTools/usr/bin/python3`, the numpy/GDAL tests fail together with `ModuleNotFoundError`. Confirm with:

```sh
python3 -c "import numpy, osgeo.gdal as g; print(numpy.__version__, g.__version__)"
```

If that prints two versions, a GDAL failure is real.

## Redeploy

In the ChatGPT Sites control plane, open the existing project with ID `appgprj_6a7bea9e59988191a9304d4c5a3f379d` and deploy commit `cf54e5a8b5e255c6cf9d122c4a8962e8227aec8a`. Do not use a create-site action. Record the resulting Sites version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and an independent HTTP client:

1. **Identity.** Run `curl --compressed -fsS 'https://www.witnesstree.ca/en'`. It must contain the new fragment and not the old one:
   - New: `shows forest loss in four Canadian provinces, from satellite images and public records.`
   - Old: `reports recorded and detected forest loss in four provinces, with the source attached to every claim.`

   Run `curl --compressed -fsS 'https://www.witnesstree.ca/fr'` and check:
   - New: `montre les pertes forestières dans quatre provinces canadiennes, à partir d’images satellites et de registres publics.`
   - Old: `présente les pertes forestières consignées et détectées dans quatre provinces, avec la source jointe à chaque affirmation.`

   Allow a few minutes for caching. The new fragment must be present and the old one absent in each language.
2. **The map client.** Before running the harness, confirm the deployed Explore client carries a string only this change introduces: the deployed ExploreMapClient chunk loaded by `https://www.witnesstree.ca/en/explore` must contain `These patches are for viewing, not counting` and must not contain `These patches are drawn, not counted`. This proves the observation describes this branch's client rather than merely a Site observed after a deploy.
3. `npm run verify:deployed-revision` must exit 0. That proves every marker matched. It does not name the deployed commit, which is why steps 1 and 2 exist.
4. `/en` and `/fr` must return 2xx and render in the correct language. Spot-check `/en/methods`, `/fr/methodes`, `/en/data` and `/fr/donnees` for the new wording.
5. Run the other existing checks: Explore, riding readouts and hover, compare, search, PMTiles range and CORS, MapLibre's worker, and the documented GeoJSON/SVG fallback, whose status now reads `a still map is shown instead` (`une carte fixe est donc affichée à sa place`).
6. Record the Sites version, source commit, completion time in UTC, canonical URL, HTTP observations and browser observations. Do not state that the deploy closes production, Phase 2, Phase 8 or Phase 9.

## After a successful deploy

The owner reports three facts:

- Sites version
- Source commit
- Deployment completed at, in UTC

Codex then settles the gate on this branch in one commit, following the version 39 settlement:

1. Confirm the branch and application commit, and that the local bytes of `components/explore/ExploreMapClient.tsx` and `lib/explore/map-style.ts` match what was deployed.
2. Run `npm run verify:deployed-map-render` once against `https://www.witnesstree.ca/en/explore`. Save its record as `data/deployed-map-render-evidence-<date>-v<version>.json`.
3. Point `RENDER_EVIDENCE_PATH` in `scripts/check-deployed-map-render.mjs` at that record, and update only the two render-test comments in `tests/deployed-map-render.test.mjs`.
4. In `data/phase8-launch-readiness-exit-status.json`, set `cdn-tile-validation` back to `pass` with a dated reason naming the version, commit and observation. Set Phase 8 back to eight of sixteen (`completedCriteria` 8, `percentage` 50), and refresh the evidence digests.
5. Refresh the Phase 9 record's binding to the Phase 8 record. Update the Phase 8 test's counts and pass list. Update the Phase 8 row in `docs/IMPLEMENTATION_STATUS.md` and this file.
6. Run the final checksum audit and the full pre-deploy list above. Both render-gate tests must now pass.

If the live probe or the harness fails, stop and report; do not edit or delete the failed evidence. Do not create a preview observation or a break-glass record.

## Stale admission pins and rollback

The superseded admission records may continue to contain stale pins by design. The Phase 6 coarse-grid owner-admission packet and record bind the Phase 8 record as it was on 2026-09-22; do not refresh those pins as part of this deploy. A stale pin in a frozen or superseded admission record is not a reason to edit the record.

If a blocking verification fails, redeploy the last known-good commit (`b69c1e35e980bcaa1ab2264734c7b64a4687de63`, Sites version 39) through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
