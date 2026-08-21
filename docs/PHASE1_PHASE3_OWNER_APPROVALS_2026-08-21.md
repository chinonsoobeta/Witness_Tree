# Phase 1 owner approvals and Phase 3 governance

Chinonso Obeta approved the complete cross-phase A-list on 2026-08-21. The exact machine record is [`data/phase1-phase3-owner-approvals-2026-08-21.json`](../data/phase1-phase3-owner-approvals-2026-08-21.json). Approval alone changes no evidence score: Phase 1 remains **14.25/31**, **38.7903226%**, **7 immutable**, and **0 admitted or eligible**; Phase 3 remains **47%**.

The federal, Québec current/original, Québec fourth-inventory, current-wildfire, and archive-control approvals are recorded. Their canonical artifact names, bytes, checksums, keys, IAM boundaries and retention dates remain those in the owner packet and linked preparations. No MFA prompt, upload, IAM mutation, retention write, legal-hold change, delete attempt, recovery operation, release or production admission occurred.

## Owner-local commands still required

Run each no-write preflight before its corresponding owner-local command. Stop on any drift.

```text
zsh scripts/run-phase1-approved-promotion.sh --preflight
zsh scripts/run-phase1-approved-promotion.sh --run-federal

zsh scripts/run-qc-approved-multipart-promotion.sh --preflight
zsh scripts/run-qc-approved-multipart-promotion.sh --run

node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data
```

For Québec fourth inventory, use the canonical execute template only after replacing all three controlled-directory placeholders with existing absolute owner-controlled paths and beginning a real MFA session. Do not store a TOTP or credentials in the repository.

For wildfire readback, copy `data/current-wildfire-derived-readback-owner-approval.json` to a private owner-controlled path, set it to mode `0600`, and run:

```text
zsh scripts/run-wildfire-derived-readback.sh --preflight /absolute/private/approval.json
zsh scripts/run-wildfire-derived-readback.sh --readback /absolute/private/approval.json
```

The local artifact/readback-approval preflight and static IAM desired-state check pass. The live read-only IAM dry run fails closed because the candidate policy does not preserve the existing statement order and content. No IAM mutation occurred. Reconcile that exact live-policy drift before running the live readback command; do not apply the current candidate.

The normal archive exercise remains owner-local:

```text
scripts/run-phase1-archive-owner-exercise.sh --preflight
scripts/run-phase1-archive-owner-exercise.sh --run
```

## Outreach stops

- The exact NBAC bilingual email was deduplicated against Sent mail, but the connector rejected the send as an irreversible disclosure of non-public project and archive plans. It remains unsent pending a fresh explicit send instruction after that risk is disclosed. The NBAC agreement remains unaccepted.
- The Alberta electoral request needs Chinonso Obeta's return address and physical signature before posting.
- The Québec electoral secure form needs a reply email and personal review and acceptance of its declaration and consent.
- The BC copyright form needs the missing address, phone, email confirmation, prior-permission answer, singular-URL handling, website copy-count, and fee ceiling. None was invented.
- Eight access-blocker messages are already recorded. Never resend them. Follow up only in the existing thread after reading the full reply.

## Phase 3 governance

Chinonso Obeta is recorded as accountable owner for published content, data quality, and dispute escalation. The existing NFI forest definition, evidence classes, and confidence rules are approved. **Witness Tree** remains the product name. **Mistik is not authorized** and cannot be used without written permission from the appropriate Cree language authority.
