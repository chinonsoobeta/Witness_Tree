# Owner-blocked engineering

Work in this ledger is finished, tested and pushed. It cannot land, and no
amount of further engineering will change that, because each item requires a
decision only the accountable owner can make.

This is deliberately narrow. It is not a list of external gates, which
[`EXTERNAL_GATES.md`](EXTERNAL_GATES.md) holds, and not a list of ledger rows
awaiting production decisions, which
[`PHASE1_OWNER_DECISION_QUEUE.md`](PHASE1_OWNER_DECISION_QUEUE.md) holds. It is
the shorter list of code changes that are correct and proven, and that would
invalidate an owner-admitted record if merged.

## Why these cannot be unblocked by engineering

An owner-admitted record binds exact bytes and carries `"decision": "approve"`.
Rebinding one would mean an engineer re-issuing an approval in the owner's name.
That is never done here, and a red gate is left red instead.

The distinction that matters is not "does the checksum still match" but "who
made the claim the checksum is attached to". An engineering-derived checksum may
be rebound after confirming the bound criterion's stated reason still holds. An
owner-admitted checksum may not be rebound at all. A record of what a past run
produced may not be rebound either, even by the owner, because the claim it
carries is about history rather than intent.

## Open items

| Item | Change | What it would invalidate | Exact owner action needed |
| --- | --- | --- | --- |
| QC stand-copy runner | Identity-based resume for `run-qc-stand-copy.mjs` | Two owner-admitted QC execution approvals | A fresh execution approval for both Québec stand-copy specifications, binding the corrected runner's SHA-256 |

The QC item is the same "existence means refuse" defect as #46, in the runner
for both Québec stand-copy scopes. It refuses whenever the artifact or sidecar
exists, although `binding.expected.rawSha256` is already in scope and already
part of the output path, so the identity comparison it needs is available and
unused. The runner's SHA-256 is bound by
`data/phase1-qc-current-ecoforest-execution-approval.json` and
`data/phase1-qc-original-current-inventory-execution-approval.json`. Neither may
be rebound by engineering, so the fix is deliberately not written yet: writing
it would only produce a second branch that cannot land.

`run-phase2-v21-raster-first.mjs` has the same shape and is not checksum-bound,
but it should be corrected together with the QC runner under one
re-authorization rather than piecemeal. Its cost is already visible on disk as
two `.failed-*` sibling directories, because renaming is the only way past the
gate, so a corrupt batch and a complete batch are cleared by the identical
manual gesture.

## Items waiting on an owner action, not a re-authorization

These are different in kind from the table above. Nothing here would invalidate
an existing approval. Each is one owner gesture away, and the engineering half
is finished and merged.

| Item | State of the engineering | The one thing needed | Who can do it |
| --- | --- | --- | --- |
| Phase 8 `raw-archive-reproducibility` | Runbook written, checker merged, record deliberately absent | One MFA-assumed role session | The owner, on the owner's own device |
| Phase 8 `operations-handbook` | Handbook complete and bound as evidence; the full case for a pass is written into the criterion's `reason` | A decision to flip one `"fail"` to `"pass"` | The Release approver role |
| Phase 6 `direct-database-tenant-isolation` | Row-level-security policy merged, 17 probes executed and held, negative control fails 14 of 17 | A decision to unbundle the isolation proof from the managed Canadian database in the `canadian-managed-service-and-direct-rls` blocker | The owner |

### The archive reproduction session

Steps 1 and 5 through 8 of the runbook in
[RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md](RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md) are
local and touch no credential. Steps 3 and 4 are read-only S3 calls,
`head-object` and `get-object` with an explicit `--version-id`. Step 2 mints the
session by reading a six-digit TOTP, and engineering must never handle, echo, or
record one. The session lasts 43,200 seconds, which is ample for every remaining
step. The blocker is therefore not a decision and not a cost; it is one gesture
that only the holder of the MFA device can perform.

Once that session exists, `data/raw-archive-reproduction-drill.json` can be
written from a real run and
`npm run check:raw-archive-reproduction-drill` can pass. Until then it exits 1
with a message saying the drill has not been executed, which is the correct
state and is why it is registered in no aggregate suite.

### A security observation found while checking for a session

The default AWS profile on the owner's machine resolves to the account **root**
user, `arn:aws:iam::286853118812:root`. The `WitnessTreeArchiveOperator` profile
exists alongside it and is the least-privilege identity every archive runner
requires; `wt_assume_direct_mfa_role` verifies the caller is exactly that user
and refuses anything else.

Root can alter Object Lock configuration and the retention boundaries this
project treats as immutable, which is precisely the boundary the operator role
exists to keep engineering outside of. No root credential was used for anything,
and none will be. Rotating or removing it is an account security change and is
recorded here as an observation only.

## Items the owner has now decided

