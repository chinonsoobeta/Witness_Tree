# Implementation status

**Status: Version 2.1 implementation remains incomplete.** The public site is a **technical preview with illustrative data**, not a completed public-data product or a public beta. The authoritative phase-by-phase counts are in the [plan gap matrix](PLAN_GAP_MATRIX.md); they must not be converted into a single overall percentage.

## Current Phase 1 and 2 position

### Phase 1 – 3/3 formal exit criteria, complete

On 2026-09-26 the owner removed the gate requiring every raw file to be re-fetchable or restorable from the archive, and withdrew the four reserve and treaty rows from the ledger core. See [the phase scope decision](PHASE_SCOPE_DECISION_2026-09-26.md). The same day every one of the 18 core rows received every required ledger field, bound to [the ledger facts](../data/phase1-ledger-facts-2026-09-26.json), whose publisher facts come from each publisher's catalogue record ([readback](../data/phase1-catalogue-readback-2026-09-26.json)). The checker derives the ledger gate from the field audit. Production admission is separate and remains 2/18. The history below records the position before that decision.

The recovered federal-electoral pair, four current-wildfire raw payload/manifest pairs, two derived wildfire payload/manifest pairs, Québec fourth-inventory's 62-object product, and the NBAC primary payload have checksum-bound exact-version evidence. NBAC's receipt proves primary readback and COMPLIANCE retention but not recovery. The normal archive-control exercise also completed its legal-hold, denied-delete, unchanged-retention, and bounded recovery-replica checks. The canonical external-SSD inventory verifies all 120 listed physical artifacts; 17 core rows have all listed canonical local bytes, the provincial-boundary row is partial, and four rows are unstaged. These facts do not satisfy universal archive recovery or prove remaining transformations, admission, or release. See [Phase 1 exit status](PHASE1_EXIT_STATUS.md), [canonical raw inventory](PHASE1_CANONICAL_RAW_INVENTORY.md), [federal recovery evidence](FEDERAL_ELECTORAL_ARCHIVE_RECOVERY_2026-08-25.md), [current-wildfire exact capture](CURRENT_WILDFIRE_EXACT_RAW_ARCHIVE_CAPTURE_2026-08-25.md), and [Québec fourth-inventory promotion/readback](QC_FOURTH_INVENTORY_IMMUTABLE_PROMOTION.md).

A source-review process for publisher updates, corrections, licence changes, and reprocessing is defined in [source review](SOURCE_REVIEW.md), with the decision contract in `lib/source-review/` and the registered baselines in [`data/source-review-register.json`](../data/source-review-register.json). No review has been run against a live publisher change; the register records baselines only, and it cannot grant re-acceptance, immutable promotion, or production eligibility.

The current Phase 1 ledger is **17.00/31 raw credits**, with a bounded evidence-tracking score of **41.4516129%**. Its evidence-state counts are 14 `remote-verified-archived-profiled`, one `local-verified-profiled` row (`cwfis-historical`), one `partial-component`, 13 `access-blocked`, and two `production-admitted` rows. The tracker is not a Phase 1 completion or production percentage.

The exact NBAC ZIP was acquired on 2026-08-27 under the current official Open Government Licence - Canada metadata. It is 1,257,052,370 bytes with SHA-256 `c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165`; ZIP integrity passed, and the local profile records 52,610 polygons with 49 ring self-intersections quarantined. The durable receipt proves exact-version primary payload readback and COMPLIANCE retention. Recovery, transformation, ingestion, release, publication, and production admission remain false. See [`NBAC profile`](../data/phase1-nbac-profile-2026-08-27.json), [`archive receipt`](../data/nbac-archive-receipt-2026-08-27.json), and [`IAM readback`](../data/nbac-archive-iam-applied-2026-08-27.json).

### Phase 2 – 2/2 formal exit criteria, complete

