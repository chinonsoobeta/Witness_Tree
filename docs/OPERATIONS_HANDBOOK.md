# Operations handbook (draft)

## What this is, and what it is not

This is a draft. It does **not** satisfy the Phase 8 `operations-handbook`
exit criterion, and that criterion's status is deliberately left at `fail` in
[`data/phase8-launch-readiness-exit-status.json`](../data/phase8-launch-readiness-exit-status.json).
The criterion requires incident, escalation, ownership, and production
procedures. Escalation, ownership, and staffing name real people and real
provider relationships. Engineering cannot supply those, and writing them from
inference would fabricate the very thing the gate exists to establish.

What engineering can supply is everything derivable from the code that already
exists: which operations mutate anything, how they refuse, what an interrupted
run leaves behind, and what an operator must do about it. That is what follows.
[What only the owner can supply](#what-only-the-owner-can-supply) lists the
remainder, so the gap is explicit rather than implied.

## The operating model

Nothing in this system mutates external storage on its own. There is no
scheduler, no daemon, and no CI job with write credentials. Every mutating
operation is a shell runner that an owner invokes interactively, that prompts
for a fresh MFA TOTP, and that assumes a narrowly scoped role in the approved
AWS account in `ca-central-1`.

This means the operational failure mode is not "something ran and broke". It
is "an owner started a run and it stopped". The rest of this handbook is
mostly about that.

## The runners

Thirteen shell runners perform mutating or credential-bearing work.

| Runner | Modes |
| --- | --- |
| `run-alberta-plvi-approved-promotion.sh` | `--preflight` `--run` |
| `run-current-wildfire-approved-promotion.sh` | `--preflight` `--run` |
| `run-federal-electoral-approved-promotion.sh` | `--preflight` `--run` |
| `run-phase1-approved-promotion.sh` | `--preflight` `--run` `--run-federal` `--resume` `--validate-resume-state` |
| `run-phase1-archive-owner-exercise.sh` | `--preflight` `--run` `--recover` |
| `run-phase1-canopy-completion-recovery.sh` | `--preflight` `--run` `--recover-canopy` |
| `run-qc-approved-multipart-promotion.sh` | `--preflight` `--run` |
| `run-qc-fourth-inventory-approved-promotion.sh` | `--preflight` `--run` `--resume-batch-two` |
| `run-wildfire-derived-approved-promotion.sh` | `--preflight` `--run` |
| `run-wildfire-derived-manifest-retention.sh` | `--preflight` `--run` |
| `run-wildfire-derived-readback.sh` | `--preflight` `--readback` |
| `run-wildfire-derived-recovery.sh` | `--preflight` `--dry-run` `--recover` |
| `run-wildfire-derived-recovery-owner.sh` | `--preflight` `--dry-run` `--recover` |

**Every runner has `--preflight`, and preflight comes first.** Preflight
validates the approval file, the private state, the IAM attestation, and the
local artifact checksums before anything is prompted or called. Several
runners are covered by tests that assert this directly, including
`tests/wildfire-derived-recovery.test.mjs` ("preflight makes no AWS call and
blocks already-completed evidence") and
`tests/federal-electoral-approved-promotion.test.mjs` ("federal preflight is
local-only and `--run` remains blocked"). Whether all thirteen are covered is
an [open verification item](#open-verification-items); do not assume it.

## The refusal contract

Nineteen shell scripts contain 384 explicit refusals across seven exit codes.
The codes are not a tidy taxonomy, and this table describes them as they
actually behave rather than as they might have been designed.

| Code | Count | What it means | What the operator does |
| --- | --- | --- | --- |
| `64` | 26 | Wrong invocation, a path outside the exact authorization, or a malformed/non-interactive TOTP prompt. | Fix the invocation. Nothing happened. Do not widen a path to make it fit. |
| `65` | 62 | A local precondition failed: approval, private state, IAM attestation, file mode, data root, or a local checksum. Most of these say "no TOTP or AWS call was made". | Repair the local input. Nothing remote happened. If a checksum failed, treat it as a real finding, not as a file to re-bind. |
| `69` | 38 | The environment is unusable: `aws`, `jq`, `node`, or `shasum` missing, a private directory could not be created, or the configured MFA serial is not the approved account serial. | Repair the workstation. A wrong MFA serial is a security finding, not a configuration nuisance. |
| `70` | 150 | A remote call, a conditional write, a retention application, or a readback failed after the session began. Messages name the stage and usually name what was not attempted next. | Stop. Read the message for what was *not* attempted. Do not retry blind; see [Interrupted runs](#interrupted-runs). |
| `73` | 35 | Recovery is ambiguous, or another preflight holds the owner-only lock. Typically a manifest exists without its approved payload, or an approved key already has a version. | Do not attempt a write. Preserve the diagnostic and request a version-specific audit. |
| `75` | 51 | The AWS session expired mid-run with private resume state preserved unchanged, or a readiness record is not approved so execution stays disabled. | If resumable, the message names the exact resume command. Use that command, not a fresh `--run`. |
| `77` | 22 | An identity or account boundary failed: the assumed role is not the approved role, is outside the approved account, or the role response was incomplete. | Stop and treat as a security finding. Do not re-run. |

The design invariant worth internalising: a refusal tells you what did **not**
happen. Messages end with clauses like "no TOTP or AWS call was made", "no
recovery write was attempted", "no overwrite or delete was attempted", "state
was preserved unchanged". Code `70` refusals more often name the failing stage
instead. Either way the message, not a guess, is what establishes where the
run stopped.

## Interrupted runs

There are two distinct continuations and they are not interchangeable.

**Resume** applies when a run stopped with private resume state intact, which
is the normal outcome of an expired session (code `75`). The refusal prints
the exact resume invocation. `run-phase1-approved-promotion.sh` additionally
offers `--validate-resume-state`, which inspects the saved state without
continuing. Validate first when there is any doubt about what the state holds.

**Recovery** applies when the remote state is known to be partial: some
approved objects exist and some do not. `run-phase1-archive-owner-exercise.sh`,
`run-phase1-canopy-completion-recovery.sh`, and the two
`run-wildfire-derived-recovery*.sh` runners exist for this.
`run-wildfire-derived-recovery.sh` states its own boundary in its header, and
it is the tightest of the four: it reuses an existing payload version, creates
only missing objects, never overwrites an existing key, never deletes, never
completes a foreign multipart upload, and never writes a legal hold. Read each
other recovery runner's header before invoking it rather than assuming the
same boundary.

Only the two `run-wildfire-derived-recovery*.sh` runners provide `--dry-run`
between preflight and `--recover`. Where it exists, use it.

**A partial checkpoint requires owner review before any retry.** In
`run-wildfire-derived-recovery.sh` this is enforced rather than advisory: it
refuses with "Partial recovery evidence requires owner review before any
retry; no TOTP or AWS call was made". Whether the other recovery runners carry
the same refusal has not been confirmed, so treat the rule as binding on the
operator regardless of whether the runner enforces it. Do not
delete the checkpoint to clear the refusal. The checkpoint is the record of
what a past run produced, and deleting it destroys the only account of where
the remote state actually stands.

## Evidence handling during an incident

Three rules apply to anything written while diagnosing a failure.

1. **Never record MFA TOTP values or temporary credentials.** Not in a
   diagnostic, not in a commit, not in an issue.
2. **Preserve exact version IDs, checksums, and retention boundaries
   privately.** Commit only approved redacted evidence. Private diagnostics
   are written mode-600 to an owner-owned directory; runners refuse (code
   `65`) if the mode or ownership is wrong.
3. **Unknown is not zero.** If a check could not read its inputs, its result
   is unavailable, not failed and not passed. See
   [DATA_ROOT_BOUND_CHECKS.md](DATA_ROOT_BOUND_CHECKS.md).

## The data root, and a standing exposure

Nineteen check scripts read real bytes under `Witness_Tree-data` and verify
them against bound checksums. While the drive holding that directory is
detached, those nineteen cannot be evaluated and no evidence derived from them
may be recorded as satisfied.

That drive currently holds the **only** copy. There is no second copy and no
provider durability evidence; Phase 8 `backups` is open for exactly this
reason. Reattaching the drive, and establishing a second copy, are owner
actions. Nothing in this repository substitutes for either.

## What only the owner can supply

The `operations-handbook` and `on-call-rota` criteria stay open until these
exist. Each names a real person, a real relationship, or a real rehearsal.

- **Ownership.** Who is accountable for each runner, each AWS resource, and
  the data root.
- **Escalation.** Who is contacted, in what order, on what channel, with what
  response expectation.
- **On-call.** A staffed, approved rota with coverage, handover, and an
  approval record. An unstaffed rota is not a rota.
- **Provider relationships.** AWS support tier and contacts; who may open a
  case; what may be disclosed in one.
- **Production procedures.** Deploy, rollback, and change windows for the
  hosting target. These cannot be written before the target is deployed;
  Phase 8 `observability` and `cdn-tile-validation` are open for the same
  reason.
- **Incident classification.** What counts as a security incident here, who
  declares one, and what notification obligations follow. The code can refuse
  on an identity boundary (code `77`); only the owner can define what happens
  next.
- **A timed rehearsal.** Phase 6 `kill-switch-under-five-minutes` needs an
  observed, independently timed drill. A unit test cannot establish an
  operational time bound.

## Open verification items

These are unproven, and this document does not claim otherwise.

- Whether all thirteen runners are covered by a test asserting that
  `--preflight` makes no AWS call and issues no TOTP prompt. Several are;
  the full set has not been confirmed.
- Whether the seven exit codes are used consistently across all nineteen
  scripts. The table above describes observed behaviour, and code `64`, `73`,
  and `75` each carry more than one distinct meaning.
- Whether every recovery runner refuses a partial checkpoint. It is proven for
  `run-wildfire-derived-recovery.sh` by
  `tests/wildfire-derived-recovery.test.mjs`; the others have not been checked
  for this specific refusal.
