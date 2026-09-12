# WP1: NFD harvest comparison through 2022

Recorded 2026-09-12. **Prepared in part; blocked, not complete.**
Specification: `docs/FALL_DOWN_ARTICLE_SUPPORT_PLAN.md` at `64346e4`.

## What this package asserts and is entitled to assert

The extended rows compare a Witness Tree observed-loss interval against a
published harvest figure for the same labelled interval. These are two independent
instruments, neither correcting the other. Neither series may be summed across
intervals. The province aggregate retains its existing fixed window and ignores
the year control. Joining on the publisher's year label does not establish
identical calendar or fiscal reporting periods, causal attribution, product
accuracy, equivalence, or a forest-mask admission.

Les lignes ajoutées comparent un intervalle de perte observée par Witness Tree à
une superficie récoltée publiée pour le même intervalle libellé. Ce sont deux
instruments indépendants, sans correction de l'un par l'autre. Aucune série ne
peut être additionnée entre les intervalles. L'agrégat provincial conserve sa
fenêtre fixe et ne tient pas compte du sélecteur d'année. Une jointure selon
l'année de la source ne prouve pas que les périodes civiles ou financières sont
identiques, ni une attribution causale, l'exactitude du produit, une équivalence
ou l'admission d'un masque forestier.

## Source acquisition completed

The following new files were downloaded directly to the mounted external SSD,
under `/Volumes/Extended_SSD/Witness_Tree-data/raw/nfd-harvest/2026-09-12/`.
Each has a sibling `.headers.txt` and `.metadata.json`. No existing file was
overwritten and no raw payload was copied to the internal drive.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `nfd-area-harvested-en-fr.csv` | 2033845 | `1644b66e78a3e30d865f1425065de39350532ad96a131038ec77e1890f58f706` |
| `nfd-terms.html` | 21200 | `65216d443123abf17812ccd7880a0ce43b3cc88f9e4e5cc09b9c15326667fb05` |
| `nfd-download.html` | 81012 | `baecdac94efd7d292e3a6ff142109ba737501d57f4f1d2417cb6117882b7fb51` |

The CSV's whole-file CRC64NVME is `ef1972d415353fcf`, in lower-case hex.
The local calculation also passed the `123456789` check vector
`ae8b14860a799888`. Its download-completion mtime is
`2026-09-12T15:10:57Z`, a project approximation rather than a publisher
attestation. The current CSV declares no edition: `sourceVersion: undeclared`.
The separately archived Zenodo package version 3.0.0 is not the version of this
current CSV and does not supply the requested 2022 frame.

The official terms page states Open Government Licence – Canada 2.0. The intended
entry is `sourceId: nfd-5.2-undeclared`, `licenceId: ogl-canada`,
`licenceUrl: https://open.canada.ca/en/open-government-licence-canada`,
`attributionState: metadata-verified`, `immutableObjectStorage: false`, and
`productionEligible: false`. The table includes attribution in English and French
when NFD rows are supplied.

## Transport conflict: not an unreachable dataset

The exact download advertised by the publisher is:

<http://nfdp.ccfm.org/download/data/csv/NFD%20-%20Area%20harvested%20by%20ownership%20and%20harvesting%20method%20-%20EN%20FR.csv>

HTTP retrieval succeeded. The same host's HTTPS endpoint refused connections
on port 443. `scripts/check-staged-acquisitions.mjs` requires HTTPS for every
source URL. The task explicitly prohibits weakening a checker. No exception has
been applied and no alternative source has been substituted. Permission for an
exception restricted to this exact URL and checked bytes has been requested but
has not been received.

Consequently, the manifest and its byte-total test are unchanged. If an exact
CSV exception is approved, stage the CSV and add assertions for its byte length,
SHA-256 and CRC64NVME in the same commit. With this CSV alone added to the
specified branch's manifest, the new literal total would be **48944111388**;
the current total remains **48942077543**. Supporting HTTP notices are recorded
here and on the SSD, not silently entered under invented HTTPS retrieval URLs.

## Implemented and checked independently of staging

- The existing parser validates all source rows and preserves qualifier meanings.
  The new extension function reuses it through the preparation runner.
- All 118 existing rows retain their values and identities: 104 rounded StatCan
  rows and 14 withheld rows from the restricted later source. The specification's
  description of all 118 as StatCan rows is not the actual input state.
