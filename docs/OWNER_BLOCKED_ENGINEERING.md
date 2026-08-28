# Owner-blocked engineering

No current owner-blocked engineering item remains in this ledger as of
2026-08-28. The QC resume fix was owner-reauthorized and merged, the Phase 2
resume fix was merged, the packet/checksum correction was merged, and the
raw-archive reproduction passed. The sections below preserve the reasoning and
evidence for those historical blockers; they are not a current work queue.

This is deliberately narrow. It is not a list of external gates, which
[`EXTERNAL_GATES.md`](EXTERNAL_GATES.md) holds, and not a list of ledger rows
awaiting production decisions, which
[`PHASE1_OWNER_DECISION_QUEUE.md`](PHASE1_OWNER_DECISION_QUEUE.md) holds. It is
the shorter list of code changes that were correct and proven, and that would
have invalidated an owner-admitted record if merged. Historical labels are
intentional: they distinguish what was blocked then from what is blocked now.

## Why the historical items could not be unblocked by engineering

At the time, an owner-admitted record bound exact bytes and carried
`"decision": "approve"`.
Rebinding one would mean an engineer re-issuing an approval in the owner's name.
That is never done here, and a red gate is left red instead.

The distinction that matters is not "does the checksum still match" but "who
made the claim the checksum is attached to". An engineering-derived checksum may
be rebound after confirming the bound criterion's stated reason still holds. An
owner-admitted checksum may not be rebound at all. A record of what a past run
produced may not be rebound either, even by the owner, because the claim it
carries is about history rather than intent.

## Historical blocked items and their resolutions

| Historical item | Historical change | What it would have invalidated | Resolution and current evidence |
| --- | --- | --- | --- |
| QC stand-copy runner | Identity-based resume for `run-qc-stand-copy.mjs` | Two owner-admitted QC execution approvals | Resolved and merged in `8ad5120`. `data/phase1-runtime-runner-reauthorization-2026-08-28.json` records the owner reauthorization and binds the current runner SHA-256. |
| Raw archive reproduction drill | Re-running the drill against the changed federal-electoral runner | The pre-correction binding in the drill record | Resolved by the recorded passed drill: its current record has `status: "passed"`, `exactByteMatch: true`, and the current runner binding. |

The QC item was the same "existence means refuse" defect as #46, in the runner
for both Québec stand-copy scopes. Historically, it refused whenever the
artifact or sidecar existed, although `binding.expected.rawSha256` was already
in scope and part of the output path. The identity comparison it needed was
available but unused. The current runner is merged, and both QC execution
approvals now bind its reviewed SHA-256 under the 2026-08-28 reauthorization.
This resolves the owner-blocked engineering item; it does not grant ingestion,
release, or production admission.

`run-phase2-v21-raster-first.mjs` had the same shape and was not checksum-bound.
Its identity-bound resume repair was merged with the QC repair in `8ad5120`.
The two `.failed-*` sibling directories described by the historical audit are
historical observations, not instructions to delete or rewrite data. A future
run still fails closed on a partial, foreign, or byte-drifted pair.

## Historical owner-action item and resolution

This item was different in kind from the historical runner blockers. It did not
invalidate an existing approval, and the engineering half was finished and
merged. The owner action has since been completed, so this table is historical.

| Historical item | State at closure | Resolution | Evidence |
| --- | --- | --- | --- |
| Phase 8 `raw-archive-reproducibility` | **Closed on 2026-08-27.** The owner ran the restore, the reproduction matched the admitted SHA-256 exactly, and the gate passed | Nothing further; it is not owner-blocked engineering | `data/raw-archive-reproduction-drill.json` and the Phase 8 status record |

### Historical QC extraction checksum and packet correction

Before the correction merged, the specification
`data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json`
bound the extracted GeoPackage at SHA-256 `70539d99`. The historical file on
disk did not hash to that value, so the then-current runner refused at
`scripts/run-qc-stand-copy.mjs:151` before doing any work. The bound value was
established as wrong rather than assumed. The current specification and
execution approval bind the reproducible extracted SHA-256
`819a5698456089a9f291925a9b9bf1eb1415f29985ff43107d383c1f46753dfd`.

The member was reproduced on 2026-08-27 by streaming it out of the raw archive
and hashing it without writing an intermediate file. The archive was hashed in
the same pass and matched its own bound value, `c10d6915`, so the source of the
reproduction is itself verified:

