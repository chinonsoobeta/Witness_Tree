# Open pull request backlog

## What was found

Nineteen pull requests (#4 through #24, excluding those already merged) were
open against `main` at the time of this audit. Every one of them reports green
required checks on GitHub, and several report `MERGEABLE`. Neither signal is
evidence.

Every branch forks from a base that is now seventeen commits behind `main`
(seven or four for the three newest). The green check on each pull request was
produced by running the suite against that old base. It says the branch passed
against a tree that no longer exists. It does not say the branch passes against
`main`, and it cannot.

Testing each branch's net contribution with a three-way merge against current
`main` gives the real picture: eighteen of the nineteen conflict. Only
`feat/rank-unmatched-share` (#8) merges cleanly.

A second hazard sits underneath the first. `main` already contains much of this
work, squash-merged through other routes, so the branches hold *older* copies of
files `main` has since moved forward. A naive merge of such a branch does not
add its feature; it reverts newer content. The per-file comparison shows this
directly: #15, for example, has twelve files byte-identical to `main` and eleven
that differ, and most of those differences are `main` being ahead.

## What this means for the phase percentages

The phase exit-status records are computed against `main`. If these branches
carry criteria evidence that `main` lacks, the recorded percentages understate
real progress. They are still the correct numbers to report, because a gate
derives truth from what is actually in the tree. The backlog is a reason those
numbers may move, not a reason to adjust them by hand.

No percentage in any exit-status record was raised on the strength of an open
pull request.

## Landing rule

A branch in this backlog is landed only by:

1. Rebasing it onto current `main`.
2. Running the full local gate set against the rebased tree: `test:unit`,
   `typecheck`, `lint`, and every affected `check:*` script.
3. Resolving any exit-status evidence checksum that the change breaks, by
   confirming the bound criterion's stated reason still holds against the new
   bytes and correcting the reason when the change alters what those bytes
   prove. An evidence checksum is never rebound merely to make a gate pass.
4. Force-pushing the rebased branch so the required checks run against the real
   base, and merging only on that fresh green.

Owner-admitted evidence is out of scope for step 3. Where a branch alters bytes
that an owner admission binds, the branch waits for a fresh admission and is
recorded as owner-blocked rather than rebound.

## Absorption test

Conflict alone does not mean a branch carries value. For each pull request,
every line the branch adds was compared against `main`'s current copy of the
same file. A branch whose added lines are all already present in `main`, with no
new files, is absorbed: its content arrived through another merge, and the
conflict is only the branch holding an older copy of a file `main` has moved
forward. #4, #7, and #24 are absorbed and were closed on that evidence.

The remainder carry unabsorbed lines. That count is an upper bound on their
value, not a measure of it: a line absent from `main` may equally be the
branch's older version of something `main` has since improved. Each is settled
by reading the change, not by the count.

## Status

Nine of the original nineteen are settled. Ten remain open, plus #34, which this
work opened as an owner-blocked draft.

| PR | Branch | Net state against `main` |
| --- | --- | --- |
| #4 | `data/alberta-unblock` | closed, fully absorbed |
| #5 | `fix/transformation-admission-rule` | open, conflicts; based on the now-closed #4 |
| #6 | `data/nrcan-canopy-staging` | open, conflicts; based on the now-closed #4 |
| #7 | `ci/run-both-test-halves` | closed, superseded by a single-runner `test:unit` |
| #8 | `feat/rank-unmatched-share` | **landed** |
| #9 | `docs/refresh-status-claims` | open, conflicts |
| #10 | `feat/source-review-process` | closed, superseded by #16 |
| #11 | `data/boundary-editions` | closed, absorbed |
| #12 | `data/s3-promotion` | open, conflicts; based on #9 |
| #13 | `data/raster-grid-contract` | **landed** |
| #15 | `fix/gdal-claim-and-unknown-prose` | closed, split into #33 (landed) and #34 (owner-blocked) |
| #16 | `feat/source-review-process-evidence-refresh` | **landed** |
| #17 | `feat/national-baseline-admission` | open, conflicts; based on #13, which has landed |
| #18 | `docs/external-gates-matrix` | open, conflicts |
| #19 | `fix/phase3-locale-navigation` | open, conflicts |
| #20 | `fix/explore-year-query` | open, conflicts, and its own checks fail |
| #21 | `feat/phase5-source-status-contract` | closed, ported as #32 without reopening the live feed |
| #22 | `feat/local-staging-admission-gate` | open, conflicts, and its own checks fail |
| #23 | `phase1/coverage-geometry-admission` | open, conflicts |
| #24 | `phase1/phase1-corruption-drill` | closed, fully absorbed |
| #34 | `fix/boundary-editions-gdal-claim` | open draft, **owner-blocked**, opened by this work |

Every remaining open branch is a draft except #5, #6, #9, and #12.

## What landing them actually produced

Nine settled branches produced five merges, and not one of them merged as
written. The pattern is consistent enough to state plainly.

**Two were split.** #15 mixed a real user-facing bug with a rewrite of evidence
bytes an owner admission binds. The bug landed as #33; the rewrite waits on the
owner as #34. A pull request is not necessarily one decision.

**One was ported, not merged.** #21 would have restored live fetching over
`WILDFIRE_SOURCE_URLS` against feeds with no rights, no admitted snapshot
contract, and no production approval. Its status-manifest work was worth having,
so it was ported onto `main`'s refusal as #32, and the refusal stayed.

**Two were closed as already present.** #10 and #11 added nothing `main` lacked.

**Every one that landed broke an exit-status checksum.** In each case the bound
criterion's stated reason was checked against the new bytes before rebinding,
and in three cases the reason was strengthened to record a guarantee the
criterion had not previously made. None was rebound to make a gate pass.

**Several carried assumptions that had expired.** #15's regression test asserted
U+2014 for the Unknown marker, which the repository has since banned. A green
check on an old base hides this exactly as it hides a conflict.
