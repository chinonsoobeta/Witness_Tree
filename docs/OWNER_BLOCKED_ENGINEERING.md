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

### The QC original current inventory extraction checksum

`data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json`
binds the extracted GeoPackage at SHA-256 `70539d99`. The file on disk does not
hash to that value, so the runner refuses at
`scripts/run-qc-stand-copy.mjs:151` before doing any work. The bound value is
the one that is wrong, and this is established rather than assumed.

The member was reproduced on 2026-08-27 by streaming it out of the raw archive
and hashing it without writing an intermediate file. The archive was hashed in
the same pass and matched its own bound value, `c10d6915`, so the source of the
reproduction is itself verified:

| Quantity | Declared by the archive | Reproduced | On disk |
| --- | --- | --- | --- |
| Member bytes | 33,243,570,176 | 33,243,570,176 | 33,243,570,176 |
| Member CRC-32 | `cbbf042d` | `cbbf042d` | `cbbf042d` |
| Member SHA-256 | not declared | `819a5698` | `819a5698` |

Three independent quantities agree that the file on disk is the archive member,
and none of them agrees with `70539d99`.

#### Where the wrong value came from is not fully known

`data/qc-original-current-inventory-profile.json` recorded `70539d99` on
2026-08-14. That profile was taken against the **internal drive** path,
`.../go/Witness_Tree-data/extracted/...`, and the internal copy was deleted in
the SSD cutover on 2026-08-26. The bytes it measured therefore cannot be
examined. That makes the cause unavailable, not contradicted, and it is recorded
as unknown rather than guessed.

One plausible mechanism was tested and refused. If a profiling tool had opened
the GeoPackage read-write and mutated it before hashing, the recorded value
would be post-mutation. Reproduced on a throwaway GeoPackage, neither
`sqlite3 "PRAGMA integrity_check"` nor `ogrinfo` without `-ro` changed a single
byte. The hypothesis is discarded rather than carried forward as a likely story.

What remains certain is narrower and sufficient: the value bound today does not
describe the archive member, and the value that does is reproducible from an
archive whose own checksum verifies.

#### The profile is not corrected in place

`data/qc-original-current-inventory-profile.json` is a record of what a past run
produced. It is not rebound, and would not be rebound even on the owner's
instruction, because its claim is about what was measured on 2026-08-14 and not
about what is true now. Rewriting it would assert that the 2026-08-14 run
observed something it did not. It is superseded by a correction record instead.

#### The correction does not stay inside the QC scope

The owner approved rebinding the QC execution approval on 2026-08-27. That
approval is sufficient for the QC records and is not the reason this is still
open. The reason is that the correction does not stay inside them.

`check-phase1-downstream-admission-packet.mjs:54` hashes every specification
file and asserts it equals the checksum the packet records for it. So changing
the specification's bytes changes `data/phase1-downstream-admission-packet.json`,
and the packet's own SHA-256 `4859407e` is bound in twenty-one places, including
records belonging to scopes that have nothing to do with Québec:

| Kind | Records |
| --- | --- |
| Owner-admitted approvals | the two QC execution approvals, `phase1-federal-electoral-execution-approval.json`, `phase1-transformation-scope-owner-approval-2026-08-25.json` |
| Records of what a past run produced | `phase1-federal-electoral-output-verification-evidence.json`, `phase1-federal-electoral-production-admission.json` |
| Constants in checkers and runners | `PACKET_SHA256` in six scripts, `OWNER_SCOPE_APPROVAL_SHA256` in three |
| Tests and prose | two test files, three documents |

The scope owner approval is itself bound at `fda1c43d` by the federal-electoral
records, so it cascades a second time.

Correcting one wrong input measurement for one unexecuted Québec scope therefore
rewrites the checksum spine of all of Phase 1 and reissues a different scope's
owner-admitted approvals. The owner's approval named the QC execution approval.
It is not read as covering the federal-electoral records, and that is the
narrower reason this stays open.

#### The coupling is the underlying defect

Binding an aggregate packet checksum into per-scope evidence means no factual
error in any specification can ever be corrected locally. Every correction is a
Phase 1-wide re-authorization, which makes the expensive and risky path the only
path, and that pressure is what makes rebinding-to-get-green tempting. The
packet should bind specifications by identity and per-spec checksum, so that a
scope's records depend on that scope's bytes and not on every other scope's.
That is a design change and is recorded here rather than made in passing.

#### What is not blocked

The federal-electoral evidence record does not have to be falsified to fix this.
It records the packet checksum that was current when that run happened, which
stays true. The correct treatment is a fresh verification run producing a new
record, not an edit to the existing one.

#### Why engineering was stopped, and what released it

