# Implementation status

**Status: Version 2.1 implementation remains incomplete.** The public site is a **technical preview with illustrative data**, not a completed public-data product or a public beta. The authoritative phase-by-phase counts are in the [plan gap matrix](PLAN_GAP_MATRIX.md); they must not be converted into a single overall percentage.

## Current Phase 1 and 2 position

### Phase 1 – 2/4 (50%) formal exit criteria

Two criteria pass: national coverage geometry and the corruption-validation suite. Two do not:

- The production source ledger is incomplete: **2/22 core rows** have every required field and production admission.
- Archive/refetch/restore evidence is not yet universal for every required raw file.

The recovered federal-electoral pair, four current-wildfire raw payload/manifest pairs, two derived wildfire payload/manifest pairs, Québec fourth-inventory's 62-object product, and the NBAC primary payload have checksum-bound exact-version evidence. NBAC's receipt proves primary readback and COMPLIANCE retention but not recovery. The normal archive-control exercise also completed its legal-hold, denied-delete, unchanged-retention, and bounded recovery-replica checks. The canonical external-SSD inventory verifies all 120 listed physical artifacts; 17 core rows have all listed canonical local bytes, the provincial-boundary row is partial, and four rows are unstaged. These facts do not satisfy universal archive recovery or prove remaining transformations, admission, or release. See [Phase 1 exit status](PHASE1_EXIT_STATUS.md), [canonical raw inventory](PHASE1_CANONICAL_RAW_INVENTORY.md), [federal recovery evidence](FEDERAL_ELECTORAL_ARCHIVE_RECOVERY_2026-08-25.md), [current-wildfire exact capture](CURRENT_WILDFIRE_EXACT_RAW_ARCHIVE_CAPTURE_2026-08-25.md), and [Québec fourth-inventory promotion/readback](QC_FOURTH_INVENTORY_IMMUTABLE_PROMOTION.md).

A source-review process for publisher updates, corrections, licence changes, and reprocessing is defined in [source review](SOURCE_REVIEW.md), with the decision contract in `lib/source-review/` and the registered baselines in [`data/source-review-register.json`](../data/source-review-register.json). No review has been run against a live publisher change; the register records baselines only, and it cannot grant re-acceptance, immutable promotion, or production eligibility.

The current Phase 1 ledger is **17.00/31 raw credits**, with a bounded evidence-tracking score of **41.4516129%**. Its evidence-state counts are 14 `remote-verified-archived-profiled`, one `local-verified-profiled` row (`cwfis-historical`), one `partial-component`, 13 `access-blocked`, and two `production-admitted` rows. The tracker is not a Phase 1 completion or production percentage.

The exact NBAC ZIP was acquired on 2026-08-27 under the current official Open Government Licence - Canada metadata. It is 1,257,052,370 bytes with SHA-256 `c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165`; ZIP integrity passed, and the local profile records 52,610 polygons with 49 ring self-intersections quarantined. The durable receipt proves exact-version primary payload readback and COMPLIANCE retention. Recovery, transformation, ingestion, release, publication, and production admission remain false. See [`NBAC profile`](../data/phase1-nbac-profile-2026-08-27.json), [`archive receipt`](../data/nbac-archive-receipt-2026-08-27.json), and [`IAM readback`](../data/nbac-archive-iam-applied-2026-08-27.json).

### Phase 2 – 2/4 (50%) formal exit criteria

The local Version 2.1 implementation contract specifies **11 national snapshots** and **10 whole-interval rasters**, calculates each interval across every annual pair, and fails closed for incompatible grid/CRS/nodata/Unknown/lineage/sidecar conditions.

Real Version 2.1 execution and readback are complete for all **21/21 outputs**: 11 selected snapshots and 10 whole-interval rasters. The exact limited admission record binds those outputs and sidecars, all 39 versioned VLCE2 source archives, the method, and the exact Statistics Canada 2021 boundary plus 13-row 2020–2022 aggregate. This closes the baseline and boundary-aggregate gates without granting release or production eligibility. Phase 2 remains **2/4** because expert review is 0/100 in every province and no formal published independent-comparison envelope exists. A separate historical annual run now has an exact fractional-boundary correction across 5,113,929 candidate cells and a checksum-bound 152-row NFD comparison: 34 descriptive rows are computed and 118 remain pending. The comparison remains non-like-for-like, nonadmitted, and unpublished, so it does not close the formal independent-comparison gate. The earlier binary-mask receipt remains preserved as superseded method evidence. Historical 39-mask/38-loss artifacts remain audit-only and may not be represented as Version 2.1 outputs. See [formal status](PHASE2_FORMAL_EXIT_STATUS.md), [fractional comparison receipt](../data/phase2-annual-nfd-fractional-comparison-receipt-2026-08-27.json), [earlier binary comparison receipt](../data/phase2-annual-nfd-provisional-comparison-receipt-2026-08-27.json), [owner admission packet](PHASE2_OWNER_ADMISSION_PACKET.md), [V2.1 interval contract](PHASE2_V21_INTERVAL_RASTER_CONTRACT.md), [readback evidence](PHASE2_V21_RASTER_READBACK.md), and [zonal aggregation](PHASE2_ZONAL_AGGREGATION.md).

## Other formal phase counts

Version 2.1 does not assign Phase 3 a cumulative percentage. Its five literal published exit criteria are nonetheless gated and counted, at 4/5 with moderated bilingual usability testing owner-blocked; that count is not a maturity score and does not mean the phase is four fifths complete. Its historical checkpoint records four completed technical-foundation evidence groups and one execution-ready, empty external-checkpoint envelope; that shorthand is not a Phase 3 exit result or a production-readiness measure.

Phase 0 is complete under its recorded scope: seven of its eight literal gates pass, and the remaining Indigenous-engagement gate is an explicit accountable-owner-approved exclusion. The passed-only count is **7/8 (87.5%)**. The legal sign-off is owner-recorded, and bilingual name registration is owner-attested complete; neither claim is represented as an independent counsel opinion or public registrar evidence. No engagement route, five-business-day test, or engagement occurred, and Witness Tree will not claim otherwise. This Phase 0 scope decision does not close the separate Phase 7 production source or right-of-reply gates.

| Phase | Current count | Boundary |
| --- | --- | --- |
| Phase 0 | **7/8 passed-only (87.5%); complete under recorded scope** | Seven literal gates pass. The eighth is the explicit accountable-owner-approved Indigenous-engagement exclusion, not an engagement result. Legal sign-off is owner-recorded and bilingual name registration is owner-attested complete. No engagement route, test, or engagement occurred. Phase 7 production source and right-of-reply gates remain open. |
| Phase 3 | **No cumulative percentage (Version 2.1)**; literal exit criteria **4/5** | Four historical technical-foundation evidence groups are recorded; real national place content, admitted Phase 2 aggregates, and required human/release checkpoints remain open. |
| Phase 4 | **3/4 (75%)** | Provincial safeguards exist; admitted enhancement inputs and published match results do not. |
| Phase 5 | **4/4 (100%) local; production blocked** | Simulation and safety controls do not establish real feed rights, operations, or deployment. |
| Phase 6 | **4/5 (80%)** | Managed Canadian database isolation is proven. Sender infrastructure and the independent timed kill-switch rehearsal remain absent. |
| Phase 7 | **14/16 (87.5%)** | The Mistik outcome is recorded as not pursued. Indigenous-source authority and a named tested reply operation remain missing. |
| Phase 8 | **6/16 (37.5%)** | Raw-archive reproducibility and the operations handbook now pass. Independent review and operated production evidence remain incomplete. |
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
