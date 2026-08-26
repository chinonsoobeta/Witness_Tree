# Phase 1 transformation-scope owner approval

The owner-approved decision is recorded in [`data/phase1-transformation-scope-owner-approval-2026-08-25.json`](../data/phase1-transformation-scope-owner-approval-2026-08-25.json). It binds the read-only downstream preparation packet at SHA-256 `4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a` and approves exactly seven named transformation designs:

- NTEMS annual land cover, forest harvest, canopy cover, and canopy height;
- the shared 2023 federal-electoral district scope for `fed-2023-ridings` and `elections-canada-45th-files`; and
- Québec current-ecoforest and original-current-inventory lossless stand-copy scopes.

The approval is deliberately narrow. It authorizes no transformation execution, output creation, ingestion, release, production admission, production eligibility, AWS or other external mutation, or change to the preparation packet. The specification files remain their original non-admitting records; a later execution must produce new checksum-bound artifacts, and ingestion, release, and production decisions remain separate.

The eight other packet scopes remain blocked by their named prerequisites and are not covered by this approval. The Québec fourth-inventory preflight remains preflight-only.

Run the fail-closed checks with:

```sh
node scripts/check-phase1-transformation-scope-owner-approval.mjs
node --test tests/phase1-transformation-scope-owner-approval.test.mjs
```
