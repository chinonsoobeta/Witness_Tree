# Check and runner defect audit, 2026-08-26

Engineering-derived. A read-only sweep of `scripts/` for three defect classes
already proven in this repository, plus a fourth category for checks whose
output claims more than they verify.

No gate moved. No checksum was rebound. No owner decision was created.

## The classes searched for

**(a) Existence means refuse.** A runner that refuses whenever its output
exists, without asking whether that output is the one it would have produced.
Previously found in `run-phase1-ntems-transform.mjs` and
`run-phase1-federal-electoral-transformation.mjs`.

**(b) The symlink data root.** After the SSD cutover the data root is itself a
symlink, so a guard comparing a realpath-resolved file against an unresolved
root refuses everything. Previously found in three runners.

**(c) A check that claims verification it does not perform.**

**(4) Unknown recorded as a definite answer.** A `catch` that flattens "I could
not read this" into "this is not there".

## Fixed

| # | Site | Class | What was wrong |
| --- | --- | --- | --- |
| 1 | `check-data-root-bound-checks.mjs:85` | 4 | Any output containing the string `Witness_Tree-data` was classified "evidence unavailable". A checksum disagreement names its file, and that path is under the data root, so a real contradiction was excused and the sweep printed that every failure was attributable to the absent drive. |
| 2 | `readback-phase2-v21-raster-first.mjs:71-72` | b | Two guards became mutually exclusive once the root was a symlink: the unresolved spelling tripped the symlink guard, the resolved spelling tripped the batch-directory guard. No spelling passed, so the complete 21-output V2.1 batch could not be read back at all. |
| 3 | `check-phase2-independent-comparison-evidence.mts:121` | b | An ancestor walk rejecting every symlinked parent, which after the cutover means every artifact path the check is built to accept. Latent only because the checked-in evidence carries no real data-root bindings; it would fire on first real use. |
| 4 | `check-nrcan-canopy-height-remote-archive-evidence.mjs:17` | 4 | The payload key regex was anchored on the right only, so an object under a different source's key space passed as "exact", and the manifest key derived from it agreed with the wrong key too. |
| 5 | `check-raster-grid.mjs:211` | c | A substring test for `OGR` stood in for verifying provenance. "no ogrinfo read was performed" contains `ogrinfo`, so a negation read identically to an affirmation. |
| 6 | `verify-qc-stand-copy-readback.mjs:528` | 4 | A bare `catch { return false }` reported a permission error, an I/O error, a symlink loop, or a wrong-kind entry as `outputPresent: false`. An operator reading "not there" re-runs a producer. |
| 7 | `check-qc-stand-copy-production-admission-readiness.mjs:750-786` | c, 4 | Same bare catch, and the field was named `readbackPresent` when it was two `lstat` calls. A truncated or checksum-drifted output produced `readbackPresent: true`. |
| 8 | `check-phase1-ntems-production-admission-readiness.mjs:634` | c | Mode named `readback-presence-only` for a check that only `lstat`s four evidence JSON files in `data/`. |

Presence is now three-valued wherever it was flattened: only the filesystem
reporting nothing at the path is absence, and anything unreadable stays `null`.
The two existence-only modes now carry a `verifies` sentence stating in plain
words what was and was not read.

`approvedDataRootRealPathSync` was added to `scripts/data-root.mjs` so the
one-approved-link rule lives in a single place. Re-deriving that rule per
script is how three runners diverged in the first place.

## Found and not fixed, with the reason

**`run-qc-stand-copy.mjs:186`, class (a).** Refuses whenever the artifact or
sidecar exists, though `binding.expected.rawSha256` is already in scope and
already part of the output path, so the identity comparison is available and
unused. **Not fixed because this runner's SHA-256 is bound by two owner
execution approvals.** Changing a byte of it invalidates
`data/phase1-qc-current-ecoforest-execution-approval.json` and
`data/phase1-qc-original-current-inventory-execution-approval.json`, neither of
which engineering may rebind. This needs an owner re-authorization, not a
patch.

