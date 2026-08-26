# Implementation status

**Status: Version 2.1 implementation remains incomplete.** The public site is a **technical preview with illustrative data**, not a completed public-data product or a public beta. The authoritative phase-by-phase counts are in the [plan gap matrix](PLAN_GAP_MATRIX.md); they must not be converted into a single overall percentage.

## Current Phase 1 and 2 position

### Phase 1 — 2/4 (50%) formal exit criteria

Two criteria pass: national coverage geometry and the corruption-validation suite. Two do not:

- The production source ledger is incomplete: **0/22 core rows** have every required field and production admission.
- Archive/refetch/restore evidence is not yet universal for every required raw file.

The recovered federal-electoral pair, four current-wildfire raw payload/manifest pairs, two derived wildfire payload/manifest pairs, and Québec fourth-inventory's 62-object product are checksum-bound at exact immutable versions with the recorded retention. The normal archive-control exercise also completed its legal-hold, denied-delete, unchanged-retention, and recovery-replica checks. These are material archive/control facts, but they do not satisfy the universal all-source criterion or prove remaining recovery replicas, transformations, admission, or release. Restricted optional datasets are tracked separately and do not block the 22-source core baseline. See [Phase 1 exit status](PHASE1_EXIT_STATUS.md), [current-state completion audit](PHASE1_CURRENT_STATE_COMPLETION_AUDIT.md), [source-ledger audit](PHASE1_SOURCE_LEDGER_FIELD_AUDIT.md), [federal recovery evidence](FEDERAL_ELECTORAL_ARCHIVE_RECOVERY_2026-08-25.md), [current-wildfire exact capture](CURRENT_WILDFIRE_EXACT_RAW_ARCHIVE_CAPTURE_2026-08-25.md), and [Québec fourth-inventory promotion/readback](QC_FOURTH_INVENTORY_IMMUTABLE_PROMOTION.md).

A source-review process for publisher updates, corrections, licence changes, and reprocessing is defined in [source review](SOURCE_REVIEW.md), with the decision contract in `lib/source-review/` and the registered baselines in [`data/source-review-register.json`](../data/source-review-register.json). No review has been run against a live publisher change; the register records baselines only, and it cannot grant re-acceptance, immutable promotion, or production eligibility.

### Phase 2 — 2/4 (50%) formal exit criteria

The local Version 2.1 implementation contract specifies **11 national snapshots** and **10 whole-interval rasters**, calculates each interval across every annual pair, and fails closed for incompatible grid/CRS/nodata/Unknown/lineage/sidecar conditions.

Real Version 2.1 execution and readback are complete for all **21/21 outputs**: 11 selected snapshots and 10 whole-interval rasters. The exact limited admission record binds those outputs and sidecars, all 39 versioned VLCE2 source archives, the method, and the exact Statistics Canada 2021 boundary plus 13-row 2020–2022 aggregate. This closes the baseline and boundary-aggregate gates without granting release or production eligibility. Phase 2 remains **2/4** because expert review is 0/100 in every province and the required independent comparisons remain uncomputed/null. Historical 39-mask/38-loss artifacts are retained only for audit and may not be represented as Version 2.1 outputs. See [formal status](PHASE2_FORMAL_EXIT_STATUS.md), [owner admission packet](PHASE2_OWNER_ADMISSION_PACKET.md), [V2.1 interval contract](PHASE2_V21_INTERVAL_RASTER_CONTRACT.md), [readback evidence](PHASE2_V21_RASTER_READBACK.md), and [zonal aggregation](PHASE2_ZONAL_AGGREGATION.md).

## Other formal phase counts

Version 2.1 does not assign Phase 3 a cumulative percentage. Its historical checkpoint records four completed technical-foundation evidence groups and one execution-ready, empty external-checkpoint envelope; that shorthand is not a Phase 3 exit result or a production-readiness measure.

| Phase | Current count | Boundary |
| --- | --- | --- |
| Phase 0 | **5/8 (62.5%)** | Local foundation work does not replace approvals, governance, engagement, or operating decisions. |
| Phase 3 | **No cumulative percentage (Version 2.1)** | Four historical technical-foundation evidence groups are recorded; real national place content, admitted Phase 2 aggregates, and required human/release checkpoints remain open. |
| Phase 4 | **3/4 (75%)** | Provincial safeguards exist; admitted enhancement inputs and published match results do not. |
| Phase 5 | **4/4 (100%) local; production blocked** | Simulation and safety controls do not establish real feed rights, operations, or deployment. |
| Phase 6 | **3/5 (60%)** | No live account store, direct RLS proof, sender, or timed kill-switch rehearsal. |
| Phase 7 | **13/16 (81.25%)** | Indigenous-source authority, named reply operation, and Mistik decision evidence remain missing. |
| Phase 8 | **4/16 (25%)** | Local release controls and a limited restoration drill do not replace raw-archive reproducibility, independent review, or operated production evidence. |
| Phase 9 | **0/4 (0%)** | No operated beta, real correction metrics, source-agency confirmation, or quarterly published-figure reproduction. |

The underlying machine-checked records are [Phase 4](../data/phase4-exit-status.json), [Phase 5](../data/phase5-live-wildfire-exit-status.json), [Phase 6](../data/phase6-account-alert-exit-status.json), [Phase 7](../data/phase7-indigenous-explore-comparison-exit-status.json), [Phase 8](../data/phase8-launch-readiness-exit-status.json), and [Phase 9](../data/phase9-public-beta-launch-exit-status.json).

## Non-negotiable evidence discipline

- Never turn an illustrative fixture, local contract, historical artifact, or preview URL into a production data claim.
- Display insufficient evidence as `Unknown`, with its reason; never convert it to zero.
- Retain source, version, licence, time range, boundary edition, denominator, coverage, method, and limitation with every public result.
- Keep accounts and alerts disabled until the closed activation gate has real Canadian-hosting, security/privacy/legal, sender, unsubscribe, queue, kill-switch, and incident-operation evidence.
- Keep asserted traditional territories out of Version 1 analysis and rankings unless separately authorized.

## External work that remains external

Written source rights and publisher terms, legal/licence/privacy/security review, bilingual editorial review, Indigenous engagement and right-of-reply operations, independent accessibility and scientific validation, production infrastructure and on-call evidence, and formal release/launch decisions remain outside the repository. They are tracked in [external gates](EXTERNAL_GATES.md); no test or documentation change can honestly close them.

## Verification posture

Run the focused checker for any changed evidence record, then use the repository’s normal typecheck, lint, build, test, and diff checks before integration. A green local check demonstrates only the scope it covers; it does not supersede the gate boundaries recorded above.
