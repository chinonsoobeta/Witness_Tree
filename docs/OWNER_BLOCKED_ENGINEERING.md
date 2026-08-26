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
| #34 | Correct a false GDAL claim in `boundary-editions.json` | Owner-admitted boundary-edition evidence | A fresh admission covering the corrected boundary evidence |
| #46 | Fail-closed resume path for the NTEMS runner | Four owner-admitted NTEMS execution authorizations, plus three readback records | A fresh execution authorization for the four NTEMS specifications binding runner SHA-256 `09b1016849e0709e46ebad908eec0f01252d5e5eeed3e5cd2fcb712c2042dc90` |
| #50 | Completion outcome and data-root resolution for the federal-electoral runner | One owner-admitted federal-electoral execution authorization | A fresh execution authorization binding runner SHA-256 `f04cca5ccb27eb737c503d46c416295f674370e649331d5e90c0117467f20aa9` |

## The NTEMS resume block, stated plainly

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
