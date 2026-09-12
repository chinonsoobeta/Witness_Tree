# WP1: NFD harvest comparison through 2022

Recorded 2026-09-12. **Implemented; final verification in progress.**
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

The official terms page states Open Government Licence – Canada 2.0. The staged
entry is `sourceId: nfd-5.2-undeclared`, `licenceId: ogl-canada`,
`licenceUrl: https://open.canada.ca/en/open-government-licence-canada`,
`attributionState: metadata-verified`, `immutableObjectStorage: false`, and
`productionEligible: false`. The table includes attribution in English and French
when NFD rows are supplied.

## Transport conflict: not an unreachable dataset

The exact download advertised by the publisher is:

<http://nfdp.ccfm.org/download/data/csv/NFD%20-%20Area%20harvested%20by%20ownership%20and%20harvesting%20method%20-%20EN%20FR.csv>

HTTP retrieval succeeded. The same host's HTTPS endpoint refused connections
on port 443. On 2026-09-12 the owner approved a narrowly scoped exception to the
HTTPS requirement. The checker accepts this one source ID and exact URL only
when byte length, SHA-256 and CRC64NVME also match the verified payload. Mutations
to any of these identifiers are rejected by the staging regression test; other
HTTP sources remain rejected. No source or licence was substituted.

The manifest and per-entry assertions were updated together. The literal total
is **48944111388** bytes. Supporting HTTP notices remain on the SSD and are
identified above, without invented HTTPS retrieval URLs.

## Implemented behaviour

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

The guarded generator wrote and read back
`derived/fall-down-wp1-20260912/comparison.json` on the SSD: 309450 bytes,
SHA-256 `01c3a033b528022689a4384518178b477eea10140e9c719109f2980aea7a6d36`.
The public comparison is byte-identical and contains 132 rows, including the
14 computable new rows. The exact 118-row historical public artifact is retained
as `data/phase2-official-published-harvest-comparison-1990-2019.json`:
283062 bytes, SHA-256
`c896b5d63dcb5c2c12e45b2085174ba9e8371f3583785d4a344bf7b79fc506b0`.
The historical receipts point to that preserved artifact. Their original output
and public-payload checksums, source revision and publication event remain intact;
the prepared-receipt binding was refreshed solely for the repository path move.
Both historical receipt checkers still verify the original SSD bytes.

The current NFD BC values are 155443.24 ha (2020), 142943.108 ha (2021), and
112901.942 ha (2022). `(112901.942 / 155443.24 - 1) * 100` is
**-27.367737574178197 percent**, not the plan's 33 percent. This is a comparison
of two annual published values, not a sum of annual imagery intervals. No 33
percent claim has been added to the site.

## Security prerequisite and evidence audit

The owner approved fixing the existing MapLibre critical advisory
GHSA-jrc7-96c5-q579 as a WP1 prerequisite. This reuses the repository's existing
6.9.0 dependency update and its exact vendored worker assets. Production audit
now reports zero vulnerabilities; the worker asset checker passes all 12 tests.
A fresh remote map observation is required because the map client changed.
No stale observation is rebound to the new code.

All 115 staged-manifest field bindings were checked against their JSON pointers
and expected values before refreshing the manifest digest. Every pre-existing
manifest entry is unchanged. The ledger remains 31 rows, 22 core and nine optional,
with two complete and admitted core rows. The Phase 1 exit record's audit digest
was refreshed after confirming its universal-ledger failure reason remains true;
Phase 1 remains 2/4. No downstream file binds the prior Phase 1 exit-record digest.
No owner-admitted payload checksum or gate count changed. Phase 2 remains 2/4.

## Verification

Commands run from the specified `wt/premises` worktree. Clean `origin/main` at
`bb46e3748c16ba8fc155ecbb5b280c2befa9d6d9` passed the build, portable suite and
all 125 CI package checks before edits. The independent sweep used all 10 CPUs.
The original production dependency audit failed on MapLibre 6.3.0.

The final WP1 verification and remote-observation results are recorded below
once completed. WP2, WP4 and WP3 cannot start until WP1's PR checks are green.