| Quantity | Declared by the archive | Reproduced | On disk |
| --- | --- | --- | --- |
| Member bytes | 33,243,570,176 | 33,243,570,176 | 33,243,570,176 |
| Member CRC-32 | `cbbf042d` | `cbbf042d` | `cbbf042d` |
| Member SHA-256 | not declared | `819a5698` | `819a5698` |

Three independent quantities agreed that the file on disk was the archive
member, and none agreed with the historical `70539d99`. This is preserved as
the evidence that justified the correction; it is not a current checksum
blocker.

#### Historical uncertainty about the wrong value

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

What remains certain is narrower and sufficient: the historical value did not
describe the archive member, and the corrected value is reproducible from an
archive whose own checksum verifies.

#### Historical profile remains unchanged

`data/qc-original-current-inventory-profile.json` is a record of what a past run
produced. It is not rebound, and would not be rebound even on the owner's
instruction, because its claim is about what was measured on 2026-08-14 and not
about what is true now. Rewriting it would assert that the 2026-08-14 run
observed something it did not. It remains historical evidence and is superseded
for the current binding by a correction record instead.

#### Historical coupling and blast radius

At the time, the owner approved rebinding the QC execution approval on
2026-08-27. That approval was sufficient for the QC records, but the correction
also reached unrelated records because the packet checksum was coupled to the
specification registry. This was the historical reason the change was held.

`check-phase1-downstream-admission-packet.mjs:54` hashes every specification
file and asserts it equals the checksum the packet records for it. So changing
the specification's bytes changes `data/phase1-downstream-admission-packet.json`,
and the historical packet SHA-256 `4859407e` was bound in twenty-one places, including
records belonging to scopes that have nothing to do with Québec:

| Kind | Records |
| --- | --- |
| Owner-admitted approvals | the two QC execution approvals, `phase1-federal-electoral-execution-approval.json`, `phase1-transformation-scope-owner-approval-2026-08-25.json` |
| Records of what a past run produced | `phase1-federal-electoral-output-verification-evidence.json`, `phase1-federal-electoral-production-admission.json` |
| Constants in checkers and runners | `PACKET_SHA256` in six scripts, `OWNER_SCOPE_APPROVAL_SHA256` in three |
| Tests and prose | two test files, three documents |

The scope owner approval is itself bound at `fda1c43d` by the federal-electoral
records, so it cascades a second time.

