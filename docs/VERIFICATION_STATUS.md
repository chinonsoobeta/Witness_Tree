# Verification availability

`npm run verify:checks` runs every `check:` command named directly by the CI
workflow, preserving each diagnostic and a JSON receipt under ignored `outputs/`.
It continues after failures. Pass explicit check names to run a narrower set:

```sh
npm run verify:checks -- check:data-root-coverage check:phase2-province-series
```

This wrapper does not replace or change a checker. A nonzero checksum
contradiction remains `failed`. An absence attributed to the resolved data root
is `unavailable`. A registered degrading check that exits zero while declaring
its missing bytes is also `unavailable`. Silent degradation is a failure.
An unknown error is always a failure. Receipt totals count statuses, not claims
of external evidence. Exit codes are 0 for passed, 1 for failed and 2 for
unavailable; failure takes precedence over unavailable.

`npm run test:suite` still executes both portable halves of the existing suite.
Its JSON receipt reports owner-bound files and individual skipped subtests as
`unavailable`. `portableExecutionStatus` and the command exit code describe only
the assertions executed in portable CI. A zero portable exit code never makes
the full suite's receipt `passed` while any test is unavailable. CI preserves
that receipt even on failure. The separate owner-run receipt and its currency
gate retain their existing role and are not rewritten by this runner.

The prompt's 138/19 check split predates this revision. Direct inspection at
`5549be3` found 231 check commands, 30 in the data-root registry, and 201 outside
it. Those are static inventory counts, not a claim that 201 checks passed a
new detached run. The test inventory is separate: 334 files, 25 data-root files,
3 macOS safety-runner files, and 4 portable files containing a data-root subtest.
The historical observations in `docs/DATA_ROOT_BOUND_CHECKS.md` are unchanged.

`npm run check:data-root-coverage` pins the current unavailable names, reasons,
and detached behavior by digest as well as count. Moving even one check or test
into that bucket fails, including a same-count substitution. New checks outside
the bucket are counted explicitly in the output. A smaller total inventory
fails. This is a static drift gate; empirical completeness remains unavailable
until a real detached sweep is performed. No SSD bytes are written by reporting.

For the required verification equivalent, run the check wrapper, `npm run
typecheck`, `npm run lint`, `npm run build`, and `npm run test:suite`, plus the
rendered-browser suite when present. Environment-bound checks stay visible as
unavailable or failed; never turn them into passing claims.

Registering this gate refreshes only the engineering CI workflow checksum in
the Phase 0 and Phase 3 records. Their persistent-identifier, budget,
accessibility and bilingual criteria still run and pass; their counts remain
7 of 8 (with the existing exclusion) and 4 of 5. No downstream data record
binds those status files. Phase 8 remains 8 of 16, and the owner-run test receipt
and unavailable inventories are unchanged. E3 remains pending the completed
Explore widening; no route-payload ceiling is measured on this earlier tree.
