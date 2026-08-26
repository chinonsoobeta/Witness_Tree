# Phase 1 remaining-action audit

This is the current machine-checked remaining-action audit reconciled through Phase 1 evidence head `9bf5baa2ecc51ce4c039531e798bfb6418e3baaf`. The machine record is [`data/phase1-remaining-actions-audit.json`](../data/phase1-remaining-actions-audit.json), and its checker is [`scripts/check-phase1-remaining-actions-audit.mjs`](../scripts/check-phase1-remaining-actions-audit.mjs). The exact local processing boundary for the two remotely archived NRCan cover rows is recorded separately in [`PHASE1_NRCAN_COVER_PROCESSING_GATE.md`](PHASE1_NRCAN_COVER_PROCESSING_GATE.md); it adds no score or downstream admission.

The audit selects every production row where immutable remote proof is absent **or** production admission is absent. That is all 31 rows: 15 lack immutable remote proof, and all 31 remain non-admitted and non-eligible. The current evidence-tracking baseline is **16.5/31 raw credits and 40.9677419%**. This is raw tracking, not a readiness, production, or Phase 1-exit percentage; formal Phase 1 remains **2/4** and the core ledger remains **0/22 admitted**.

Run the check with:

```sh
npm run check:phase1-remaining-actions-audit
```

## Local implementation audit

The machine record now classifies all 13 remaining actions by requirement: archive and recovery preflights, profiles and validators, existing local transformations and derived outputs, owner/external boundaries, and the production-admission boundary. The local paths are complete for the evidence that exists. They remain deliberately non-admitting:

- Federal recovery is raw-only; Québec fourth-inventory primary archive readback is complete while recovery remains separate. The current-wildfire primary archive record now binds four raw pairs and two derived payload/manifest pairs to exact versions and COMPLIANCE retention. Recovery replicas and all transformation, ingestion, release, and production gates remain separate.
- Alberta AVI repair/quarantine, Alberta PLVI closed-join validation, and Québec historical-wildfire lossless-copy evidence are locally checked outputs. They do not authorize downstream ingestion or release.
- NTEMS processing remains blocked because no Phase 1 production-admission target transformation specification and checksum-bound output exists. The separately approved Phase 2 nonproduction method does not close or imply those Phase 1 gates.
- Partial and access-blocked rows have route-exhaustion, outreach, and rights validators, but no local implementation can manufacture a publisher artifact, permission, owner decision, or external reply.

The local audit reports zero immediate raw-credit or formal-score delta. The remaining seven gap groups require owner input or external evidence; production admission and eligibility remain false for all 31 rows.

## Exact next five owner/delegate actions

The ranking gives lawful immediacy priority to safe local preflight or a decision that can be made from existing evidence without an external reply. The score column is the maximum possible raw-credit and formal-score increase if every later gate also succeeds; the immediate increase is zero for every action.

| Rank | Action | Rows / deduplicated artifacts | What can happen now | Prerequisites | Maximum score impact |
| ---: | --- | --- | --- | --- | ---: |
| 1 | Federal-only archive promotion | One local federal ZIP shared by two rows | Exact approval and single-descriptor local-only preflight are recorded; canonical readiness remains blocked, the required twelve-file unmodified raw live-IAM inventory is absent, and external execution is intentionally not implemented. The bounded released lock marker requires explicit owner cleanup before another run. | Separately review canonical owner-readiness evidence, the complete role/user inline-and-attached policy inventory, raw-response digest bundle and derived summary, exact positive/negative simulations, and a future descriptor-bound execution implementation; recovery authorization/proof remains a distinct gate before any credit claim. | +0.50 raw; +0.483871 percentage points |
| 2 | Québec current/original transformation and ingestion scope | Two remotely archived Québec rows | Exact immutable evidence is integrated; no downstream output or admission is implied. | Record the exact transformation scope, validate checksum-bound outputs, then decide ingestion, release, and production admission separately. | +0 raw; +0 points |
| 3 | Québec fourth-inventory downstream decisions | One logical product with **62 exact archive keys / 1 row** | Independent redacted exact-version/COMPLIANCE readback is complete. | Retain recovery proof separately; record transformation, ingestion, release, and admission decisions separately. | +0 raw; +0 percentage points |
| 4 | NRCan harvest/canopy downstream method | Two archived rows with recorded source-ledger decisions | Local source/profile validation is complete; no target output is authorized. | Owner names the transformation method and ingestion scope, then separate release and production decisions. | +0 raw; +0 points |
| 5 | Alberta PLVI transformation and ingestion | One archived raw/derived pair with recorded scope | Count, geometry, checksum, duplicate and no-loss validation are complete; ordered-schema ingestion preflight is blocked by two renamed fields and 23 integer type widenings. | Produce a corrected checksum-bound output or explicitly decide the field mapping, then separately admit transformation and ingestion; release and production decisions remain later gates. | +0 raw; +0 points |