On 2026-09-26 the owner removed the expert-review and published-independent-comparison criteria from the count, so the two admitted criteria make Phase 2 complete. Neither removed criterion was met, and neither is claimed. See [the phase scope decision](PHASE_SCOPE_DECISION_2026-09-26.md). The history below records the position before that decision.

The local Version 2.1 implementation contract specifies **11 national snapshots** and **10 whole-interval rasters**, calculates each interval across every annual pair, and fails closed for incompatible grid/CRS/nodata/Unknown/lineage/sidecar conditions.

Real Version 2.1 execution and readback are complete for all **21/21 outputs**: 11 selected snapshots and 10 whole-interval rasters. The exact limited admission record binds those outputs and sidecars, all 39 versioned VLCE2 source archives, the method, and the exact Statistics Canada 2021 boundary plus 13-row 2020–2022 aggregate. This closes the baseline and boundary-aggregate gates without granting release or production eligibility. Phase 2 remains **2/4** because the expert-review criterion was retired on 30 August 2026 at 0/100 in every province, where it stays counted as not complete, and because no formal published independent-comparison envelope exists. A separate historical annual run now has an exact fractional-boundary correction across 5,113,929 candidate cells and a checksum-bound 152-row NFD comparison: 34 descriptive rows are computed and 118 remain pending. The official recovery pass for those NFD rows is complete: candidate coverage is **118/118**, with **0 safe exact replacements**, **104 rounded all-tenure historical candidates**, and **14 later limited-scope candidates**. The strict NFD values remain null. A separate official-source public artifact now presents the 104 Statistics Canada values with their 50-hectare rounding half-width and leaves the 14 restricted later values unpublished. It does not mix the rounded series into the exact NFD track. The comparison remains non-like-for-like and does not close the formal independent-comparison gate. See the [official published comparison receipt](../data/phase2-official-published-harvest-comparison-receipt-2026-08-27.json), [official recovery audit](../data/phase2-nfd-official-recovery-audit-2026-08-27.json), [formal status](PHASE2_FORMAL_EXIT_STATUS.md), [fractional comparison receipt](../data/phase2-annual-nfd-fractional-comparison-receipt-2026-08-27.json), [earlier binary comparison receipt](../data/phase2-annual-nfd-provisional-comparison-receipt-2026-08-27.json), [owner admission packet](PHASE2_OWNER_ADMISSION_PACKET.md), [V2.1 interval contract](PHASE2_V21_INTERVAL_RASTER_CONTRACT.md), [readback evidence](PHASE2_V21_RASTER_READBACK.md), and [zonal aggregation](PHASE2_ZONAL_AGGREGATION.md). The earlier binary-mask receipt remains preserved as superseded method evidence. Historical 39-mask/38-loss artifacts remain audit-only and may not be represented as Version 2.1 outputs.

The corrected annual province execution now measures the mapped-extent defect rather than relying on district samples. All four provinces have partial coverage: the unknown shares are 0.004464% in British Columbia, 24.021462% in Alberta, 9.030311% in Ontario and 15.049623% in Quebec. Public mapped-part figures are therefore labelled as minima. The exact local, nonproduction output pair and coverage rows are bound in [`data/phase2-annual-province-zonal-v2-receipt-2026-08-29.json`](../data/phase2-annual-province-zonal-v2-receipt-2026-08-29.json); this correction does not move a formal Phase 2 gate.

The local federal riding comparison now uses the corrected 2021-2022 interval for all 343 districts under the 2023 Representation Order. Exactly 69 districts have complete mapped coverage; 57 of them meet the 500-hectare ranking floor and are rankable by detected-loss share, while 12 complete districts remain unranked below that floor. Another 91 retain partial coverage and 183 have no mapped coverage; those 274 keep total loss and share Unknown. The 205,143-byte generated comparison record has SHA-256 `84a5cf39868390bfacd9cfd7ac24045150f95c6527a7d34b58ca9d04313dc1c7` and binds the exact annual output, sidecar, mapped-extent verification and bilingual Elections Canada geometry.

