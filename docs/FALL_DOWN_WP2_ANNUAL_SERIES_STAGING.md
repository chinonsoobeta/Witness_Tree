# WP2: annual-area series and supporting files

Recorded 2026-09-12. All 62 staging entries verified; full suite and full data-root inventory passed.
WP1 PR #160 passed all GitHub checks before this package started.
Specification: `docs/FALL_DOWN_ARTICLE_SUPPORT_PLAN.md` at `64346e4`.

## Entitlement and publication boundary

These are annual observed-area inputs and series. Annual values may be reported
only with their source scope, coverage grade and unknown area. They may not be
summed into a multi-year total. The province aggregate remains the existing fixed
window and ignores the year control. A dated disturbance pixel is not evidence
of repeat disturbance, current forest condition, or successful regeneration.

Il s’agit de données et de séries annuelles de superficie observée. Chaque valeur
publiée doit conserver la portée de sa source, son degré de couverture et sa
superficie inconnue. Les valeurs ne peuvent pas être additionnées pour produire
un total pluriannuel. L’agrégat provincial conserve sa fenêtre fixe et ne tient
pas compte du sélecteur d’année. Un pixel de perturbation datée ne prouve ni une
perturbation répétée, ni l’état forestier actuel, ni une régénération réussie.

The requested manifest path records local provenance, not immutable storage,
data admission, ingestion or production eligibility. No payload is copied to the
repository or internal disk. The SSD remains the sole data copy.

## Complete directory scope

All 62 existing files in the two specified SSD directories are included:

| SSD directory under `derived/` | Files | Bytes | Contents |
| --- | ---: | ---: | --- |
| `provincial-annual-series-20260909/` | 18 | 452724385 | Four annual JSON files, province-window JSON, five boundary members, four reprojected province vectors and four jurisdiction masks |
| `bc-annual-series-20260909/` | 44 | 55948476561 | BC annual JSON, 39 extracted VLCE2 TIFFs, two disturbance TIFFs and two world files |

The per-file entries in `data/staged-acquisitions.json` identify each original
filename, exact SSD-relative path, byte length, SHA-256, CRC64NVME, modification
time, source, licence, derivation and bilingual publication boundary. The matching
`WP2_ANNUAL_FILES` assertions in `tests/staged-acquisitions.test.mjs` pin each file
individually in addition to the whole-manifest byte total. Supporting rasters and
boundary files have not been silently omitted.

## Sources, rights and time semantics

- NRCan VLCE2 annual land cover is version 2. Its year is an annual layer, not a
  retrieval date. The source record and official catalogue identify the Open
  Government Licence - Canada. The requested Hermosilla et al. (2016) citation is
  retained, as for the already-staged harvest and fire products.
- NRCan harvest and fire sources cover recorded change years 1985–2022; their
  publisher edition is undeclared. Existing extracted TIFF and world-file members
  are staged without regenerating or modifying them.
- The four-province computation uses the Statistics Canada 2021 provincial
  cartographic boundary. Its bundled `lpr_000b21a_e.xml` explicitly identifies the
  Open Government Licence - Canada and the 2021 edition. The derived vectors and
  raster masks delimit jurisdictions; they are not forest masks.
- The separate BC computation uses the GeoBC terrestrial boundary. Its verified
  source metadata identifies the Open Government Licence - British Columbia. The
  BC annual JSON therefore retains this additional licence and attribution along
  with the NRCan terms. The two BC boundary frames are not interchangeable.
- No publisher edition is declared for a combined local derivation. Its
  `sourceVersion` is `undeclared`; the project directory date is not substituted
  for an edition.
- As requested, `retrievedAt` is read from each staged file's existing modification
  time in UTC. Extracted members can retain archive timestamps from 2025. These
  are neither a new retrieval date nor proof of when upstream downloads finished.
  Each entry explains this basis in both languages, and the manifest convention
  explicitly distinguishes derived-tree timestamps from raw download completion.

Source records inspected directly:
`data/vlce2-promotion-preparation.json`, the existing NRCan harvest/fire entries,
the extracted StatCan boundary XML, and
`raw/bc-boundary-terrestrial/2026-08-14/BC_Boundary_Terrestrial.gdb.zip.metadata.json`
on the SSD. No licence was accepted and no gated order route was used.

## What the existing files do and do not prove

The five annual-series JSON files each contain 39 land-cover years and joint
class-by-harvest-year and class-by-fire-year counts. Every joint table reconciles
to its recorded jurisdiction cell count. The disturbance-year marginal counts
are unchanged across the land-cover-year axis. All known classes and the separate
unmapped bucket are retained; this audit did not select a forest class set.

The source limitations are material. The disturbance products cover the publisher's
forested-ecosystem footprint, include an agricultural mask, assign one recorded
change year per pixel and share Landsat composites with the land-cover product.
Their cross-tabulation is not independent validation. The `none` bin means no
recorded disturbance; outside the footprint it is unknown, never a measured zero.
The unknown bucket must not be silently merged with any reported class.

