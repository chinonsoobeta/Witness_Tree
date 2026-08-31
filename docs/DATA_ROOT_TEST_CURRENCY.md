# Data-root-bound test currency

## The gap

`scripts/run-ci-tests.mjs` excludes 25 test files by name because they read the
owner's SSD data root, which no CI runner can mount. The exclusions are each
stated with a reason and are correct: those tests genuinely cannot run on a
runner.

What was missing is the consequence. A test that runs nowhere proves nothing
after the first time it runs, and nothing told a reviewer when a change had
invalidated one.

That is not hypothetical. Pull request #84 changed
`scripts/run-phase1-ntems-transform.mjs` and, in the same commit, rewrote four
owner-bound NTEMS execution authorization records so their `runner.sha256` named
the new file. The only test that reads those records is
`tests/phase1-ntems-readback-bytes.test.mjs`, which is data-root-bound. The pull
request merged green. The readback evidence still named the pre-#84 runner, and
that contradiction sat on `main` undetected.

## The mechanism

Two halves.

**`npm run test:data-root`** runs exactly the 25 excluded files on a machine that
has the data root, and writes `data/data-root-test-run-receipt.json`: the commit,
whether the tree was clean, and per test the outcome plus the set of repository
files that test depends on, each with its SHA-256.

**`npm run check:data-root-test-currency`** runs in CI. It reads only the
repository. For each data-root-bound test it recomputes the guarded set from the
working tree and compares it to the receipt. Any difference fails the build and
names the files that moved.

## How the guarded set is derived

`scripts/lib/guarded-paths.mjs` derives it, so it cannot fall behind the code it
guards. It closes over three kinds of edge:

1. repository-local imports, followed transitively;
2. every repository-relative path literal any of those modules mention, which is
   how the JSON evidence records are reached, since they are read by string
   rather than imported;
3. evidence bindings: a `{ path, sha256 }` pair inside a guarded record, whose
   target is itself guarded, repeated to a fixpoint.

The third edge is the #84 shape exactly. The readback evidence records the runner
as `{ path: "scripts/run-phase1-ntems-transform.mjs", sha256 }`, and no module
names that runner by path, so the first two edges both miss it.

That edge was originally a hand-written exception for the one case found by
inspection. A scan on 2026-08-30 showed the same shape in **7 of the 25**
data-root-bound tests, reached through records such as
`data/phase1-federal-electoral-production-admission.json` and
`data/phase1-production-transformation-specifications-v1.json`, which bind
further repository files that nothing imports or names. Deriving the edge closes
all seven and makes the hand-written entry unnecessary; `EXTRA_GUARDED_PATHS` is
now empty.

For `tests/phase1-ntems-readback-bytes.test.mjs` the closure is 27 files,
including all four execution authorizations, all four readback evidence records,
and the transform runner. Every file #84 touched is in that set, so the gate
would have failed the moment #84 was opened.

Two tests keep this honest. One asserts that no guarded record binds a
repository file the closure has missed, so narrowing the derivation fails the
build and no maintenance is needed when records gain bindings. The other requires
any future `EXTRA_GUARDED_PATHS` entry to name a real file and state why the
derivation cannot reach it.

## Clearing a failure

Re-run the suite on the machine holding the data root:

```bash
npm run test:data-root
```

Commit the regenerated receipt with the change that invalidated it.

Do not edit the receipt by hand. The receipt records that a run happened; writing
one by hand asserts an event that did not occur. The runner records failures as
failures for the same reason, and the gate reports a recorded failure as a real
failure rather than as staleness.

## What this does not do

It does not run the tests in CI, and it cannot. It does not prove the data root
is unchanged, only that the repository is unchanged relative to the last run. A
change to the payloads on the SSD is invisible to it; that remains the job of the
byte-level checkers those tests invoke.
