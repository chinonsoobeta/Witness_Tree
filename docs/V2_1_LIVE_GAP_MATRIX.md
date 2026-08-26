# Version 2.1 live gap matrix

[`data/v2-1-live-gap-matrix.json`](../data/v2-1-live-gap-matrix.json) is the machine-checked local reconciliation record for the controlling Version 2.1 scope. It maps the 58 non-superseded Section 17 items, Phase 0–9 checkpoint/exit groups, and all five scope-amendment overrides.

The matrix is deliberately not a completion score, release report, or production claim. Its `status` says what has been demonstrated locally or what remains: `verified-local`, `partial`, `blocked-external`, `pending`, or `superseded`. `superseded` requirements are recorded to prevent older plan language from appearing as open work; they cannot be dependencies or blockers.

`maturity` is a separate evidence state. `local` is only code or local validation; `archived` is preserved source/archive evidence; `admitted` means a source passed its admission gate; `production-eligible` means all stated technical and approval gates are satisfied; `deployed` and `publicly-released` require their respective owner-authorized external actions. These states must not be inferred from one another.

Each row contains evidence paths, owning phase, dependency identifiers, the approval boundary, the smallest next implementation task, its test, and the final acceptance artifact. Evidence paths identify supporting local artifacts only; they do not authorize deployment, source use, external contact, release, or a production claim.

Run `node scripts/check-v2-1-gap-matrix.mjs` to validate the artifact. The test includes a positive validation case and tamper cases for a missing French label and a dependency on a superseded override.
