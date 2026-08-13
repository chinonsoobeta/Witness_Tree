# Phase 1 authoritative source inventory and risk register

[`data/phase1-source-inventory.json`](../data/phase1-source-inventory.json) is the machine-readable planning inventory for every dataset or expressly excluded source named in plan section 5 and Appendix A.

It is deliberately separate from the illustrative source ledger and from the pre-ingestion candidate registry. `production` means the plan requires the source before a production release; it does **not** mean that it was selected, licensed, retrieved, ingested, archived, or made available. `reference` is supporting discovery or context. `excluded` is a binding non-use decision from the plan.

Each record identifies the accountable role, present evidence state, outstanding decision or evidence, and external dependency. The validator requires all plan categories and rejects an incomplete unresolved record:

```sh
npm run check:phase1-source-inventory
```

The register does not authorize procurement, contact with publishers, downloading, source selection, ingestion, or release. Those actions require the evidence and approvals recorded as missing in the relevant record.
