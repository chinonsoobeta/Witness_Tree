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

**Two readbacks refuse to re-emit evidence.**
`readback-phase2-v21-real-review-packet.mjs:66` asserts the output does not
exist, and `readback-phase2-v21-raster-first.mjs` writes with flag `wx`.
Neither compares recorded evidence against freshly computed evidence, so
re-running a successful readback fails. `check-phase1-federal-electoral-output.mjs:236-241`
already shows the correct form: read the recorded evidence, strip the volatile
`verifiedAt`, compare canonical JSON, fail only on real drift. Lower severity
because these are small repository JSON files rather than a multi-hour batch.

**`check-*-versioned-readback-iam-applied.mjs`, marginal.** The filenames
assert an applied IAM change; the scripts make no AWS call and rest the central
fact on a regex over an operator-written sentence. Flagged as marginal because
the console output is honest where the name is not: it says "internally
consistent", not "verified".

## The coverage gap this audit did not close

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
confirm the evidence file exists and is self-consistent. They do not confirm
the artifact. Closing this requires either wiring the existing verifier into a
check script, or an owner admission record that unlocks the byte-level branch.
The first is engineering work and is not blocked. The second is not mine to
create.

## Verification limit worth stating

The empirical reconciliation path in `check-data-root-bound-checks.mjs` could
not be exercised. It is only decidable with the drive detached, and a
transformation is running on it.
