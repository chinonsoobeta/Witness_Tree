# Phase 1 remaining-action audit

This is the fresh, machine-checked remaining-action audit derived from the authoritative Phase 1 convergence records at `4466a14` on 2026-08-21. The machine record is [`data/phase1-remaining-actions-audit.json`](../data/phase1-remaining-actions-audit.json), and its checker is [`scripts/check-phase1-remaining-actions-audit.mjs`](../scripts/check-phase1-remaining-actions-audit.mjs). The exact local processing boundary for the two remotely archived NRCan cover rows is recorded separately in [`PHASE1_NRCAN_COVER_PROCESSING_GATE.md`](PHASE1_NRCAN_COVER_PROCESSING_GATE.md); it adds no score or downstream admission.

The audit selects every production row where immutable remote proof is absent **or** production admission is absent. That is all 31 rows: 24 lack immutable remote proof, and all 31 remain non-admitted and non-eligible. The current evidence-tracking baseline is **14.25/31 raw credits and 38.7903226%**. This percentage is not a readiness or production percentage. The audit does not add credit for a prepared payload, dry run, owner-local resume state, reply, permission request, owner decision, or archive plan.

Run the check with:

```sh
npm run check:phase1-remaining-actions-audit
```

## Local implementation audit

The machine record now classifies all 13 remaining actions by requirement: archive and recovery preflights, profiles and validators, existing local transformations and derived outputs, owner/external boundaries, and the production-admission boundary. The local paths are complete for the evidence that exists. They remain deliberately non-admitting:

- The federal, Québec, fourth-inventory, current-wildfire, and derived-wildfire paths expose no-write preflights. The current-wildfire records are placeholder-only attestations: they do not durably prove versions, provider checksums, exact-version readback, retention, transformation, or ingestion.
- Alberta AVI repair/quarantine, Alberta PLVI closed-join validation, and Québec historical-wildfire lossless-copy evidence are locally checked outputs. They do not authorize downstream ingestion or release.
- NTEMS processing remains blocked because no Phase 1 production-admission target transformation specification and checksum-bound output exists. The separately approved Phase 2 nonproduction method does not close or imply those Phase 1 gates.
- Partial and access-blocked rows have route-exhaustion, outreach, and rights validators, but no local implementation can manufacture a publisher artifact, permission, owner decision, or external reply.

The local audit reports zero immediate raw-credit or formal-score delta. The remaining six gap groups require owner input or external evidence; production admission and eligibility remain false for all 31 rows.

## Exact next five owner/delegate actions

The ranking gives lawful immediacy priority to safe local preflight or a decision that can be made from existing evidence without an external reply. The score column is the maximum possible raw-credit and formal-score increase if every later gate also succeeds; the immediate increase is zero for every action.

| Rank | Action | Rows / deduplicated artifacts | What can happen now | Prerequisites | Maximum score impact |
| ---: | --- | --- | --- | --- | ---: |
| 1 | Federal-only archive promotion | One local federal ZIP shared by two rows | The no-write preflight is complete. | Owner approval of the exact federal-only archive, retention, MFA and durable readback path. | +0.50 raw; +0.483871 percentage points |
| 2 | Québec current/original archive preflight and owner promotion | Two Québec payloads; **2 artifacts / 2 rows** | Delegate may run the no-write local preflight. | Fresh owner approval for exact keys, ca-central-1, sequential multipart execution, COMPLIANCE retention, and exact readbacks. | +0.50 raw; +0.483871 percentage points |
| 3 | Québec fourth-inventory local preflight and owner approvals | One logical product with **62 exact archive keys / 1 row** | Delegate may run the no-write preflight, which hashes 61 source files and checks the deterministic 62nd manifest. | Separate approval for exact artifact set, irreversible COMPLIANCE retention, least-privilege IAM, MFA, and readbacks. | +0.25 raw; +0.2419355 percentage points |
| 4 | NRCan harvest/canopy downstream method | Two archived rows with recorded source-ledger decisions | Local source/profile validation is complete; no target output is authorized. | Owner names the transformation method and ingestion scope, then separate release and production decisions. | +0 raw; +0 points |
| 5 | Alberta PLVI transformation and ingestion | One archived raw/derived pair with recorded scope | Count, geometry, checksum, duplicate and no-loss validation are complete; ordered-schema ingestion preflight is blocked by two renamed fields and 23 integer type widenings. | Produce a corrected checksum-bound output or explicitly decide the field mapping, then separately admit transformation and ingestion; release and production decisions remain later gates. | +0 raw; +0 points |

