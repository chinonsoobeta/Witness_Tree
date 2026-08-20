# Phase 1 exit audit

The normative Phase 1 exit criteria are in section 16 of the approved implementation plan. The checked-in audit command evaluates four criteria against the current worktree:

```sh
npm run check:phase1-exit
```

As of **2026-08-20**, the result is **1/4 criteria, 25%, blocked**. This is an exit-criteria count, not a production-readiness percentage and not the broader implementation estimate in [`docs/PLAN_GAP_MATRIX.md`](PLAN_GAP_MATRIX.md).

| Criterion | Current result | Evidence and reason |
| --- | --- | --- |
| Complete source ledger | Blocked | [`data/source-ledger.json`](../data/source-ledger.json) is explicitly `status: "example"` with three illustrative rows. [`data/source-candidates.json`](../data/source-candidates.json) contains a larger minimum candidate set, and no complete non-example ledger covers it. |
| Reproducible raw archive | Blocked | [`data/staged-acquisitions.json`](../data/staged-acquisitions.json) records three local-staging archives with checksums and ZIP integrity, but each remains `immutableObjectStorage: false`; no immutable promotion or recovery manifest exists. |
| Coverage geometry | Blocked | No `data/coverage-geometry-admission.json` artifact exists in this worktree. Coverage policy fixtures do not prove a four-province geometry layer. |
| Corruption-rejecting validation | Passed | The synthetic probes in [`scripts/check-phase1-corruption-gate.mjs`](../scripts/check-phase1-corruption-gate.mjs) reject altered HEAD size, archive-integrity, production-eligibility, and profiled-geometry evidence. The test is [`tests/phase1-corruption-gate.test.mjs`](../tests/phase1-corruption-gate.test.mjs). |

The audit remains fail closed: local staging, source-candidate discovery, policy fixtures, or passing synthetic probes cannot promote a source to ingestion or production. A criterion can turn green only when its required evidence is present in the repository and the evaluator can verify it.

The audit does not perform network access, download or upload bytes, write object storage, deploy, send outreach, or change external state.