These are no longer blocked on a decision. The decision exists and is recorded.
What remains is merging, which is ordinary review, not owner action.

| Item | Decision recorded in | Current state |
| --- | --- | --- |
| #34 | `data/phase2-boundary-editions-readmission-2026-08-26.json` | Merged as `04da17b` |
| #46 | `data/phase1-ntems-runner-reauthorization-2026-08-26.json` | Merged as `778e0ea` |
| #50 | `data/phase1-federal-electoral-runner-reauthorization-2026-08-26.json` | Merged as `ba4e54c` |

Each landed through its pull request with the required `verify` check green and
branch protection intact. The one sweep failure that stood on #46 was not its
own: `check:phase1-federal-electoral-transformation` was refusing because its
output existed, which is the defect #50 fixes, and it cleared when #50 landed.

No gate moved as a result. Four exit-status files changed bytes across these
merges, all of them checksum rebindings; the criterion counts and the passing
counts in each are identical before and after. That was checked rather than
assumed, because a rebinding that advances a gate is a defect and not progress.

### One thing that nearly went wrong here, worth keeping

The owner's re-authorization for #46 was committed to a local branch that no
pull request pointed at, and that branch had never been pushed. PR #46's head
carried the corrected runner while still binding the previous runner's
SHA-256, so the two disagreed and the pull request was both conflicting and
internally inconsistent.

A recorded owner decision that exists only in one local working tree is one
disk failure away from having to be sought again, and asking an owner to
re-approve something they already approved is a good way to end up with an
approval nobody can reconcile. Owner decision records belong on a remote, and
on the branch whose bytes they authorize, as soon as they are made.

### The in-flight dependency this created

The annual land cover transformation running while this was written had been
launched from the corrected runner at a time when that runner was not on
`main`. Its sidecars record no runner SHA-256, so the mid-run branch switch did
not corrupt provenance and the outputs already produced are sound. For the
window before #46 landed, a crash in that run could not have been resumed from
`main`, because `main` still carried the runner that refuses on an existing
output and has no `--resume`. That window is now closed: `main` carries the
corrected runner, and the run is resumable from it.

## The NTEMS resume block, stated plainly

Kept for the record. The owner has since re-authorized, so this describes how
the block arose rather than a block that is still open.

The annual land cover scope is 39 yearly rasters produced by one runner
invocation. The runner refuses to overwrite an existing output, and it performs
that check before producing anything, so the first already-completed year aborts
the whole run. A run interrupted at any point cannot be continued. The remaining
options are to delete checksum-bound completed work or to restart blindly.

The fix is written and proven in #46. Merging it changes the runner's bytes,
which four owner-admitted execution authorizations bind directly. So the defect
that blocks Phase 1 execution is itself blocked on an owner signature, and the
gate that reports this became a required CI step deliberately, so that the
conflict is visible rather than discovered at execution time.

Three further records bind the runner as readback evidence, naming which runner
produced verified outputs. Those should not be reissued when the owner
re-authorizes. They correctly describe runs that already happened under the
previous runner, and changing them would assert that the new runner produced
rasters it never produced.

## The federal-electoral block, and why it is the same defect twice

`--preflight` refused whenever the output or sidecar existed. The transformation
completed successfully on 2026-08-26 at 00:55:28Z, so from that moment the gate
reported failure for finished, correct work. The output was re-verified against
its sidecar during this investigation: 20,525,056 bytes, SHA-256
`ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05`, an exact
match, with 352 features, 343 districts, and zero missing, empty, or invalid
geometry.

This is the NTEMS defect in a second runner. Both treat the existence of an
output as a reason to refuse, without asking whether that output is the one they
would have produced. The repair in both cases is the same shape: a function that
returns "produce" only for a genuinely absent pair, returns "complete" only after
recomputing the output's checksum and matching it against its sidecar, and
refuses everything in between rather than guessing.

A second defect was hidden underneath the first. `ensureNoSymlink` walks every
ancestor of the output directory and refuses any symlink component, and after
the SSD cutover the data root is itself a symlink to the external volume. The
old code never reached that walk, because it refused at the existence check
first. The repair resolves the data root once, so the guard still walks
everything below the resolved root at full strength while the one deliberate
symlink passes. Nothing about what the guard protects is weakened.

Both repairs change the runner's bytes, which
`data/phase1-federal-electoral-execution-approval.json` binds with
`"decision": "approve"`. That binding is deliberately left stale rather than
reissued.

## What must never be done to clear an item here

- Rebinding an owner-admitted checksum for any reason, including to make CI green
- Drafting an authorization record containing an approval, which fabricates the
  approval whether or not it is labelled a draft or a template
- Merging with a required gate disabled, removed from the workflow, or narrowed
  so that it stops covering the changed bytes
- Reading owner approval of one item as approval of a later or broader one