The corrected district execution is also complete for the four provincial editions. The final 774-row map join contains 188 complete, 171 partial and 415 none-mapped districts. Every one of the 586 incomplete rows retains null total loss and share. On 2026-09-18 Alberta was re-sourced from the Government of Alberta's open-licence copy and Québec was re-read from Élections Québec's published bytes ([record](../data/provincial-electoral-sources-2026-09-18.json)); the grade counts did not change. The 517,524-byte checked-in record now has SHA-256 `a5adc6db951c5edde6515ef602443780067b2dbe717f5441e58f0f5414ddfc2b` (it was 517,447 bytes, `b0a3c6fb…`, before the re-source); its converter requires all five exact output/sidecar/marker sets before writing. Both localized Explore maps consume it through a runtime validator and expose only complete normalized shares and totals, while keeping known mapped-part loss separately labelled. These riding records remain local, non-admitted, non-released and nonproduction, and they do not satisfy the separate formal independent-comparison gate.

### VLCE accuracy boundary

The publisher cites the predecessor VLCE 2005 land-cover classification
accuracy as **70.3% +/- 2.5 percentage points (95% CI)**
([DOI: 10.1080/07038992.2018.1437719](https://doi.org/10.1080/07038992.2018.1437719)).
It is not detected-loss, district, every-year, or current VLCE2 validation.
Directly applicable detection accuracy remains **Unknown**.

### Comparison frameworks

The exact Statistics Canada 2021 economic-region geometry is source-admitted:
76 features and 76 distinct DGUIDs, including 44 regions in the four initial
provinces. The bilingual immutable v3 tile archive contains those 44 regions
clipped to the official province boundaries and passed exact S3 and CloudFront
readback.

Since 2026-09-27 each region has forest-loss figures for every span, in
[the region file](../data/phase3-economic-region-interval-measurements.json). The
riding method (`scripts/phase3_interval_zonal_aggregate.py`) was run over the
3,033 census subdivisions of the four provinces (2021 cartographic file, 10
workers, peak 534 MB, 38 minutes), and
`scripts/build-place-region-measurements.mjs` adds each subdivision into the region
its point on surface falls in. The 44 regions add up to the province figures to
within rounding. The same run gives the 2,291 published places their own figures:
the whole record for search in
[the place file](../data/place-whole-record-measurements.json), and every span for
the map's cities-and-towns layer, built by
`scripts/build-census-subdivision-overlay-tiles.mjs`. That layer's tiles and
per-province figure files are their own immutable release
([record](../data/census-subdivision-overlay-release.json)), uploaded with the
owner's approval on 2026-09-27 and read back exactly from S3 and CloudFront
([readback](../data/census-subdivision-overlay-release-readback.json)).
`npm run check:census-subdivision-overlay` holds the loader's pinned URLs to that
record and fails without the readback. Reserves, settlements and treaty or agreement lands get no figures of
their own; their land counts in the region totals.

The source-admitted watershed geometry is NRCan's national Water Survey of Canada
sub-drainage-area rollup archive, version 6.0 at 1:1,000,000 scale. It is a
single 50.9 MB federal ZIP with stable WSCSDA codes and bilingual names, and it
covers all four initial provinces. Exact staging found 184 coded features,
including 15 explicitly USA-only `U*` records; the recorded Canadian overlay
selection therefore contains 169. Intersecting that selection with the four
official province boundaries produces 105 coded areas, with cross-border
watersheds intentionally truncated. The immutable v3 boundary archive passed
exact S3 and CloudFront readback; no watershed forest-loss aggregate is claimed. The
older 164-area narrative is not being
substituted for the archive's measured contents. Statistics Canada did not
adopt NRCan version 6.0 for SDAC dissemination, so the released reference
overlay retains the NRCan version label rather than being called the current
SDAC.

The landing page and Explore map now share a province bar with compact inline
SVG renditions of all four flags. Public-domain source files are recorded in
`docs/THIRD_PARTY.md`, and no flag image is hotlinked at runtime. The owner
directed this use on 2 September 2026 without a separate authorization gate.

### Condition and recovery

On 2026-09-23 the owner recorded a scoped decision in
[the forest-mask decision record](VLCE2_FOREST_MASK_DECISION.md). For the Explore
"Condition and recovery" mode only, VLCE2 classes 210, 220 and 230 count as treed.
The decision resolves no register row and does not permit a forest mask.

`scripts/phase4_condition_recovery_v2.py` walks every cell of the four provinces
through 1984 to 2022 in one pass. It computes the three-class headline set and a
comparison-only set that adds class 81. Across the four provinces, 55.13 Mha was
lost, and 36.7% of it was treed again for three consecutive years after its latest
loss. 46.42 Mha is Unknown and excluded, never counted as zero. The run reproduces
the recorded federal recovery run within 0.01% of lost area per province, and the
recorded provincial annual series within 0.15 ha per year. See
[the evidence record](../data/phase4-condition-recovery-v2.json), checked by
`npm run check:phase4-condition-recovery-v2`.

Cause of the latest loss comes from the NTEMS fire and harvest year rasters with a
one-year window. Across the four provinces, 40.2% of lost area has no fire or harvest
recorded near its loss year and is shown as "cause not recorded", never as
undisturbed. `scripts/phase4_condition_recovery_results_check.py` compares our
recovery calls with BC RESULTS forest cover (OGL-BC) on the rule fixed before any
figure was computed. The comparison agreed on 61.1% of 25,295 polygons against an
80% target, so the target was not met. Agreement was 95.8% where RESULTS says not
restocked and 45.6% where it says regenerated, so the recovery figures likely
understate recovery. See [the cause and check record](../data/phase4-condition-recovery-cause-and-check.json),
checked by `npm run check:phase4-condition-recovery-cause-and-check`. The RESULTS
pages are bound in that record, not entered as a staged acquisition.

Both records are `local-nonproduction-executed` and nothing in them is admitted.

The figures the mode would show are in
[the Explore figures file](../data/phase4-condition-recovery-explore.json), built by
`scripts/build-phase4-condition-recovery-explore.mjs` from the v2 run output. It has
the four provinces and the 44 StatCan 2021 economic regions, each with its unknown
area, a coverage grade, recovery after the latest loss and after any loss, decades
and cause. A row, decade or cause with less than 500 ha lost shows its lost area and
withholds recovery; seven all-unknown southern regions are withheld this way. The
2015-2022 decade is labelled too recent to judge and 2005-2014 partial follow-up.
`scripts/phase4_condition_recovery_tiles.py` built per-cell tiles (z8 to 14) on the
data root. They are recorded in the same file and have not been uploaded. The
builder keeps memory bounded: GDAL 3.13's Python JSON export leaks about 3.6 KB per
feature and exhausted the machine twice, so geometry leaves GDAL as WKB, strips are
polygonized in 1024-column blocks, and four workers run by default. On macOS,
launch it with `caffeinate` and without zsh's background nice, or idle sleep and
I/O throttling stretch the run from hours to days. The PMTiles conversion reads a
temporary copy of the tile set on the local disk, because the USB data root
serves its random reads at about 15 tiles a second.
`lib/explore/condition-recovery.ts` reads the file and returns nothing unless it is
admitted and owner reviewed, so the mode stays empty. Checked by
`npm run check:phase4-condition-recovery-explore`. The French strings are drafts
awaiting bilingual review. The view itself is a separate change.

### Phase 4 provincial matching run

On 2026-09-26 the first Phase 4 matching run was computed for British Columbia and Québec: 11.1% of 100,731,284 detected changes match an official harvest, fire, insect or windthrow record (56% by area). An independent recount agrees exactly on four intervals. The owner admitted the run the same day ([admission](../data/phase4-provincial-matching-admission-2026-09-26.json)); it is published on the methods page in both languages ([publication](../data/phase4-provincial-matching-publication-2026-09-26.json)) and released as `phase4-provincial-matching-v1` ([release](../data/phase4-provincial-matching-release-2026-09-26.json)). The owner retired the outside provincial review checkpoint ([scope decision](PHASE_SCOPE_DECISION_2026-09-26.md)); no outside review took place. Phase 4 is 4/4. See [the run record](PHASE4_PROVINCIAL_MATCHING_RUN.md). A cross-tabulation of the same run shows what the provincial records add where the national rasters record no cause: in BC and Québec, 19% of that loss lies in changes matching a provincial harvest, fire, insect or windthrow record ([cross-tabulation](../data/phase4-provincial-cause-crosstab.json)).

### Harvest and fire by province

On 2026-09-25 the owner decided to publish the four provincial harvest and fire
series and to allow multi-year totals in that view only. See
[the decision record](HARVEST_FIRE_SERIES_DECISION.md). The series is
[the harvest and fire record](../data/harvest-fire-province-annual-series.json),
built by `scripts/build-harvest-fire-province-series.mjs` from the four WP2
provincial annual-series files and checked by
`npm run check:harvest-fire-province-series`, which rebuilds it byte for byte
when the data root is mounted. It holds harvest and fire cells per province for
1985 to 2022; 1984 is Unknown, and each province's unmapped part is Unknown and
equals the province span release's unmapped cells.

The Data page "Harvest and fire by province" (`/en/data/harvest-and-fire`,
`/fr/donnees/recolte-et-incendies`) builds a chart per province from the page
address: provinces, first and last year, single, five-year, ten-year or whole
span intervals, a shared or per-chart scale, and a table view. A reader can
download each chart as a PNG, drawn in the browser with its flag, notes and
sources, and the rows on screen as CSV. The Explore "Recorded harvest" and
"Wildfire" modes now show the same figures for the selected years in place of
example data, with a link to the page. The series is not expert reviewed, not a
formal release and not production eligible; the French strings are drafts
awaiting bilingual review.

## Other formal phase counts

Version 2.1 does not assign Phase 3 a cumulative percentage. Its five literal published exit criteria are nonetheless gated and counted, at 4/5 with moderated bilingual usability testing owner-blocked; that count is not a maturity score and does not mean the phase is four fifths complete. Its historical checkpoint records four completed technical-foundation evidence groups and one execution-ready, empty external-checkpoint envelope; that shorthand is not a Phase 3 exit result or a production-readiness measure.

Phase 0 is complete under its recorded scope: seven of its eight literal gates pass, and the remaining Indigenous-engagement gate is an explicit accountable-owner-approved exclusion. The passed-only count is **7/8 (87.5%)**. The legal sign-off is owner-recorded, and bilingual name registration is owner-attested complete; neither claim is represented as an independent counsel opinion or public registrar evidence. No engagement route, five-business-day test, or engagement occurred, and Witness Tree will not claim otherwise. This Phase 0 scope decision does not close the separate Phase 7 production source or right-of-reply gates.

| Phase | Current count | Boundary |
| --- | --- | --- |
| Phase 0 | **7/8 passed-only (87.5%); complete under recorded scope** | Seven literal gates pass. The eighth is the explicit accountable-owner-approved Indigenous-engagement exclusion, not an engagement result. Legal sign-off is owner-recorded and bilingual name registration is owner-attested complete. No engagement route, test, or engagement occurred. Phase 7 production source and right-of-reply gates remain open. |
| Phase 3 | **No cumulative percentage (Version 2.1)**; literal exit criteria **4/5** | Four historical technical-foundation evidence groups are recorded; real national place content, admitted Phase 2 aggregates, and required human/release checkpoints remain open. |
| Phase 4 | **4/4, complete** | Provincial safeguards pass, and the 2026-09-26 BC and Québec matching run is admitted, published in both languages and released. The owner retired the outside provincial review checkpoint; no outside review took place. |
| Phase 5 | **3/4 (75%) local; production blocked** | The safety and simulation controls pass. The dated 100-run receipt records zero real refresh successes; the observed runs of 2026-09-13 and 2026-09-14 record the first three, each archived and read back. The scheduled cadence still needs observation over a longer window that crosses a daylight saving transition. |
| Phase 6 | **4/5 (80%)** | Managed Canadian database isolation is proven. Sender infrastructure and the independent timed kill-switch rehearsal remain absent. |
| Phase 7 | **14/14, complete** | On 2026-09-26 the owner removed the reserve-and-treaty layer gate and the right-of-reply gate, which the Plan scopes to reserve and treaty pages, because Witness Tree will not publish that geography. No reserve or treaty geometry, name or reply route exists. The modes-and-overlays gate covers the released federal-riding, provincial-riding, economic-region and watershed reference boundaries. |
| Phase 8 | **8/16 (50%)** | Raw-archive reproducibility, the operations handbook, bounded independently retrieved bulk downloads, and CDN/tile validation pass. Sites version 43 deployed main commit `8da80114743c2ad6436d255862f88ebd466c7f53` through the Sites-history reconciliation merge `96ad8e140f1f0213e45a46d84a4e2cb815d6d191`; the browser observation at `data/deployed-map-render-evidence-2026-09-27-v43.json` passed all five checks. The owner-authorized break-glass is deleted because the deployed Site observation settled the gate. Later on 2026-09-26 the Explore map framing fix moved the map client after that observation. The render gate now answers that as awaiting deploy instead of blocking merges, and a daily workflow (`.github/workflows/deployed-map-render.yml`) drives the live Site in a real browser, so the break-glass was deleted. `npm run verify:deploy-source <commit>` proves a deploy carries the tree of a commit on `main`. Other operated production evidence remains incomplete. |
| Phase 9 | **0/4 (0%)** | No operated beta, real correction metrics, source-agency confirmation, or quarterly published-figure reproduction. |

The underlying machine-checked records are [Phase 4](../data/phase4-exit-status.json), [Phase 5](../data/phase5-live-wildfire-exit-status.json), [Phase 6](../data/phase6-account-alert-exit-status.json), [Phase 7](../data/phase7-indigenous-explore-comparison-exit-status.json), [Phase 8](../data/phase8-launch-readiness-exit-status.json), and [Phase 9](../data/phase9-public-beta-launch-exit-status.json).

## Non-negotiable evidence discipline

- Never turn an illustrative fixture, local contract, historical artifact, or preview URL into a production data claim.
- Display insufficient evidence as `Unknown`, with its reason; never convert it to zero.
- Retain source, version, licence, time range, boundary edition, denominator, coverage, method, and limitation with every public result.
- Keep accounts and alerts disabled until the closed activation gate has real Canadian-hosting, security/privacy/legal, sender, unsubscribe, queue, kill-switch, and incident-operation evidence.
- Keep asserted traditional territories out of Version 1 analysis and rankings unless separately authorized.

## External work that remains external

Written source rights and publisher terms, bilingual editorial review, Phase 7 production source and right-of-reply operations, independent accessibility and scientific validation, production infrastructure and on-call evidence, and formal release/launch decisions remain outside the repository. The recorded Phase 0 legal sign-off and bilingual name-registration attestation have their stated limited scope and do not substitute for those later gates. They are tracked in [external gates](EXTERNAL_GATES.md); no test or documentation change can honestly close them.

## Verification posture

Run the focused checker for any changed evidence record, then use the repository’s normal typecheck, lint, build, test, and diff checks before integration. A green local check demonstrates only the scope it covers; it does not supersede the gate boundaries recorded above.