The national federal ZIP is one artifact shared by two ledger rows, and the Québec fourth-inventory product's 62 keys are one product rather than 62 credits. The audit rejects duplicate physical work in both cases.

## Fresh no-AWS local preflight receipts

The three ranked local groups were checked against the controlled workspace-data root. These checks read bytes and compare the pinned SHA-256 values only; they do not create sidecars, grant permissions, prompt for TOTP, call AWS, or change ledger credit.

- National: canopy is now remotely verified and must not be revisited. The federal artifact remains local-only and must use a separate federal-only path.
- Current wildfire: `zsh scripts/run-current-wildfire-approved-promotion.sh --preflight` passed all four exact local payloads (24,783,566 bytes total) by pinned SHA-256. It made no TOTP or AWS call and adds no immutable or production credit.
- Québec current/original: the validated redacted immutable attestation is integrated for both exact archives. Their staging profiles remain local-artifact evidence, while the ledger separately records immutable remote evidence. Transformation, ingestion, release, and production admission remain pending.
- Québec fourth set: the completed 62-object promotion has independent redacted exact-version readback binding plan byte lengths, all checksum values/types, and 62 `COMPLIANCE` retentions through `2033-08-12T00:00:00Z`. The six multipart payloads are represented by `COMPOSITE` checksums and the other 56 objects by `FULL_OBJECT` checksums. This is one raw-archive ledger credit only; recovery and all downstream admission decisions remain separate.

## Remaining categories and blockers

- The four current-wildfire rows have **6/6 primary payloads machine-verifiably archived** (four raw plus two derived); the recovery-replica proof remains separate. Each row has raw archive credit only, not transformation, ingestion, release, admission, or production eligibility.
- Four ordinary remote rows have named source-ledger decisions but still need separately evidenced transformation, ingestion, release, and production admission. Harvest and PLVI have their own owner decisions above.
- The two partial rows remain at 0.25 raw credit each. The read-only route exhaustion record [`phase1-partial-source-route-exhaustion.json`](../data/phase1-partial-source-route-exhaustion.json) confirms the exact NBAC agreement/consent blocker and the Alberta/Québec permission and current-2017-artifact blockers. The historical row needs owner review of the exact NBAC agreement and written consent plus the missing artifact. The boundary row needs owner review of the Alberta and Québec requests, written permission, and a stable current Québec 2017 artifact. Neither unsent request is a permission or acquisition.
- All 13 access-blocked rows remain at zero credit. Existing replies and route audits bind the blockers but do not grant rights or provide artifacts. BEC still requires an eligible owner, terms/order resolution, and the implemented TAP layer; Ontario FRI and Term 2 remain request/rights blocked. No identity, contact, source URL, fee choice, order, form submission, or permission is invented.
- The normal archive control exercise is complete redacted operational evidence: legal-hold ON/OFF, unchanged COMPLIANCE retention, denied exact-version delete, and authorized recovery-replica readback all passed. It changes no source row score, admission, or production state.
- Every row still requires its own transformation, ingestion, release, and production-admission evidence. `productionEligible` remains false for all 31 rows.

The canonical baseline is **16.5/31 (40.9677419%)**, with **16 remote / 0 local / 2 partial / 13 access-blocked** rows, **16 immutable rows**, **0/31 production admission**, and a **6/6 primary current-wildfire archive gate**. Québec’s 62 exact objects have independent redacted readback; this remains raw archive evidence only. The formal Phase 1 exit is **2/4**, core production admission is **0/22**, recovery proof is separate, and downstream admission remains blocked.
