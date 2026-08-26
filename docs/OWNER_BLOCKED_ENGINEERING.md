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

## Items the owner has now decided

These are no longer blocked on a decision. The decision exists and is recorded.
What remains is merging, which is ordinary review, not owner action.

| Item | Decision recorded in | Current state |
| --- | --- | --- |
| #34 | `data/phase2-boundary-editions-readmission-2026-08-26.json` | Mergeable |
| #46 | `data/phase1-ntems-runner-reauthorization-2026-08-26.json` | Mergeable; sweep 157 pass / 1 fail of 158 |
| #50 | `data/phase1-federal-electoral-runner-reauthorization-2026-08-26.json` | Mergeable |

The single sweep failure on #46 is not its own: it is
`check:phase1-federal-electoral-transformation` refusing because its output
exists, which is the defect #50 fixes. It clears when #50 lands.

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

The annual land cover transformation currently running was launched from the
corrected runner, which is not on `main`. Its sidecars record no runner
SHA-256, so a mid-run branch switch does not corrupt provenance, and the
outputs already produced are sound. But `main` still has the runner that
refuses on an existing output and has no `--resume`, so until #46 lands, a
crash in that run cannot be resumed from `main`. Recovery requires checking out
the corrected runner's branch first.

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

## What must never be done to clear an item here

- Rebinding an owner-admitted checksum for any reason, including to make CI green
- Drafting an authorization record containing an approval, which fabricates the
  approval whether or not it is labelled a draft or a template
- Merging with a required gate disabled, removed from the workflow, or narrowed
  so that it stops covering the changed bytes
- Reading owner approval of one item as approval of a later or broader one
