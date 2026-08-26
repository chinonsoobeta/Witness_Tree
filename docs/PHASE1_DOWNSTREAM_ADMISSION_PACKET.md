# Phase 1 downstream admission packet

[`data/phase1-downstream-admission-packet.json`](../data/phase1-downstream-admission-packet.json) is a read-only, checksum-bound preparation packet for the 16 remotely archived Phase 1 core rows. It binds every applicable audited transformation-spec record by exact ID, row scope, file path, and SHA-256. A binding is evidence only: it does not create any owner decision or authorize execution.

The separate owner decision in [`data/phase1-transformation-scope-owner-approval-2026-08-25.json`](../data/phase1-transformation-scope-owner-approval-2026-08-25.json) approves exactly seven transformation scopes:

- the four NTEMS scopes: annual land cover, forest harvest, canopy cover, and canopy height;
- the shared federal-electoral scope for the two ledger rows; and
- the Québec current-ecoforest and original-current-inventory stand-copy scopes, separately.

That narrow transformation decision does not approve execution, ingestion, release, production admission, or production eligibility. The packet remains a preparation artifact and all of its claims, including `ownerDecisionCreated`, remain false.

The remaining scopes are split so their distinct prerequisites cannot be inherited: Québec fourth needs its semantic/profile preflight; AVI needs immutable archive readback plus an approved output destination and retention plan; PLVI needs schema-parity remediation or a complete owner-approved field mapping; and each current-wildfire scope retains its own named exact-version/recovery and downstream-validation prerequisites.

Validation:

```text
npm run check:phase1-downstream-admission-packet
node scripts/check-phase1-transformation-scope-owner-approval.mjs
```
