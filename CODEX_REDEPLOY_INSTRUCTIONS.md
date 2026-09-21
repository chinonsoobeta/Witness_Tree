# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `00ecd9fb350bd0f2b9a523ee7475e21160747d46`
- Source branch: `main`
- Canonical domain: `https://www.witnesstree.ca`
- Currently deployed: version 36, observed 2026-09-20T18:27:40Z in `data/deployed-map-render-evidence-2026-09-20-v36.json`

This file is committed one commit ahead of the application commit named above and changes nothing but itself. No file under `app/`, `components/`, `lib/`, `public/` or `styles/` differs between the two, so the application is identical either way. Select the application commit explicitly so the deployed application stays traceable to the tree the checks ran against.

## What this deploy publishes

Three merges since version 36 was deployed.

**The reading surfaces were redesigned so the record leads and the chrome follows.** The landing page now opens on the whole record's largest figure. `ProvinceRecordList` replaces the four province cards with one ranked list, a measure toggle and a bar scaled in hectares. `EvidenceMarks` states the four evidence classes once, in one place, instead of repeating four chips down the page. The footer groups eleven links into three named columns. `NoRecordResult` states the conclusion, then the reason, then what the absence does not mean, then what would turn it into a figure. Explore moves into a three-column workspace, controls left, map centre, interval figures right, placed by named grid area so the document order a screen reader takes is unchanged.

**The landing page answers its own headline.** `CumulativeHeadline` publishes the four-province 1984 to 2022 union: 44,975,298.15 ha, 22.69 percent of the 198,250,714.71 ha of forest the sources mapped in 1984. Item C of the 2026-09-18 owner admission released these figures. The block is bordered because the border is the argument: a reader who screenshots the number gets the denominator, the 46,424,717.91 ha that were never mapped, and the reason the annual rows do not add up to it, inside the same rectangle. The summed annual figure, 70,030,574.55 ha, is on the page on purpose and named as a different measure rather than as a correction, because a place cleared twice is counted once in the union and once in each year it was cleared.

**The first observed real wildfire refreshes are recorded.** Three real refreshes, three gated no-ops, zero failures, production still false. The Phase 5 scheduled-job criterion stays `fail`: the observed window is under a day, two hourly slots on 2026-09-14 had no run, and no run crosses a daylight saving transition. Pacific daylight time does not end until 2026-11-01, so that criterion cannot be settled by any observation that exists yet.

## What this deploy does not owe

**No gate requires this deploy.** This is the difference from the 2026-09-20 deploy of version 36, which existed to feed a red gate. `scripts/check-deployed-map-render.mjs` binds two files, `lib/explore/map-style.ts` and `components/explore/ExploreMapClient.tsx`, and neither moved in any of the three merges. The gate reads 24 of 24 at the application commit and keeps reading 24 of 24 after the deploy. The version 36 observation still describes the client the Site serves, which is what the gate measures.

**No gate closes because of it either.** A deployment supplies evidence; it does not admit, release or settle anything. Do not state that this deploy closes production, Phase 2, Phase 5, Phase 8 or Phase 9.

**The 1984 to 2022 checksum debt is settled and is not reopened here.** `data/phase2-1984-2022-admission-record-2026-09-18.json` and `data/phase2-1984-2022-owner-admission-packet.json` still carry pins that do not match the current tree, and they always will. Both were superseded on 2026-09-19 by `data/phase2-1984-2022-admission-record-2026-09-19.json`, which binds frozen snapshots of the two status records instead of their living paths, and which pins the two superseded files by their own digests so they cannot be edited. Do not refresh a digest in either superseded file. A stale pin inside a superseded record is the record staying true to its moment, not a debt.

## Pre-deploy verification

The `verify` job on the application commit is the authoritative run. It installs GDAL, numpy and zsh, audits dependencies, typechecks, lints, runs 125 checkers and the full suite, and it is the one required status check on `main`. Confirm it passed on the exact commit before deploying.

To reproduce it locally, run these in a clean checkout of the exact application commit:

```sh
git fetch origin main
git switch --detach 00ecd9fb350bd0f2b9a523ee7475e21160747d46
git status --short
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm run test:suite
npm run check:deployed-map-render
npm run check:deployed-revision-markers
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
npm run check:phase2-province-series
```

`npm run build` must precede `npm run test:suite`. The rendered-page tests import `dist/server/index.js`, so running the suite first fails the landing and rendered-page assertions with `ERR_MODULE_NOT_FOUND` in a clean checkout. The workflow orders the two the same way for the same reason.

Require a clean worktree, a successful build, and zero failing assertions. Unlike the version 36 deploy, no failure is expected here. `npm run test:suite` prints a `FAILED:` summary naming every failing assertion in its last few lines; read that summary rather than searching the TAP stream.

Any failure stops the deploy, with one documented exception to rule out first.

**Check `python3` before believing a GDAL failure.** Twenty-three tests spawn `python3` and need numpy and GDAL in that interpreter: the four `phase2-*zonal*` files, `phase2-v21-raster-first-runner`, and `phase2-annual-zonal-fractional-correction`. If `python3` resolves to `/Library/Developer/CommandLineTools/usr/bin/python3`, which has neither, all twenty-three fail together with `ModuleNotFoundError: No module named 'numpy'` and pass again in a shell with the normal `PATH`. That looks exactly like a flaky cluster and is not one; it is deterministic. Prepending the Command Line Tools bin is the usual workaround for `/usr/bin/git` stopping on the Xcode licence prompt, and it swaps the interpreter out as a side effect. Use the full path to that `git` instead of putting its directory on `PATH`, and confirm before the run:

