# Phase scope decision, 2026-09-26

Decided by the owner. Machine-readable record:
[`data/phase-scope-decision-2026-09-26.json`](../data/phase-scope-decision-2026-09-26.json).

## The convention

A **removed** criterion leaves its phase's count, so the denominator shrinks.
It was not met, and nothing it required may be claimed. This differs from the
earlier **retired** convention (Phase 2 expert review, 2026-08-30), where a
withdrawn requirement stayed in the count as not complete.

Every checker a removal touches reads the decision record, lists which of its
own criteria may be removed, and refuses any other. Dropping a criterion from a
status file without this record still fails.

## What changed

| Phase | Removed | Count before | Count after |
| --- | --- | --- | --- |
| 1. Data acquisition and source ledger | Every raw file re-fetchable or restorable from the archive | 2/4 | 2/3 |
| 2. National baseline | Expert review of 100 samples per province; published independent comparisons | 2/4 | **2/2, complete** |
| 7. Indigenous geographies, Explore and comparison | Every reserve and treaty area has a page with its official name; every reserve and treaty page carries a right-of-reply route | 14/16 | **14/14, complete** |

The four reserve and treaty source rows (`indian-reserves`,
`first-nation-reserves`, `historic-treaties`, `modern-treaties`) are also
withdrawn from the Phase 1 ledger core, which falls from 22 rows to 18. They
stay in the ledger, and are never admitted.

## Why

- **Archive recovery (Phase 1).** Proving every raw file restorable means
  re-downloading or restoring about 900 GB. The owner keeps the per-file
  checksums already recorded and drops the universal proof.
- **Expert review and independent comparison (Phase 2).** Expert review never
  started and was retired on 2026-08-30. The formal independent comparison
  had no like-for-like input. Neither is claimed.
- **Reserve and treaty pages (Phase 7).** Witness Tree will not publish
  reserve or treaty geography. The Plan scopes the right-of-reply criterion to
  reserve and treaty pages, so it goes with them.

## Rights (Phase 4)

The owner first retired the Phase 4 source-rights requirement, then withdrew
that retirement the same day. The publishers' replies in the owner's mailbox
showed that the British Columbia harvest sources are open or granted:
consolidated cutblocks by written permission on 2026-09-18, and the FTA
cutblock and harvesting-authority layers under OGL-BC. The rights are recorded,
not retired, in
[`data/bc-harvest-source-rights-2026-09-26.json`](../data/bc-harvest-source-rights-2026-09-26.json).
Permission for Forest Operations Map cutblocks was refused, and that layer is
not used. VRI 2025 and the old-growth TAP layer are offered on conditions; the owner
sent a reply accepting them on 2026-09-26, and the grant awaits the copyright
officer's confirmation.

## What this does not claim

No expert review, independent comparison, archive recovery, reserve or treaty
geography, or right-of-reply route exists because of this decision. Phase 1's
18 core ledger entries were completed separately the same day. Phase 4's
matching run was computed the same day and awaits the owner's admission and an
outside review.
