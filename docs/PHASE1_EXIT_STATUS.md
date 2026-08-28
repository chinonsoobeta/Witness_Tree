# Phase 1 exit status

As of 2026-08-27, the formal Version 2.1 Phase 1 exit status is **incomplete: 2/4 unweighted gates pass (50%)**. This record implements the four exit criteria in the controlling plan; it does not claim production admission, release, or a factual upgrade.

| Gate | Result | Bound evidence |
| --- | --- | --- |
| Complete production ledger | Fail | The canonical ledger is blocked. The Version 2.1 field audit reports **2/22 core rows complete and admitted**; nine restricted optional rows remain tracked but do not block core completion. |
| Every raw file archive/refetch/restore | Fail | The federal raw payload/manifest, four current-wildfire raw payload/manifest pairs, two derived wildfire payload/manifest pairs, and the 62-object Québec product have checksum-bound archive evidence. NBAC now has an exact-version primary readback and COMPLIANCE-retention receipt, but no recovery proof. The canonical local inventory matches all 120 listed physical artifacts, while one row is partial and four are unstaged. Local checksums are not archive restoration, so the universal requirement remains unmet. |
| Coverage geometry | Pass | The actual coverage-geometry admission record is bound, and its checker and test pass while preserving non-admission boundaries. |
| Corruption validation suite | Pass | The synthetic corruption corpus rejects every listed deliberately corrupted input. |

The dated [universal archive/recovery gap classification](PHASE1_UNIVERSAL_ARCHIVE_RECOVERY_GAPS_2026-08-27.md) separates local inventory facts, durable primary-readback evidence, and the remaining owner/source-authority or credentialed-operator actions.

The machine-readable record at `data/phase1-exit-status.json` carries a SHA-256 binding for every evidence path and for the controlling plan. `npm run check:phase1-exit-status` fails if a bound file changes, the gate count is not derived from the four statuses, a gate result is upgraded, or `complete` is asserted before all four gates pass.

## Historical score is not exit coverage

The current bounded raw-evidence tracker is **17.00/31 raw credits and 41.4516129%** from the authoritative 31-row ledger. It is explicitly excluded from the 2/4 exit calculation and must not be presented as Phase 1 completion, production completion, or coverage.

## Current NBAC evidence boundary

The exact NBAC ZIP was acquired on 2026-08-27 under the current official Open Government Licence - Canada metadata. The 1,257,052,370-byte ZIP has SHA-256 `c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165`, passed ZIP integrity testing, and was locally profiled as 52,610 polygons. Forty-nine ring self-intersections were quarantined with no silent repair. The durable archive receipt proves exact-version primary payload readback and COMPLIANCE retention. It does not prove a recovery replica, transformation, ingestion, release, publication, or production admission.
