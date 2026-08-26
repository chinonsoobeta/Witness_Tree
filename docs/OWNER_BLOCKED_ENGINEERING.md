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

## What must never be done to clear an item here

- Rebinding an owner-admitted checksum for any reason, including to make CI green
- Drafting an authorization record containing an approval, which fabricates the
  approval whether or not it is labelled a draft or a template
- Merging with a required gate disabled, removed from the workflow, or narrowed
  so that it stops covering the changed bytes
- Reading owner approval of one item as approval of a later or broader one