- Fourteen additional rows cover BC and AB in 2020–2022 and ON and QC in
  2019–2022. The additional ON/QC 2019 rows avoid leaving a gap after their
  existing 2018 endpoints. Numeric and exact decimal fields are emitted together.
- Imagery values, grades and unknown hectares are copied from the same bound
  fractional annual comparison used by the historical generator. Missing imagery
  is explicitly unavailable, with null unknown-area magnitude rather than zero.
  Incomplete inputs cannot produce a difference. No input or source grade is
  widened to make a row computable.
- The bilingual table can show NFD precision, per-row sources, imagery coverage,
  unknown required-input hectares and the publication boundary. It retains the
  restricted-value disclosure and shows missing values as unknown.
- The preparation runner requires an accepted staging entry before reading the
  payload, binds both the new source and the existing imagery/historical bytes,
  writes only a new SSD-derived file, refuses overwrite, and verifies readback.

A read-only invocation of the pure extension function with the real SSD inputs
produced 132 rows in memory, with 14 computable new rows and all 118 historical
rows unchanged. It did not persist or publish a new comparison artifact.

The current NFD BC values are 155443.24 ha (2020), 142943.108 ha (2021), and
112901.942 ha (2022). `(112901.942 / 155443.24 - 1) * 100` is
**-27.367737574178197 percent**, not the plan's 33 percent. This is a comparison
of two annual published values, not a sum of annual imagery intervals. No 33
percent claim has been added to the site.

## Checks and remaining work

Executed from the specified `wt/premises` worktree, without entering the main
checkout. Before edits, clean `origin/main` at
`bb46e3748c16ba8fc155ecbb5b280c2befa9d6d9` passed the build, portable suite and
all 125 CI package checks. The independent check sweep used 10 concurrent workers,
the available CPU count. The production audit failed separately on the existing
MapLibre 6.3.0 critical advisory GHSA-jrc7-96c5-q579.

On the WP1 preparation:

| Command | Observed result |
| --- | --- |
| `npm run build` | Passed |
| `npm run test:suite` | Portable execution passed; the runner reports its 28 excluded owner-bound files as unavailable, not failed |
| `npm run check:bilingual` | Passed, 19 route pairs |
| `npx tsc --noEmit` | Passed |
| `WITNESS_TREE_DATA_ROOT=/Volumes/Extended_SSD/Witness_Tree-data node --test tests/phase2-official-published-harvest-comparator.test.mjs` | Passed, 6 tests; no skips |
| `node --import tsx --test tests/official-published-harvest-page.test.tsx` | Passed, 4 tests |
| `node --test tests/staged-acquisitions.test.mjs` | Passed, 17 tests; existing manifest only |
| `npm run check:phase2-official-published-harvest-receipt-bytes` | Passed with exact external readback; historical receipt unchanged |
| `npm run check:cross-record-facts` | Passed, 11 facts |
| `npm run check:data-root-test-currency` | Passed; the existing receipt still covers all 28 owner-bound tests; no new owner test run is claimed |
| `npx eslint lib/phase2/official-published-harvest-comparator.mjs scripts/extend-official-harvest-comparison.mjs components/transparency/OfficialPublishedHarvestComparison.tsx tests/official-published-harvest-page.test.tsx tests/phase2-official-published-harvest-comparator.test.mjs` | Passed |
| `git diff --check` | Passed |

The guarded preparation command was also invoked and stopped with
`WP1 blocked: the exact NFD acquisition must pass the staging checker before row generation`.
This is a staging-policy block, not unavailable SSD evidence and not a successful
end-to-end generation run.

Remaining before WP1 is complete:

1. Resolve the exact HTTP/HTTPS checker conflict without an unapproved exception.
2. Stage the acquisition and update the total and per-entry checks together.
3. Run the guarded generator and publish the extended JSON to the existing route.
   Preserve the exact historical artifact and receipt semantics; do not rebind
   historical publication to newly generated bytes or invent a deployment event.
4. Repeat the affected checks and obtain green PR checks. The existing critical
   dependency advisory must be resolved without bypassing branch protection or
   including an unapproved dependency expansion in this package.

The checked-in comparison therefore still has 118 rows. No deployment has been
performed. Phase 2 remains 2/4. WP2, WP4 and WP3 have not started because the
required preceding green PR does not yet exist. This record does not close WP1.