The existing JSON files do not provide per-row coverage grades or required-input
unknown-area fields. Their internal reconciliation is not a substitute for those
fields. Staging is therefore complete only as provenance preparation; it does not
by itself justify serving the whole files as graded public measurements or filling
Explore's recovery mode. This package makes no new public Quebec-fire ranking or
multi-year total, and does not change the forest-mask decision or admission gates.

## Validation and evidence audit

The checksum pass uses all 10 CPUs through a bounded worker pool. Whole-file
CRC64NVME uses reflected polynomial `0x9a6c9329ac4bc9b5`, all-ones initial and
final XOR, and lower-case hexadecimal output. The implementation passed the
`123456789` vector (`ae8b14860a799888`) and independently matched the already
verified NFD CSV digest (`ef1972d415353fcf`). SHA-256 and CRC read the same byte
stream. File metadata is checked before and after reading; structural checks use
read-only GDAL, JSON/XML parsers, world-file validation and GeoPackage quick_check.

No computation job that overwrites existing outputs was rerun. The completed
inventory result is recorded in the final section below.


All 62 files passed whole-file SHA-256, CRC64NVME and read-only structural checks.
Their combined size is 56401200946 bytes. The manifest now contains 83 entries,
with a literal total of 105345312334 bytes. The staging tests pass (20 tests),
including every per-file byte length, both digests and timestamp, plus path and
missing-lineage rejection cases.

Before refreshing the staged-manifest digest, all 115 existing field-audit
bindings were checked against their exact JSON pointers and expected values.
Every previous acquisition entry is unchanged. The source ledger remains two
complete and admitted core rows out of 22, with nine optional rows still tracked.
Its stated universal-ledger failure reason is unchanged; Phase 1 remains 2/4.
Only the field-audit digest in the downstream Phase 1 exit record was refreshed;
no record binds that exit record's old digest. The field-audit, Phase 1 exit and
cross-record checkers pass. No owner-admitted payload digest or gate count moved.


The first owner-bound run at commit `b3b8c21444fdb5847e1799a4ffe5e26776d09c28`
recorded 27 passing files and one PLVI mocked-runner timeout at 120 seconds while
other SSD reads were active. That failed receipt was preserved in commit
`56bf865c17c80ac559e977e3d24ca401841b5e9d`. The PLVI guarded fingerprint was
identical to the passing WP1 run. With the competing inventory paused, the
unchanged PLVI test passed all seven cases in 18.96 seconds. The full owner suite
was then rerun from the clean `56bf865c17c80ac559e977e3d24ca401841b5e9d` tree:
all 28 files passed, with the receipt recorded at `2026-09-12T16:13:28Z`. No test,
timeout or failure record was rewritten to claim a pass.

To implement the owner's local parallelism instruction, the inventory verifier
now discovers the full tree, hashes files through a bounded pool sized to the
available CPUs, waits for every worker, and checks every discovered path's
metadata again before issuing a result. The full-root scope, SHA-256 reads,
O_NOFOLLOW, file-descriptor stability and byte-count checks, symlink treatment,
output format, no-overwrite rule and unavailable/failure distinction are retained.
The existing inventory test was extended with 24 distinct nested payloads to
verify deterministic, complete per-file digests and unchanged source bytes.
All five inventory tests pass, including deliberate corruption, removal, addition,
symlink and output-location cases. The interrupted serial scan is not represented
as a completed inventory.

`npm run build`, `npm run test:suite`, `npm run check:bilingual`, TypeScript and
lint passed. The portable suite reports its 28 excluded owner-bound files as
unavailable; the separate successful owner receipt supplies those results.
The 125-check CI sweep found only the pending owner-receipt currency check; after
the actual full rerun, `npm run check:data-root-test-currency` also passed. The
full portable suite passed again after the inventory concurrency change.

## Full data-root inventory

The parallel inventory verifier ran read-only over the complete SSD data root at
`/Volumes/Extended_SSD/Witness_Tree-data`, from `2026-09-12T16:15:33.356Z` to
`2026-09-12T19:30:42.377Z`, and returned `status: passed` with zero errors.

| Measure | Value |
| --- | ---: |
| Files | 739642 |
| Bytes | 908827811932 |
| Directories | 1405 |
| Symlinks (recorded, not followed) | 4 |
| Tree SHA-256 | `f4d0f59ad4391f18cd64b840c9bd47ad231eb5955a83b07b14118287186d999f` |

The manifest itself is 261,795,250 bytes with SHA-256
`0f7369ae8e2770ad45d4c947cfb4c53a735ff4a2d7c8a7d1d7ac5e7006a5806a`. It is kept
outside the repository and outside the data root, as the verifier requires, and
is not committed. It carries `backup: false` and `recoveryDemonstrated: false`:
an inventory is evidence of what the tree held at completion, not a copy of it
and not proof that it can be restored.

The digest describes the tree as of the completion instant only. The data root
was no longer present on this machine when it was next checked, shortly after
completion. No further read of the data root is claimed by this record, and no
later state of the tree is inferred from this digest.
