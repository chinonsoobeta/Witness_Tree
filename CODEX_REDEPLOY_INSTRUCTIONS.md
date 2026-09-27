# Owner redeploy instructions

This is the standing procedure for redeploying the site from `main`. It does not
authorize or perform a deployment. Deployment is the owner's decision, made
each time in the prompt the owner gives Codex, and that prompt names the exact
commit and any history reconciliation it allows.

## Current state

- Existing Sites project: `appgprj_6a7bea9e59988191a9304d4c5a3f379d`. Never create a new Site.
- Canonical domain: `https://www.witnesstree.ca`
- Last deployment this repository recorded: **Sites version 44**, completed on
  2026-09-27. Its application tree is `main` at
  `18427fde24d268861ccbf42483f998c9704bcc82` (#195). Its Sites source commit is
  the reconciliation merge `71fe20b444a46e0485b20bb4e8b1401060c9c380`. The
  browser observation is `data/deployed-map-render-evidence-2026-09-27-v44.json`.
- The control plane records any later version; check it before relying on this list.

## Why the Sites history needs reconciling

The Sites source copy keeps its own branch history. `save_site_version` accepts
only that branch's current HEAD, and a push to it must fast-forward. GitHub
`main` allows only squash merges, so the commit a previous deploy used is never
in `main`'s history, and Sites reports "Local and remote Site history diverged".

When the owner authorizes it for a deploy, reconcile like this:

1. Create an isolated deploy branch from the `main` commit being deployed.
2. Run `git merge -s ours --no-ff <current Sites source HEAD>`. The merge
   commit's tree must equal the `main` commit's tree, and the old Sites HEAD
   must now be an ancestor.
3. Push that merge commit to the Sites source branch only, as a normal
   fast-forward. Never reset, rebase, force-push or delete, and never push it
   to GitHub.

The deployed application is always the `main` commit's tree. Record both SHAs.

**Deploy only from `main`.** Before saving a version, run
`npm run verify:deploy-source -- <commit to be saved>` after `git fetch origin main`.
It must name the `main` commit whose tree the saved commit carries. If it fails,
stop: the commit carries code that isn't on `main`. On 2026-09-23 the Site ran an
unmerged pull request for three days.

## 1. Pre-deploy verification

In a clean checkout of the commit to be saved (`git status --short` empty):

```sh
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm test
npm run test:suite
npm run verify:checks
npm run check:bilingual
```

`npm run build` must come before `npm run test:suite`, because the
rendered-page tests import `dist/server/index.js`. `verify:checks` should report
every check passed. Suite files the runner excludes as `REQUIRES_DATA_ROOT` or
`REQUIRES_MACOS_RUNNER` are expected; read the suite's `FAILED:` summary, not
the TAP stream.

`check:deployed-map-render` reports "awaiting deploy" when
`lib/explore/map-style.ts` or `components/explore/ExploreMapClient.tsx` changed
after the last observation. That's expected: the deploy you're about to make
owes the observation (section 4). Any other failure is real: stop and report.

## 2. Deploy

Save one version from the verified commit in the existing project, deploy it,
and poll until it reports succeeded or failed. Confirm the control plane
reports the saved commit as the deployed source.

## 3. Post-deploy verification

On `https://www.witnesstree.ca`, in both languages where it applies:

- `/en`, `/fr`, `/en/explore`, `/fr/explorer`, `/en/methods`, `/fr/methodes`,
  `/en/data/harvest-and-fire` and `/fr/donnees/recolte-et-incendies` return 200.
- Explore opens with all four provinces framed and the zoom hint on the map.
- At 375 px wide, no page scrolls sideways.
- `npm run verify:deployed-revision` exits 0.

Don't state that a deploy closes production, Phase 2, Phase 8 or Phase 9. If
the live Site itself is broken, roll back by redeploying the previous version
through the same Site, and record the rollback. A failure in the map-check
tooling alone is not grounds for a rollback.

## 4. Record the observation (only when the map client changed)

The daily "Deployed map render" workflow drives the live Site in a real browser
and fails if the map stops rendering, so a broken deploy is caught within a day
either way. When either gated map file changed since the last committed
observation, also commit a fresh one:

1. Run `npm run verify:deployed-map-render` once against the live Site. Save
   the result as `data/deployed-map-render-evidence-<date>-v<version>.json`;
   it must pass all five checks.
2. Point `RENDER_EVIDENCE_PATH` in `scripts/check-deployed-map-render.mjs` at
   it, and return the render-gate tests in `tests/deployed-map-render.test.mjs`
   to the deployed-site tier.
3. Rebind the evidence records, following the rule in
   `docs/UI_REDESIGN_CONFIDENCE_FIRST_PLAN.md` (C5):
   - re-read each bound criterion's reason, and confirm it still holds;
   - confirm the gate count doesn't change;
   - append a dated note to the reason;
   - refresh the SHA-256 of the files that changed.

   Refresh Phase 8 before Phase 9. Keep each file's JSON indentation.
4. Update the Phase 8 row in `docs/IMPLEMENTATION_STATUS.md` and this file's
   "Current state".
5. Open a PR. Don't push to `main`, and don't merge it yourself.

Leave these alone:

- dated owner-admission records and packets;
- the superseded Phase 8 record,
  `data/phase8-launch-readiness-exit-status-as-admitted-2026-09-18.json`;
- earlier observations, `data/deployed-map-render-evidence-*.json`.

A stale pin in a frozen record is not a reason to edit it.

If neither map file changed, the committed observation still describes the
client. Run the harness against the live Site as a smoke check, and report
without changing any file.

## Limits

- Don't upload anything to S3 or CloudFront.
- Don't change data claims, gate counts or admission records beyond what a fresh observation proves.
- Don't describe the site as production, beta or launched.
- If a step needs credentials or an approval you don't have, or any SHA or invariant doesn't match, stop and report.
