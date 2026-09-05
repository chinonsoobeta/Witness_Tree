# The deployed-map-render gate

`check:deployed-map-render` is the only check in this repository that asserts
something about a running deployment rather than about the tree. It reads a
committed record written by `scripts/verify-deployed-map-render.mjs`, which
drives a real browser and reports whether the Explore map painted from PMTiles
range requests instead of falling back to GeoJSON. The harness needs the network
and a live origin, so it cannot run in CI. CI reads the record.

Every record binds `lib/explore/map-style.ts` and
`components/explore/ExploreMapClient.tsx` by SHA-256. Change the archive URL or
the client and the record no longer describes the page that was measured, so the
check fails and names the file that moved. This is the failure that let PR #84
sit on main: the observation was real, and it had stopped being about the code.

## Why there are three tiers

The gate used to be circular. A map fix could not merge without being deployed,
and could not be deployed without merging. PR #134 broke that circle by hand,
once, and left nothing behind saying it had. The two weaker tiers exist so the
same move produces an artifact.

| Tier | Record | What it says | What it leaves owed |
| --- | --- | --- | --- |
| Deployed Site | `data/deployed-map-render-evidence-<date>.json` | The Site itself renders the map from the archive. | Nothing. |
| Preview deployment | `data/deployed-map-render-branch-observation.json` | The client renders where it was served from, at a named revision, on a real remote origin. | The Site has not been measured. |
| Break-glass | `data/deployed-map-render-break-glass.json` | Nothing was measured. Someone accepted the debt, in writing, until a date. | Everything. |

They are checked in that order, and a tier that is present but broken fails the
gate rather than falling through to a weaker one. Otherwise the weakest tier
would quietly cover for a preview run that had failed.

## Filing an observation

```bash
npm run verify:deployed-map-render -- --url https://www.witnesstree.ca/en/explore --write-evidence --evidence-path data/deployed-map-render-evidence-YYYY-MM-DD.json
```

The harness labels the record from the origin it measured, not from the path it
is written to. A run against anything other than `https://www.witnesstree.ca`
gets `scope: "branch-deployment"`, `status: "branch-deployment-browser-observation"`
and `siteObservationOwed: true`, and the Site validator refuses a record shaped
that way. Renaming the file does not upgrade the claim.

A preview record must additionally name the 40-character commit the preview was
built from, and its origin must be `https://` and not a machine-local host. A
localhost run proves the code works, not that any deployment does.

The writer opens the file with `wx`, so it cannot overwrite an existing record.
Records are never edited by hand: a record written by hand asserts a measurement
that did not happen.

## Opening a break-glass

Only when no deployment of the change exists to measure. The record states:

- `status: "gate-debt-not-an-observation"`, and no `checks` array, so it can
  never be read as a measurement;
- `reason`, at least a paragraph, saying why nothing could be measured;
- `authorizedBy` and `authorizedAt`;
- `settleBy`, no more than 14 days after `authorizedAt`;
- `sources`, the exact digests it covers.

The digest binding is what stops it being left in place to wave through later
edits to the same files, and `settleBy` is what stops it becoming permanent. An
expired record fails the gate with the date it expired.

## Settling

Re-run the harness against the deployed Site and commit the new record. Then
delete the break-glass or preview record: the checker fails when a settled debt
is left on the branch, because the next stale observation would find it sitting
there and reuse it.

## What this gate does not do

It admits nothing, releases nothing, and deploys nothing. A passing observation
is a browser measurement of a page, and every record states
`published: false`, `productionEligible: false`, `admissionClaim: false` and
`productionAdmission: false` on its own face.
