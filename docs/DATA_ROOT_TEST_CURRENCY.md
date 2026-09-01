# Owner-bound test currency

## The gap

`scripts/run-ci-tests.mjs` excludes 28 test files by name for two reviewed
requirements:

- 25 read the owner's SSD data root, which no CI runner can mount;
- 3 exercise safety runners that depend on macOS tooling, file ownership, or
  mode semantics.

Those exclusions are necessary, but an excluded test proves nothing after a
repository dependency changes unless another gate notices the change.

That is not hypothetical. Pull request #84 changed
`scripts/run-phase1-ntems-transform.mjs` and, in the same commit, rewrote four
owner-bound NTEMS execution authorization records so their `runner.sha256` named
the new file. The only test that reads those records is
`tests/phase1-ntems-readback-bytes.test.mjs`, which is data-root-bound. The pull
request merged green. The readback evidence still named the pre-#84 runner, and
that contradiction sat on `main` undetected.

## The mechanism

The mechanism has two halves.

**`npm run test:data-root`** keeps its existing command name, but now runs all 28
owner-bound files on the owner's Mac with the data root attached. It writes
`data/data-root-test-run-receipt.json` with the commit, clean-tree state, macOS
platform, data-root presence, counts by requirement, and each test's outcome and
guarded repository files.

**`npm run check:data-root-test-currency`** runs in CI without the SSD or AWS
access. It recomputes every guarded set from the working tree and compares it to
the receipt. Missing tests, failed tests, wrong requirement labels, invalid
counts, a non-macOS receipt, or any guarded dependency change fail the build.

Receipt schema `/2` covers the data-root and macOS classes identically. The
committed `/1` receipt must not be edited to satisfy the new schema. It remains
invalid until the owner performs the combined run and commits the receipt that
the runner actually produced.

## How the guarded set is derived

`scripts/lib/guarded-paths.mjs` derives the set instead of hand-listing it. It
closes over four kinds of edge:

1. repository-local imports, followed transitively;
2. repository-local `new URL(..., import.meta.url)` file references, followed
   transitively;
3. repository-relative path literals mentioned by guarded modules;
4. evidence bindings such as `{ path, sha256 }` inside guarded records, repeated
   to a fixpoint.

The file-URL edge guards the shell runners and provisioner invoked by the three
macOS tests. The evidence-binding edge is the #84 shape exactly. The readback
evidence records the runner as
`{ path: "scripts/run-phase1-ntems-transform.mjs", sha256 }`, while no module
imports or otherwise names that runner by path.

A scan on 2026-08-30 found the same evidence-binding shape in 7 of the 25
data-root-bound tests, reached through records such as
`data/phase1-federal-electoral-production-admission.json` and
`data/phase1-production-transformation-specifications-v1.json`. Deriving the
edge closes all seven and leaves `EXTRA_GUARDED_PATHS` empty.

For `tests/phase1-ntems-readback-bytes.test.mjs` the closure includes all four
execution authorizations, all four readback evidence records, and the transform
runner. Every file #84 touched is guarded, so the gate would have failed as soon
as that pull request changed them.

Tests keep the derivation honest. They assert that guarded records leave no
repository evidence binding behind, file-URL references reach every macOS safety
runner, and any future hand-written exception names a real file with a stated
reason.

## Clearing a failure

On the owner's Mac, attach the data root and run:

```bash
npm run test:data-root
```

Commit the generated receipt with the change it validates.

Do not edit the receipt by hand. The receipt records that a run happened;
writing one by hand asserts an event that did not occur. The runner also records
test failures as failures, and the gate treats them as real failures rather than
staleness.

## What this does not do

It does not run owner-bound tests in CI. It does not prove that SSD payloads or
remote AWS state are unchanged. It proves only that all 28 tests passed together
on the required owner environment and that their guarded repository inputs have
not changed since that run. Byte-level checkers inside those tests remain
responsible for the external payloads they inspect.