The corrected value had to reach the specification, and the specification's own
SHA-256 is bound twice inside
`data/phase1-qc-original-current-inventory-execution-approval.json`, at
`specification.sha256` and at `approvedScopes[].specSha256`, in a record
carrying `"decision": "approve"`. The same record binds the extraction directly
at `extractedGeoPackageSha256`. Correcting the checksum therefore reissued an
owner-admitted approval, which is the one thing engineering does not do on its
own authority. The edit was deliberately left unstaged until the owner gave it,
because a draft of such a record is still a fabricated approval.

The owner gave that instruction on 2026-08-27, together with approval for the
federal-electoral records the cascade reaches. The correction is applied on
`fix/decouple-packet-and-correct-qc-extraction`. Two things were held to while
applying it. The diffs on owner-admitted records show only the substituted
checksums and nothing else, so each shows exactly what was approved. And no gate
moved: all 85 exit criteria across the ten phase files were compared before and
after, 40 pass in both, with no criterion changing state.

Two records were not rewritten, because their claim is about history rather than
intent. `data/qc-original-current-inventory-profile.json` still records the
`70539d99` the 2026-08-14 profiling run reported; the readiness checker follows
the supersession record instead of the profile for that one field, and fails
closed unless the correction record is present and binds both the exact stale
value and the exact corrected one.
`data/phase1-federal-electoral-output-verification-evidence.json` was not
edited either. It was regenerated by a fresh verification run against the real
artifact on 2026-08-27, which passed, including byte-for-byte deterministic
regeneration.

`qc-current-ecoforest` was never blocked on this. Its own extraction is verified
by the runner against `4f592f99` during execution.

### The archive reproduction session

Steps 1 and 5 through 8 of the runbook in
[RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md](RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md) are
local and touch no credential. Steps 3 and 4 are read-only S3 calls,
`head-object` and `get-object`; see the access finding below for why they are
not pinned with `--version-id` today. Step 2 mints the
session by reading a six-digit TOTP, and engineering must never handle, echo, or
record one. The session lasts 43,200 seconds, which is ample for every remaining
step. The blocker is therefore not a decision and not a cost; it is one gesture
that only the holder of the MFA device can perform.

### The archive role cannot read object versions

Diagnosed on 2026-08-26 with `scripts/diagnose-federal-electoral-archive-read-access.sh`,
which assumes the role once and runs six read-only probes that differ by one
variable each. The pattern of which probes fail is the diagnosis:

| Probe | Result |
| --- | --- |
| `get-caller-identity` | ok |
| `head-object` with `--version-id`, no checksum mode | 403 |
| `head-object` with `--version-id` and `--checksum-mode ENABLED` | 403 |
| `head-object` with no `--version-id` | ok |
| `list-object-versions` on that key | AccessDenied |
| `get-bucket-encryption` | AccessDenied |

`WitnessTreeArchivePromotionUploader` therefore holds `s3:GetObject` but not
`s3:GetObjectVersion` or `s3:ListBucketVersions`. Separately, the read-only
`WitnessTreeArchiveVerifier` role returns 403 on this prefix even unpinned, so
the reproduction currently requires a role that also holds write permission.
Both are least-privilege defects. Neither is a blocker for the drill and neither
was worked around by weakening a check.

The runner responds by trying the pinned read first and falling back to an
unpinned read that asserts the `VersionId` S3 reports on **both** the head and
the get equals the recorded version. That is not a weaker binding. A pinned read
proves you fetched version X; the fallback proves the bytes you received came
from version X and hash to the admitted SHA-256. Where they differ is when the
current version is not the recorded one, and there the fallback fails closed
while a pinned read would have quietly succeeded against a superseded object.
The local SHA-256 comparison against the admitted value is unchanged and remains
the load-bearing check. Because the pinned path is attempted first, the runner
strengthens itself with no code change once the IAM desired state is applied.

Applying that desired state is an owner action: it needs an IAM policy change in
the archive account.

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
| Phase 8 `operations-handbook` | The criterion's `ownerAuthorization` block, Release approver, 2026-08-26 | Merged as `74c2b3f` (#62) |
| Phase 6 `direct-database-tenant-isolation` | `data/phase6-account-alert-exit-status.json` | Merged as `74c2b3f` (#62) |
| QC stand-copy runner `-ro` removal | The owner's approval of the fixed runner, 2026-08-27 | Merged as `3faddce` (#63) |
| QC original current inventory extraction | The owner's instruction of 2026-08-27, "Do the full cascade now plus the coupling. You have my approval for the federal-electoral records." | Applied on `fix/decouple-packet-and-correct-qc-extraction` |

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
