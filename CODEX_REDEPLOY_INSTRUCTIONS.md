# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `4ed9eed684bde7b0eba34bee0c45e3b2458af68f`
- Protected integration: [PR #98](https://github.com/chinonsoobeta/Witness_Tree/pull/98)
- Canonical domain: `https://www.witnesstree.ca`

The application commit above is the squash-merged, protected-CI result. A later `main` commit may add only this instruction file. Select the application commit explicitly in the existing Site control plane so the deployed application remains traceable to the tested tree.

## Pre-deploy verification

Run these commands in a clean checkout of the exact application commit:

```sh
git fetch origin main
git switch --detach 4ed9eed684bde7b0eba34bee0c45e3b2458af68f
git status --short
npm ci
npm run typecheck
npm run lint
npm run test:suite
npm run build
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
```

Require a clean worktree, a successful build, all listed gates green, and the protected CI result on PR #98. The documented SSD-dependent receipt checks may skip when the external Witness Tree data root is detached; do not convert a skip into a pass claim.

## Redeploy

In the ChatGPT Sites control plane, open the existing project named above and deploy commit `4ed9eed684bde7b0eba34bee0c45e3b2458af68f`. Do not use a create-site action. Record the resulting deployment version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and from an independent HTTP client:

1. `https://www.witnesstree.ca/en` and `https://www.witnesstree.ca/fr` return 2xx and render in the correct language.
2. `/en/explore` and `/fr/explorer` render the forest-change map, native time control, finder, and all four boundary choices: federal ridings, provincial ridings, economic regions, and watersheds.
3. Federal and provincial riding selection shows the measured coverage readout. Incomplete coverage remains `Unknown`; economic regions and watersheds remain boundary-only.
4. `/en/compare` and `/fr/comparer` load the real federal comparison rows, preserve the selected pair, view, and sort in the URL, and never rank an unknown share.
5. `/en/search` and `/fr/recherche` find bilingual federal riding names with accent and punctuation normalization.
6. The immutable province and boundary PMTiles origins return `206 Partial Content` for byte-range requests, include suitable CORS headers, and match the release URLs and checksums recorded in repository evidence. A `200` full-object response is not a successful PMTiles range check.
7. MapLibre loads its worker asset without console errors. Confirm the PMTiles layers render from the external delivery origin and that an induced PMTiles failure activates the documented GeoJSON/SVG fallback rather than a blank map.
8. Record the final canonical URL, deployment version, deployed SHA, HTTP observations, browser observations, and any rollback action. Do not state that deployment closes production, Phase 2, Phase 8, or Phase 9 gates.

If a blocking verification fails, redeploy the last known-good commit through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