The national federal ZIP is one artifact shared by two ledger rows, and the Québec fourth-inventory product's 62 keys are one product rather than 62 credits. The audit rejects duplicate physical work in both cases.

## Fresh no-AWS local preflight receipts

The three ranked local groups were checked against the controlled workspace-data root. These checks read bytes and compare the pinned SHA-256 values only; they do not create sidecars, grant permissions, prompt for TOTP, call AWS, or change ledger credit.

- National: canopy is now remotely verified and must not be revisited. The federal artifact remains local-only and must use a separate federal-only path.
- Current wildfire: `zsh scripts/run-current-wildfire-approved-promotion.sh --preflight` passed all four exact local payloads (24,783,566 bytes total) by pinned SHA-256. It made no TOTP or AWS call and adds no immutable or production credit.
- Québec current/original: `zsh scripts/run-qc-approved-multipart-promotion.sh --preflight` passed both exact archives (12,399,475,076 and 11,244,667,626 bytes; total 23,644,142,702 bytes) with the preparation's exact payload and manifest keys. No sidecar was written and no remote object/readback exists.
- Québec fourth set: `node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data` passed 61 local payload/evidence files (16,179,014,954 bytes) and the deterministic in-memory manifest (76,127 bytes, SHA-256 `b3d85d1da40d68d79742c77ec418713f2ef968f74845c43e011df274d559616c`). The preparation and IAM checker simultaneously validated all 62 exact keys, including six multipart payloads. No collection manifest was written locally, and no immutable credit was added.

## Remaining categories and blockers

- The four current-wildfire rows remain **0/6 machine-verifiable** and **6/6 attested-only**. Concrete version/checksum bindings, exact-version readback/retention proof, and separate transformation, ingestion, release and production-admission records are missing. Each row retains only 0.75 local credit.
- Four ordinary remote rows have named source-ledger decisions but still need separately evidenced transformation, ingestion, release, and production admission. Harvest and PLVI have their own owner decisions above.
- The two partial rows remain at 0.25 raw credit each. The read-only route exhaustion record [`phase1-partial-source-route-exhaustion.json`](../data/phase1-partial-source-route-exhaustion.json) confirms the exact NBAC agreement/consent blocker and the Alberta/Québec permission and current-2017-artifact blockers. The historical row needs owner review of the exact NBAC agreement and written consent plus the missing artifact. The boundary row needs owner review of the Alberta and Québec requests, written permission, and a stable current Québec 2017 artifact. Neither unsent request is a permission or acquisition.
- All 13 access-blocked rows remain at zero credit. Existing replies and route audits bind the blockers but do not grant rights or provide artifacts. BEC still requires an eligible owner, terms/order resolution, and the implemented TAP layer; Ontario FRI and Term 2 remain request/rights blocked. No identity, contact, source URL, fee choice, order, form submission, or permission is invented.
- The normal archive control exercise is still not integrated. Its legal-hold, unchanged COMPLIANCE-retention, denied exact-version-delete, and recovery-replica readbacks are an operational gate and do not change the row score.
- Every row still requires its own transformation, ingestion, release, and production-admission evidence. `productionEligible` remains false for all 31 rows.

The current-wildfire records supply placeholder-only attestations without concrete provider identifiers or checksum values. The canonical baseline is **14.25/31 (38.7903226%)**, with **7 remote / 9 local / 2 partial / 13 access-blocked** rows, **7 immutable rows**, **0/31 production admission**, and a **0/6 machine-verifiable current-wildfire gate**; exact-version proof and downstream admission remain blocked.
