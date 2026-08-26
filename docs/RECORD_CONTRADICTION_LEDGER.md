# Record contradiction ledger

Engineering-derived. This file records places where two committed records
disagree about the same fact. It resolves nothing, admits nothing, and moves no
gate. Nothing here may be used to infer that a disagreement has been settled.

As of 2026-08-26.

## Why this file exists

Every checker in this repository validates one record against itself. None
cross-validates one record against another. That is the structural cause of
every entry below: each of these contradictions sits behind a check that exits
0 today.

A green check therefore means "this record is internally consistent", not "this
record is true". Where a record is stale, the staleness is invisible to CI.

## The rule these entries are held to

Where I could read the bytes, I say which side the bytes support. Where I could
not, the entry says so and stops. Dating a record tells you which was written
later; it does not tell you which the owner intends to govern. That
determination is not mine to make and none is made here.

## C-1, C-2, C-3. Four NTEMS scopes: "transformation pending" versus "transformed"

`data/phase1-owner-decision-queue.json` records `"transformation": "pending"`
for `ntems-canopy-height`, `ntems-canopy-cover` and `ntems-forest-harvest`.
Each scope's readback evidence record dated 2026-08-26 asserts
`"claims": {"transformed": true, ...}` and `"status": "complete-readback-verified"`.

What the bytes say:

| scope | recorded byte length | on disk | sha256 |
| --- | --- | --- | --- |
| ntems-forest-harvest | 205,794,727 | matches | verified, matches |
| ntems-canopy-cover | 13,110,248,051 | matches | not computed, over the 2 GB working limit |
| ntems-canopy-height | 14,112,018,239 | matches | not computed, over the 2 GB working limit |

All three sidecars hash correctly against their recorded values. For the two
large rasters the content hash is unverified: not read, therefore neither
confirmed nor contradicted. Byte-length agreement is not digest agreement.

The queue is `"asOf": "2026-08-22"`; the readback records are 2026-08-26. The
queue's `"pending"` was true when written. It is a committed record that
presently asserts a false state, and its checker passes.

## C-4. A green check asserting the non-existence of a file that exists

`data/phase1-nrcan-cover-processing-gate.json` records for `ntems-canopy-cover`:

- `"status": "blocked-no-phase1-production-named-specification-and-output"`
- `"specification": null, "run": null, "output": null`
- blocker: no repository-controlled specification names a canopy-cover output checksum
- blocker: no exact derived output or independent validation exists

Both blockers are contradicted by committed records.
`data/phase1-production-transformation-specifications-v1.json` contains a
`ntems-canopy-cover-v1` specification, and
`data/ntems-canopy-cover-v1-readback-evidence-2026-08-26.json` records exactly
the derived output and output checksum the gate says do not exist. The
canopy-cover raster is present on disk at the recorded byte length.

The gate is `"auditedAt": "2026-08-21T15:45:00Z"`, and
`npm run check:phase1-nrcan-cover-processing-gate` exits 0 today.

This is the most consequential entry, because the failure direction is the
dangerous one: a passing check is asserting an absence that is false.

## C-5. The two federal rows: admitted in the ledger, pending everywhere else

`data/phase1-production-source-ledger.json` records `fed-2023-ridings` and
`elections-canada-45th-files` as `"evidenceState": "production-admitted"` with
`"productionEligible": true`.

Four other committed records disagree:

- `data/phase1-owner-decision-queue.json`: both rows `"local-verified-profiled"`, `"productionAdmission": "pending"`, `"productionEligible": false`
- `data/phase1-current-state-completion-audit.json`: `productionAdmissionCompleteRows: 0`, and its `evidenceStateCounts` has no `production-admitted` key at all
- `data/phase1-remaining-actions-audit.json`: `"rowsWithoutProductionAdmission": 31`, `"allProductionRowsRemainNonAdmitted": true`
- `data/federal-electoral-archive-readiness-owner-evidence.json`: `"ownerApprovalRef": null`, `"evidenceFiles": []`

Partially reconciled. `data/phase1-ledger-post-scope-approval-evolution.json`
records the transition explicitly and binds the prior ledger hash to the
current one, and the completion-audit checker prints that its 0/31 is a
snapshot and that the later two-row federal admission is validated separately.
The other three records carry no such qualifier in their own JSON.

Unresolved and worth naming: `data/phase1-exit-status.json`'s
`complete-production-ledger` gate cites both the ledger and the completion
audit as current evidence. Its evidence set contains one record saying zero
rows are admitted and one saying two are.

## C-6. Specification status versus its own approval

`data/phase1-production-transformation-specifications-v1.json` carries
`"status": "unapproved-specification-only"` while
`data/phase1-transformation-scope-owner-approval-2026-08-25.json` approves all
five of its specification ids by checksum.

This is probably intentional layering: the specification file holds no
approval, and the approval lives in a separate record bound to it. Recorded for
completeness, not asserted as an error.

## C-7. Stale numeric baselines

The current ledger records `rawEvidenceNumerator: 16.5` with 16 rows at
`immutableArchive: true`.

| record | its baseline | disagreement |
| --- | --- | --- |
| `phase1-owner-decision-queue.json` (2026-08-22) | 14.75, 9 archive rows, 39.2741935% | 1.75 credits, 7 archive rows, plus a `local-verified-profiled` state the ledger no longer uses |
| `phase1-immutable-downstream-preflight.json` (2026-08-22) | 14.75, 9 archive rows | same |
| `phase1-nrcan-cover-processing-gate.json` (2026-08-21) | 14.25, 7 archive rows, 38.7903226% | 2.25 credits, 9 archive rows |
| `phase1-alberta-transform-ingestion-audit.json` (2026-08-21) | 14.25, 7 archive rows | same |

## What must not be done with this file

These contradictions must not be cleared by editing whichever record is more
convenient. Several of the disagreeing records are dated snapshots, and a
snapshot that was accurate when taken is a record of history: rewriting it to
agree with today would destroy the evidence that the state changed, which is
the same defect class as rebinding a record of what a past run produced.

The available honest moves are to supersede a stale record with a new dated one
that cites it, or to add the missing date qualifier to a record that is already
scoped by date in its checker but not in its own JSON. Neither is done here.