**`run-phase2-v21-raster-first.mjs:70`, class (a).** Same shape, and the
operational cost is visible on disk: two `.failed-*` sibling directories show
that renaming is the only way past the gate, so a corrupt batch and a complete
batch are cleared by the identical manual gesture. Not fixed here because it is
a design change to a producer, not a guard repair, and it should be made
together with the QC runner above under one re-authorization rather than
piecemeal.

**One checksum-bound readback still refuses to re-emit evidence.**
`readback-phase2-v21-real-review-packet.mjs:66` still asserts that the output
does not exist. Its runner SHA-256 is bound by historical completed-readback
evidence, so changing it requires owner reauthorization and a new evidence
model rather than rebinding the past run.

The unbound `readback-phase2-v21-raster-first.mjs` now reads an existing record,
compares canonical JSON across every field, succeeds only on an exact match,
and fails without overwriting on drift. Its evidence schema has no volatile
fields to strip. A missing record is still created exclusively with `wx`.

**`check-*-versioned-readback-iam-applied.mjs`, marginal.** The filenames
assert an applied IAM change; the scripts make no AWS call and rest the central
fact on a regex over an operator-written sentence. Flagged as marginal because
the console output is honest where the name is not: it says "internally
consistent", not "verified".

## The coverage gap, now closed

No runnable `npm run check:*` reads the underlying NTEMS artifact bytes.

- `check:phase1-ntems-transform-readback` runs entirely against synthetic
  in-test fixtures. It proves the validator rejects tampering. It proves
  nothing about the artifacts.
- `check:phase1-ntems-production-admission-readiness` takes the existence-only
  branch, because the npm script passes no `--record`.
- The byte-reading path in that same file is real, but it requires a
  `witness-tree/phase1-ntems-production-admission/1` record, and no such record
  exists in `data/`.
- `scripts/verify-phase1-ntems-transform.mjs` is the genuine byte-level
  verifier and is not wired into `package.json` at all.

`data/data-root-bound-checks.json` corroborates this: neither NTEMS check
appears among the 19 checks that read real bytes.

So for the three NTEMS scopes with readback evidence, the runnable checks
confirmed that the evidence file exists and is self-consistent. They did not
confirm the artifact.

`check:phase1-ntems-readback-bytes` now does. For each committed readback
evidence record it recomputes the evidence from the bytes under the data root
and requires exact equality: output SHA-256, byte length, sidecar SHA-256, and
the GDAL pixel checksum of source against output. The verifier emits no
volatile fields, so nothing is stripped and nothing is excused.

A scope with no committed evidence is reported as not yet evidenced rather
than passed, so `ntems-annual-land-cover` cannot be mistaken for verified while
its transformation is still running.

Proven both ways: `ntems-forest-harvest-v1` verifies against the real artifact,
and a record with one forged digest fails with a contradiction and exits 1.

Two things about this are worth stating rather than leaving to be discovered.

It is expensive. The two large scopes are 13.1 GB and 14.1 GB, and the check
hashes both output and source and runs GDAL pixel checksums over each. Only
`ntems-forest-harvest-v1` at 205 MB has been exercised end to end so far; the
two large scopes were deferred because a transformation is currently writing to
the same drive. The check is wired and correct, but its cost on the full set is
so far estimated rather than measured.

Its entry in `data/data-root-bound-checks.json` is derived from construction,
not from an empirical detached sweep. It reads derived rasters under the data
root, so with the drive detached it fails naming an unreadable path, which the
repaired classifier attributes correctly. That reasoning is sound but it is not
the same evidence as a sweep, and the inventory's claim that its list was
verified empirically with the root absent now has one member that predates the
next such sweep. The next detached sweep should confirm it.

## Verification limit worth stating

The empirical reconciliation path in `check-data-root-bound-checks.mjs` could
not be exercised. It is only decidable with the drive detached, and a
transformation is running on it.
