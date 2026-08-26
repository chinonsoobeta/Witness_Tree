# The federal-electoral rebinding reaches further than the ledger recorded

Recorded 2026-08-26, during an attempt to clear #50 against an owner approval.

## What was attempted

The owner approved rebinding the federal-electoral runner checksum from
`79b11107` to `f04cca5c`, in reply to a question that named that digest. The
rebinding was applied to `data/phase1-federal-electoral-execution-approval.json`
and nothing else, and it worked: `check:phase1-federal-electoral-transformation`
passed, closing the single failure standing in the 156/1 baseline.

## What it broke

A full sweep on the rebound branch was **148 pass / 9 fail**. All nine failures
share one root cause, verified by reading the assertion in each:

```
actual:   59e526e779be7e169513562790f87d924af55872fc67e9f2e0cb5b9d199a2179
expected: be3ba42081f04d8313ad352c291c18f04a16f25599dd47f0e381a6170e39bbec
```

`be3ba420` is the pre-rebinding content of the execution approval file.
`59e526e7` is its content after the one-line runner rebinding. The record that
binds it is `data/phase1-federal-electoral-production-admission.json`:

| | |
| --- | --- |
| `schemaVersion` | `witness-tree/phase1-production-admission/1` |
| `status` | `owner-approved-admitted-and-release-approved` |
| `ownerAuthorization.decision` | `approve` |
| `ownerAuthorization.statement` | "I explicitly authorize ingestion, release, production admission, and deployment." |
| `decisions` | ingestionApproved, releaseApproved, productionAdmission, productionEligible, deploymentAuthorized, all `true` |

The nine failing checks are `phase1-production-source-ledger`,
`phase1-source-ledger-decision-readiness`, `phase1-current-state-completion-audit`,
`phase1-bc-ontario-row-audit`, `phase1-remaining-actions-audit`,
`phase1-nrcan-cover-processing-gate`, `phase1-owner-decision-queue`,
`federal-electoral-archive-recovery-evidence`, and
`phase1-federal-electoral-production-admission`. Seven of them appear in
`data/data-root-bound-checks.json`, but they are not failing for that reason
here: the data root was attached and readable throughout, and each names this
checksum rather than an unreadable path.

## Why this was reverted rather than carried

`OWNER_BLOCKED_ENGINEERING.md` records #50 as invalidating "one owner-admitted
federal-electoral execution authorization". That understates it. Rebinding that
authorization also invalidates an owner admission that authorizes ingestion,
release, production admission, production eligibility and deployment.

The owner was asked to approve binding a corrected runner. The owner was not
told that doing so would put a production and release admission into a failed
state, because that consequence was not known when the question was asked. The
ledger's own rule applies directly: never read owner approval of one item as
approval of a later or broader one. Carrying the rebinding would have done
exactly that, and would have left five production-level decision flags asserted
on top of a broken binding.

So the rebinding was reverted. #50 stays owner-blocked, and
`check:phase1-federal-electoral-transformation` stays red on a false failure.
That is the fail-closed outcome and it is the correct one.

## What the owner is now being asked to decide

Not a different runner. The same rebinding, with its real scope stated:

1. Rebind the runner checksum in
   `data/phase1-federal-electoral-execution-approval.json` from `79b11107` to
   `f04cca5c`, which changes that file's digest from `be3ba420` to `59e526e7`.
2. Re-admit `data/phase1-federal-electoral-production-admission.json` against the
   rebound execution approval, re-affirming ingestion, release, production
   admission, production eligibility and deployment for this scope.

Step 2 is the part that was never asked. Nothing in the underlying data changes:
the transformation output produced under the superseded runner on
2026-08-26T00:55:28Z is untouched and was re-verified during this work at
20,525,056 bytes, SHA-256
`ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05`, an exact
sidecar match, 352 features, 343 districts, zero invalid geometry. The question
is only whether the owner re-affirms a production and release decision against
evidence text that now names a corrected runner.

## Note on the NTEMS re-authorization

The equivalent rebinding for #46 was carried, and does not have this problem. A
full sweep on that branch was 156 pass / 1 fail, identical to the main baseline,
with the one failure being this federal-electoral false failure. No NTEMS
production admission binds the four execution authorizations, because no NTEMS
production admission record exists yet.
