# Phase 1 owner approvals and Phase 3 governance

Chinonso Obeta approved the complete cross-phase A-list on 2026-08-21. The exact machine record is [`data/phase1-phase3-owner-approvals-2026-08-21.json`](../data/phase1-phase3-owner-approvals-2026-08-21.json). At the time, approval alone changed no evidence score: the historical Phase 1 baseline was **14.25/31**, **38.7903226%**, **7 immutable**, and **0 admitted or eligible**; Phase 3 remained **47%**.

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

The local Québec preflight passes without TOTP or AWS. The owner explicitly approved the additional exact IAM block in `docs/QC_IMMUTABLE_PROMOTION_PREPARATION.md`, including four-resource `s3:GetObjectVersion`, and root-side provisioning is complete. Independent normalized readback reproduces the three canonical policy SHA-256 values, the role has exactly one inline policy and no attached policies, and the dedicated operator policy is attached only to `WitnessTreeArchiveOperator`. Access Analyzer returned zero findings and live positive/negative simulations passed. The initial apply harness exited after attachment only because it compared pretty and compact JSON bytes; canonical JSON comparison proves there was no policy mismatch. IAM is ready, but no S3 call, archive evidence, retention evidence, production admission, or score credit exists. `--run` still requires a fresh owner-local MFA TOTP.

The configured Québec-runner MFA serial is present, has the safe account-scoped form `arn:aws:iam::286853118812:mfa/<path>`, and belongs to the profile whose read-only caller identity is exactly `arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator`. Its path is intentionally not recorded. The earlier runner required the literal terminal path `mfa/WitnessTreeArchiveOperator` and therefore rejected this valid alternate device path before STS. The corrected runner accepts any nonempty syntactically safe MFA path in account `286853118812`, never prints or enumerates it, and then requires the post-MFA caller to be exactly `WitnessTreeArchiveOperator` before assuming the exact Québec promotion role. Empty, malformed, wrong-account, and wrong-principal cases stop before role assumption or storage.

For Québec fourth inventory, use the canonical execute template only after replacing all three controlled-directory placeholders with existing absolute owner-controlled paths and beginning a real MFA session. Do not store a TOTP or credentials in the repository.

For wildfire readback, copy `data/current-wildfire-derived-readback-owner-approval.json` to a private owner-controlled path, set it to mode `0600`, and run:

```text
zsh scripts/run-wildfire-derived-readback.sh --preflight /absolute/private/approval.json
zsh scripts/run-wildfire-derived-readback.sh --readback /absolute/private/approval.json
```

The local artifact/readback-approval preflight and static IAM desired-state check pass. A root-side live read-only comparison also passes: the trust remains MFA-gated to the exact operator, the exact operator AssumeRole policy is unchanged, and the role policy already contains the exact four-resource `s3:GetObjectVersion` statement in the approved order. The earlier failure was a local comparison bug in the provisioner's already-present branch, not live-policy drift. The corrected dry run records identical base and desired policy SHA-256 `1b2f75726e3d3e97107e8cceca2d491048592e8cf571c24e419979c480cb65e3`, zero Access Analyzer findings, six exact allows, and two negative implicit denies. No IAM mutation occurred or is needed. The live readback remains owner-local because it requires a current MFA TOTP; it may not record version IDs in repository evidence.

The normal archive exercise remains owner-local:

```text
scripts/run-phase1-archive-owner-exercise.sh --preflight
scripts/run-phase1-archive-owner-exercise.sh --run
```

## Outreach stops

- The exact NBAC bilingual email was deduplicated against Sent mail, but the connector rejected the send as an irreversible disclosure of non-public project and archive plans. It remains unsent pending a fresh explicit send instruction after that risk is disclosed. The NBAC agreement remains unaccepted.
- The Alberta electoral request needs Chinonso Obeta's return address and physical signature before posting.
- The Québec electoral secure form needs a reply email and personal review and acceptance of its declaration and consent.
- The FOM-only copyright form was submitted and its view-only-use clarification was answered with the owner's authorization. Permission and authorized access remain pending. VRI and TAP remain unsubmitted; no contact details are retained here.
- Eight access-blocker messages are already recorded. Never resend them. Follow up only in the existing thread after reading the full reply.

## Phase 3 governance

Chinonso Obeta is recorded as accountable owner for published content, data quality, and dispute escalation. The existing NFI forest definition, evidence classes, and confidence rules are approved. **Witness Tree** remains the product name. **Mistik is not authorized** and cannot be used without written permission from the appropriate Cree language authority.
