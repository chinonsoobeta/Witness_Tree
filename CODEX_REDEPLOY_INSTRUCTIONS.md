# Owner redeploy instructions

## Decision boundary

Deployment is an owner-owned decision. This record does not authorize or perform a deployment. If the owner chooses to redeploy, update the existing ChatGPT Sites project. Do not create a new Site.

- Existing project ID: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`
- Application commit to deploy: `2fe54b2f70201540cbf76936af45375c7c030569`
- Source branch: `redesign/confidence-first-sweep`
- Open integration: [PR #156](https://github.com/chinonsoobeta/Witness_Tree/pull/156)
- Canonical domain: `https://www.witnesstree.ca`

## Why this deploy precedes the merge

The named commit is not on `main` and is not the result of a protected merge. That is deliberate. `scripts/check-deployed-map-render.mjs` binds the deployed-Site map observation to the client that was observed, and this branch changes both `lib/explore/map-style.ts` and `components/explore/ExploreMapClient.tsx` relative to the 2026-09-05 observation. The gate is therefore failing, `verify` is the one required status check on `main`, and PR #156 cannot merge until the Site has been redeployed from this commit and the harness has been re-run against it.

This is the ordinary order for a change that touches the map client: deploy the branch, observe the deployed Site, then merge. It is not a bypass of the gate. The gate stays red until a real observation of a real deployment replaces the stale one. No preview-tier record and no break-glass record is committed on this branch, and none is to be created for it.

The deployment does not close any gate by itself. It supplies the evidence one gate requires.

## Pre-deploy verification

Run these commands in a clean checkout of the exact application commit:

```sh
git fetch origin redesign/confidence-first-sweep
git switch --detach 2fe54b2f70201540cbf76936af45375c7c030569
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
npm run check:year-range-format
```

Require a clean worktree and a successful build. Two known failures are expected at this commit and are the reason for the deploy, not a reason to withhold it:

- `npm run check:deployed-map-render` fails, naming `lib/explore/map-style.ts` and `components/explore/ExploreMapClient.tsx`.
- `npm run test:suite` reports one failing assertion, `the committed observation is current for the deployed client`, which reads the same gate.

Everything else must be green. Any third failure is a real regression and stops the deploy. The documented SSD-dependent receipt checks may skip when the external Witness Tree data root is detached; do not convert a skip into a pass claim.

## Redeploy

In the ChatGPT Sites control plane, open the existing project named above and deploy commit `2fe54b2f70201540cbf76936af45375c7c030569`. Do not use a create-site action. Record the resulting deployment version, deployment URL, start and completion timestamps, and source commit SHA.

## Post-deploy verification

Verify from a browser and from an independent HTTP client:

1. `https://www.witnesstree.ca/en` and `https://www.witnesstree.ca/fr` return 2xx and render in the correct language.
2. `/en/explore` and `/fr/explorer` render the forest-change map, native time control, finder, and all four boundary choices: federal ridings, provincial ridings, economic regions, and watersheds.
3. Federal and provincial riding selection shows the measured coverage readout. Incomplete coverage remains `Unknown`; economic regions and watersheds remain boundary-only.
4. `/en/compare` and `/fr/comparer` load the real federal comparison rows, preserve the selected pair, view, and sort in the URL, and never rank an unknown share.
5. `/en/search` and `/fr/recherche` find bilingual federal riding names with accent and punctuation normalization.
6. The immutable province and boundary PMTiles origins return `206 Partial Content` for byte-range requests, include suitable CORS headers, and match the release URLs and checksums recorded in repository evidence. A `200` full-object response is not a successful PMTiles range check.
7. MapLibre loads its worker asset without console errors. Confirm the PMTiles layers render from the external delivery origin and that an induced PMTiles failure activates the documented GeoJSON/SVG fallback rather than a blank map.
8. This commit carries the confidence-first redesign, so confirm the surfaces it rebuilt: the language gate shows its four photographs with the location captions beneath them, the landing page puts the coverage statement and the evidence legend ahead of the first figure, a place page opens on the record composition, and the governance page carries the accountability plate with a reachable correction route.
9. Record the final canonical URL, deployment version, deployed SHA, HTTP observations, browser observations, and any rollback action. Do not state that deployment closes production, Phase 2, Phase 8, or Phase 9 gates.

## After a successful deploy

Report the deployed SHA and the canonical URL back to the repository owner. The map-render harness is then re-run against the deployed Site, its observation is committed, the Phase 8 exit record moves `cdn-tile-validation` back to pass, and PR #156 merges through protected CI in the normal way. Do not edit the Phase 8 record or the observation file as part of the deployment.

If a blocking verification fails, redeploy the last known-good commit through the same existing Site and record the rollback. Do not mutate archive objects or the external data root as part of a Site rollback.
