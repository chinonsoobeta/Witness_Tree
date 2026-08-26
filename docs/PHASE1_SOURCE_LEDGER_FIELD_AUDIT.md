# Phase 1 source-ledger field audit

[`data/phase1-source-ledger-field-audit.json`](../data/phase1-source-ledger-field-audit.json) is the field-level companion to the canonical 31-row production ledger in [`data/phase1-production-source-ledger.json`](../data/phase1-production-source-ledger.json).

The 31 historical plan rows remain visible, but Version 2.1 classifies them against [`data/phase1-optional-enhancements.json`](../data/phase1-optional-enhancements.json): 22 are Phase 1 core rows and the exact nine restricted rows are tracked optional enhancements. Optional rows remain non-admitted and are not Phase 1 core blockers. Therefore `phaseComplete` and `productionAdmissionAllowed` are derived only from complete/admitted core rows; the audit exposes both core and optional counts so an optional row cannot be silently dropped or reclassified.

The audit makes the Phase 1 source-ledger contract machine-checkable. Each canonical production row must show an explicit status for every required field from the implementation prompt and plan section 5.9:

- publisher, dataset title, source URL, exact licence identifier and licence link;
- source edition/effective date, retrieval date, raw checksum, and archive version;
- coverage, schema, transformations, required attribution, redistribution and bulk-redistribution status;
- modification notice, the original-language name and reviewed plain-language explanation;
- update cadence, next expected refresh, correction contact route, and admission state.

`verified` fields require a non-empty value and a deterministic evidence binding: the referenced JSON file's SHA-256 and JSON-pointer value must match the field value. `missing` fields require a reason and cannot carry an asserted value. A coarse `proof` boolean in the canonical ledger cannot fill a missing field-level fact.

The current result is intentionally partial: 2/22 core rows and 2/31 tracked rows are complete and admitted—the two federal row identities bound to the admitted Elections Canada artifact. The audit currently contains 224 directly bound field facts: 215 on core rows and nine on optional rows. The per-row coverage is asserted in the focused test, and the population helper rebuilds every binding from its exact checked-in JSON path, SHA-256, and pointer. Remaining fields stay explicitly missing rather than being inferred from coarse proof flags. “Missing” is scoped to this canonical field-level audit; it does not assert that no other repository evidence exists. No additional eligibility, ingestion, release, or public admission is inferred. `scripts/check-phase1-source-ledger-field-audit.mjs` rejects omitted rows, extra or missing fields, stale canonical references, unsupported values, invented evidence, optional/core reclassification, and any phase-complete or admission claim while a core required field is missing. The tamper-negative tests are in [`tests/phase1-source-ledger-field-audit.test.mjs`](../tests/phase1-source-ledger-field-audit.test.mjs).