```sh
python3 -c "import numpy, osgeo.gdal as g; print(numpy.__version__, g.__version__)"
```

If that prints two versions, a GDAL failure is real.

A separate, expected result is the suite's own availability line. `scripts/run-ci-tests.mjs` holds a static exclusion list, `REQUIRES_DATA_ROOT` and `REQUIRES_MACOS_RUNNER`, and the 28 files named there are never executed on any runner, whether or not the external data root is attached. The run reports `"status":"unavailable"` with `"portableExecutionStatus":"passed"`. That is the excluded list, not a detection of a detached drive, and it is not a pass claim for anything those files would have tested.

## Redeploy

In the ChatGPT Sites control plane, open the existing project named above and deploy commit `00ecd9fb350bd0f2b9a523ee7475e21160747d46`. Do not use a create-site action. Record the resulting deployment version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and from an independent HTTP client.

1. **Prove the Site is running this revision, not the previous one.** Run the marker sweep against the deployed origin:

   ```sh
   npm run verify:deployed-revision
   ```

   The marker set was extended for this deploy so that it can tell version 36 from its successor in both directions and both locales. Two strings must now be present, `Forest detected as lost` on `/en` and `Forêt détectée comme perdue` on `/fr`, rendered by `components/site/CumulativeHeadline.tsx`, which did not exist at version 36. Two strings must now be absent, `A record, not a dashboard` on `/en` and `Un registre, pas un tableau de bord` on `/fr`, from the landing section this redesign replaced. A page that was not fetched, or that did not answer 200, counts as behind: an unanswered question is not a pass. If the sweep reads behind, the deploy did not land and nothing below is worth checking yet.

2. `https://www.witnesstree.ca/en` and `https://www.witnesstree.ca/fr` return 2xx and render in the correct language.

3. **The cumulative headline reads as one block.** On `/en`, the figure `44,975,298.15 ha` sits under the heading with the span on it, and the three bases are in the same bordered rectangle: the share with its 1984 denominator in one description, the coverage grade with the unmapped hectares, and the annual sum named as a different measure. Check `/fr` at 375 px as well, where `44 975 298,15 ha` is the widest the figure gets: no horizontal page scroll, three basis columns above 900 px and one below.

4. **The province list replaced the cards.** One ranked list on the landing page, with a measure toggle and a bar scaled in hectares. No four-card grid, and no shared-scale disclaimer, because there is no second bar to disclaim.

5. `/en/explore` and `/fr/explorer` render the forest-change map, native time control, finder, and all four boundary choices: federal ridings, provincial ridings, economic regions, and watersheds. The three-column workspace holds: controls left, map centre, interval figures right. At a narrow width the columns stack and the document order is unchanged. The province chooser sits entirely above the map frame and the layer panel entirely below it; the only things floating over the map are the scale and the zoom cluster.

6. Federal and provincial riding selection shows the measured coverage readout. Incomplete coverage remains `Unknown`; economic regions and watersheds remain boundary-only.

7. `/en/compare` and `/fr/comparer` load the real federal comparison rows, preserve the selected pair, view, and sort in the URL, and never rank an unknown share.

8. `/en/search` and `/fr/recherche` find bilingual federal riding names with accent and punctuation normalization.

9. The immutable province and boundary PMTiles origins return `206 Partial Content` for byte-range requests, include suitable CORS headers, and match the release URLs and checksums recorded in repository evidence. A `200` full-object response is not a successful PMTiles range check.

10. MapLibre loads its worker asset without console errors. Confirm the PMTiles layers render from the external delivery origin and that an induced PMTiles failure activates the documented GeoJSON/SVG fallback rather than a blank map.

11. **Re-run the map harness read-only, as a check and not as evidence.** The Explore layout around the map moved, so confirm the map itself still behaves:

    ```sh
    npm run verify:deployed-map-render -- --url https://www.witnesstree.ca/en/explore
    ```

    Without `--write-evidence` this writes nothing. All five checks must pass. Do not pass `--write-evidence` and do not repoint `RENDER_EVIDENCE_PATH`: the version 36 observation is current for the client this revision serves, the gate is green on it, and that script is itself checksum-bound in the Phase 8 record, so editing it moves its own digest for no gate that asked.

12. Record the final canonical URL, deployment version, deployed SHA, HTTP observations, browser observations, and any rollback action.

## After a successful deploy

Report the deployed SHA and the canonical URL back to the repository owner.

**No record settlement follows this deploy.** Do not edit any exit-status record, do not refresh any checksum binding, and do not open a follow-up pull request to make a count look settled. The six-file settlement the previous version of this file described belonged to the version 36 deploy and was completed in `4cf95d5a`. Phase 8 reads 8 of 16 and Phase 9 reads 0 of 4 at the application commit, and a deployment moves neither.

The earlier dated observations under `data/deployed-map-render-evidence-*.json` are frozen accounts of what was measured on their days and are never refreshed. They are expected to disagree with the current files, which is how the gate detects that a client has moved.

If a blocking verification fails, redeploy the last known-good commit through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
