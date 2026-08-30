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
guards. Starting at the test file it follows every repository-local import
transitively, then collects every repository-relative path literal any of those
modules mention. The second half is what reaches the JSON evidence records,
which are read by string rather than imported.

For `tests/phase1-ntems-readback-bytes.test.mjs` that yields 21 files, including
all four execution authorizations, all four readback evidence records, and the
transform runner. Every file #84 touched is in that set, so the gate would have
failed the moment #84 was opened.

`EXTRA_GUARDED_PATHS` covers what a static read cannot see. It has one entry
today: the transform runner, whose SHA-256 is recorded *inside* the readback
evidence but which no module names by path. Each entry states its reason.

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