At that time, correcting one wrong input measurement for one unexecuted Québec
scope would have rewritten the checksum spine of all of Phase 1 and reissued a
different scope's owner-admitted approvals. The owner's approval named the QC
execution approval and was not read as covering the federal-electoral records.
This historical coupling was resolved by the packet decoupling and correction
merged in `4779f3f` (#66); it is no longer an open item.

#### Historical coupling defect

Binding an aggregate packet checksum into per-scope evidence means no factual
error in any specification can ever be corrected locally. Every correction is a
Phase 1-wide re-authorization, which makes the expensive and risky path the only
path, and that pressure is what makes rebinding-to-get-green tempting. The
packet should bind specifications by identity and per-spec checksum, so that a
scope's records depend on that scope's bytes and not on every other scope's.
That design change was made and merged in `4779f3f` (#66). The paragraph is
retained to explain the former blocker, not to propose an unimplemented fix.

#### Historical records that were not rewritten

The federal-electoral evidence record did not have to be falsified to fix this.
It records the packet checksum that was current when that run happened, which
stays true as historical evidence. The correction therefore used a fresh
verification run producing a new record, not an edit to the old one.

#### Historical stop and recorded resolution

At that time, the corrected value had to reach the specification, and the specification's own
SHA-256 is bound twice inside
`data/phase1-qc-original-current-inventory-execution-approval.json`, at
`specification.sha256` and at `approvedScopes[].specSha256`, in a record
carrying `"decision": "approve"`. The same record binds the extraction directly
at `extractedGeoPackageSha256`. Correcting the checksum therefore reissued an
owner-admitted approval, which is the one thing engineering does not do on its
own authority. The edit was deliberately left unstaged until the owner gave it,
because a draft of such a record is still a fabricated approval.

The owner gave that instruction on 2026-08-27, together with approval for the
federal-electoral records the cascade reached. The correction and packet
decoupling were applied and merged in `4779f3f` (#66). Two things were held to
while applying it. The diffs on owner-admitted records show only the substituted
checksums and nothing else, so each shows exactly what was approved. No gate
moved: all 85 exit criteria across the ten phase files were compared before and
after, 40 passed in both, with no criterion changing state. Those are historical
integration checks, not a current open state.

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
by the runner against `4f592f99` during execution. The QC extraction correction
is now historical and merged; no checksum rebinding remains owner-blocked here.

### Historical reproduction-drill invalidation and resolution

The pre-correction drill ran between 2026-08-26T19:09:09Z and
2026-08-27T02:13:15Z, restored the archived inputs, and re-ran the
federal-electoral transformation from them. That timing and its runner binding
are historical evidence from before the packet/checksum correction.
`check-raw-archive-reproduction-drill.mjs:128` requires the runner SHA-256 that
the drill recorded to equal the runner in the repository today. That rule is
deliberate: a reproducibility claim is only worth something if it applies to the
code actually in use.

Historically, correcting the QC extraction checksum changed the downstream
admission packet, and the federal-electoral runner carried the packet's SHA-256
as a source constant, so the runner's bytes changed from `f04cca5c` to
`e333b27c`. The pre-correction drill binding was consequently stale and the
gate refused.

Rebinding that historical record would not have been valid. Its claim is about
what a specific past run observed, so writing today's runner hash into it would
assert that the drill exercised bytes it never saw. The owner instead completed
a fresh MFA-assumed run. The current `data/raw-archive-reproduction-drill.json`
is `status: "passed"`, records the current runner SHA-256
`e333b27cab488a53b5c7a27db7236c5792129482ec8e93fe5af75a94b3c8734b`, and
records `exactByteMatch: true` for the admitted output.

The owner-local rerun was a real cost of the coupling fix, and it remains
historical context. No reproduction action is currently owner-blocked.

### Historical archive reproduction session

Steps 1 and 5 through 8 of the runbook in
[RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md](RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md) are
local and touch no credential. Steps 3 and 4 are read-only S3 calls,
`head-object` and `get-object`; see the access finding below for why they are
not pinned with `--version-id` today. Step 2 mints the
session by reading a six-digit TOTP, and engineering must never handle, echo, or
record one. The session lasts 43,200 seconds, which was ample for the completed
run. At the time, the remaining owner-local action was one gesture available
only to the holder of the MFA device; the recorded rerun completed it. This
section documents the credential boundary, not a current blocker.

### Current archive access finding (not an owner-blocked item)

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
the load-bearing check. Because the pinned path is attempted first, applying the
IAM desired state would enable that stronger path without another code change.

Applying that desired state remains an owner action requiring an IAM policy
change in the archive account. It is a least-privilege remediation, not a
prerequisite for the completed reproduction drill.

The earlier no-run path exited 1 with a message saying the drill had not been
executed. That was the historical pre-rerun state. The owner-local run now
provides the current passed record, and the Phase 8 reproducibility gate is
closed on its stated one-chain scope.

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

## Historical owner decisions and merges

These records explain former owner boundaries and their resolutions. They are
historical, not open work. The current owner reauthorization and the current
passed reproduction record are included so that the old state is not mistaken
for today's state.

| Historical item | Decision or evidence record | Outcome |
| --- | --- | --- |
| #34 | `data/phase2-boundary-editions-readmission-2026-08-26.json` | Merged as `04da17b` |
| #46 | `data/phase1-ntems-runner-reauthorization-2026-08-26.json` | Merged as `778e0ea` |
| #50 | `data/phase1-federal-electoral-runner-reauthorization-2026-08-26.json` | Merged as `ba4e54c` |
| Phase 8 `operations-handbook` | The criterion's `ownerAuthorization` block, Release approver, 2026-08-26 | Merged as `74c2b3f` (#62) |
| Phase 6 `direct-database-tenant-isolation` | `data/phase6-account-alert-exit-status.json` | Merged as `74c2b3f` (#62) |
| QC stand-copy runner `-ro` removal | The owner's approval of the fixed runner, 2026-08-27 | Merged as `3faddce` (#63) |
| QC original current inventory extraction and packet decoupling | The owner's instruction of 2026-08-27, "Do the full cascade now plus the coupling. You have my approval for the federal-electoral records." | Merged as `4779f3f` (#66) |
| QC and Phase 2 identity-bound resume fixes | `data/phase1-runtime-runner-reauthorization-2026-08-28.json` | Merged as `8ad5120` (#84); the owner record reauthorizes the QC runners only, while the Phase 2 repair required no owner rebinding |
| Raw archive reproduction | `data/raw-archive-reproduction-drill.json` | Fresh owner-local run passed; the Phase 8 one-chain reproducibility gate is closed |

Each code or document change above landed through its pull request with the
required `verify` check green and branch protection intact. The raw archive
entry is an evidence run rather than a merge. The one sweep failure that stood
on #46 was not its own: `check:phase1-federal-electoral-transformation` was
refusing because its output existed, which is the defect #50 fixed, and it
cleared when #50 landed.

No gate moved as a result of those historical merges. Four exit-status files
changed bytes across them, all of them checksum rebindings; the criterion
counts and the passing counts in each were identical before and after. That was
checked rather than assumed, because a rebinding that advances a gate is a
defect and not progress.

### Historical integration near-miss

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

### Historical in-flight dependency

The annual land cover transformation running while this was written had been
launched from the corrected runner at a time when that runner was not on
`main`. Its sidecars record no runner SHA-256, so the mid-run branch switch did
not corrupt provenance and the outputs already produced are sound. For the
window before #46 landed, a crash in that run could not have been resumed from
`main`, because `main` still carried the runner that refuses on an existing
output and has no `--resume`. That window is now closed: `main` carries the
corrected runner, and the run is resumable from it.

## Historical NTEMS resume block, stated plainly

Kept for the record. The owner has since re-authorized, so this describes how
the block arose rather than a block that is still open.

The annual land cover scope is 39 yearly rasters produced by one runner
invocation. The runner refuses to overwrite an existing output, and it performs
that check before producing anything, so the first already-completed year aborts
the whole run. A run interrupted at any point cannot be continued. The remaining
options are to delete checksum-bound completed work or to restart blindly.

The fix was written and proven in #46. Merging it changed the runner's bytes,
which four owner-admitted execution authorizations bound directly. At that time
the defect that blocked Phase 1 execution was itself blocked on an owner
signature, and the gate that reported this became a required CI step so that
the conflict was visible rather than discovered at execution time. The later
owner reauthorization and `8ad5120` merge resolved that historical block.

At the time of the reauthorization, three further records bound the runner as
readback evidence, naming which runner produced verified outputs. A fourth
dated readback record was added later. All four remain historical and should
not be reissued when the owner reauthorizes. They correctly describe runs that
already happened under the previous runner, and changing them would assert that
the new runner produced rasters it never produced.

## Historical federal-electoral block, and why it was the same defect twice

Historically, `--preflight` refused whenever the output or sidecar existed. The
transformation completed successfully on 2026-08-26 at 00:55:28Z, so from that
moment the gate reported failure for finished, correct work. The output was
re-verified against its sidecar during that investigation: 20,525,056 bytes,
SHA-256
`ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05`, an exact
match, with 352 features, 343 districts, and zero missing, empty, or invalid
geometry.

This was the NTEMS defect in a second runner. Both treated the existence of an
output as a reason to refuse, without asking whether that output was the one
they would have produced. The repair in both cases had the same shape: a
function that returned "produce" only for a genuinely absent pair, returned
"complete" only after recomputing the output's checksum and matching it against
its sidecar, and refused everything in between rather than guessing.

A second defect was hidden underneath the first. `ensureNoSymlink` walks every
ancestor of the output directory and refuses any symlink component, and after
the SSD cutover the data root is itself a symlink to the external volume. The
old code never reached that walk, because it refused at the existence check
first. The repair resolves the data root once, so the guard still walks
everything below the resolved root at full strength while the one deliberate
symlink passes. Nothing about what the guard protects is weakened.

At the time, both repairs changed the runner's bytes, which
`data/phase1-federal-electoral-execution-approval.json` binds with
`"decision": "approve"`. The federal-electoral approval was then reauthorized
under the recorded owner decision and the current runner is bound at
`e333b27cab488a53b5c7a27db7236c5792129482ec8e93fe5af75a94b3c8734b`. The old
binding is historical evidence, not the current state.

## What must never be done to clear an item here

- Rebinding an owner-admitted checksum for any reason, including to make CI green
- Drafting an authorization record containing an approval, which fabricates the
  approval whether or not it is labelled a draft or a template
- Merging with a required gate disabled, removed from the workflow, or narrowed
  so that it stops covering the changed bytes
- Reading owner approval of one item as approval of a later or broader one
