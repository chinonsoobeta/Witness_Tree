# Phase 1 remaining-action audit

This is the current 2026-08-27 reconciliation of the remaining-action audit. The linked machine record [`data/phase1-remaining-actions-audit.json`](../data/phase1-remaining-actions-audit.json) and its checker [`scripts/check-phase1-remaining-actions-audit.mjs`](../scripts/check-phase1-remaining-actions-audit.mjs) are a dated 2026-08-22 historical snapshot derived through Phase 1 evidence head `9bf5baa2ecc51ce4c039531e798bfb6418e3baaf`; their older baseline must not be read as the current ledger state. The exact local processing boundary for the two remotely archived NRCan cover rows is recorded separately in [`PHASE1_NRCAN_COVER_PROCESSING_GATE.md`](PHASE1_NRCAN_COVER_PROCESSING_GATE.md); it adds no score or downstream admission.

The historical audit selected all 31 production rows because, at its 2026-08-22 cutoff, every row lacked immutable remote proof or production admission. Under the same rule, the current ledger selects 29 rows: 15 lack immutable remote proof, and 29 lack production admission. The current evidence-tracking baseline is **17.00/31 raw credits and 41.4516129%**. This is raw tracking, not a readiness, production, or Phase 1-exit percentage; formal Phase 1 remains **2/4 (50%)** and the core ledger remains **2/22 admitted**. Two federal rows are production-admitted and eligible; the other 29 rows remain non-admitted and non-eligible.

Run the check with:

```sh
npm run check:phase1-remaining-actions-audit
```

## Local implementation audit

The dated machine record classifies 13 remaining actions by requirement: archive and recovery preflights, profiles and validators, existing local transformations and derived outputs, owner/external boundaries, and the production-admission boundary. The local paths are complete for the evidence that exists. They remain deliberately non-admitting:

- Federal recovery is raw-only; Québec fourth-inventory primary archive readback is complete while recovery remains separate. The current-wildfire primary archive record now binds four raw pairs and two derived payload/manifest pairs to exact versions and COMPLIANCE retention. Recovery replicas and all transformation, ingestion, release, and production gates remain separate.
- Alberta AVI repair/quarantine, Alberta PLVI closed-join validation, and Québec historical-wildfire lossless-copy evidence are locally checked outputs. They do not authorize downstream ingestion or release.
- The exact NBAC ZIP was acquired on 2026-08-27 under the current official Open Government Licence - Canada metadata. Its 1,257,052,370 bytes have SHA-256 `c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165`; ZIP integrity passed, local profiling found 52,610 polygons, and 49 ring self-intersections were quarantined. The owner authorized acquisition and publication without waiting, and the exact-key IAM delta is applied, but storage is not uploaded. Archive, transformation, ingestion, release, publication, and production admission remain false.
- NTEMS processing remains blocked because no Phase 1 production-admission target transformation specification and checksum-bound output exists. The separately approved Phase 2 nonproduction method does not close or imply those Phase 1 gates.
- The one partial row, `provincial-electoral-boundaries`, remains at 0.25 raw credit. The `cwfis-historical` row is now local-verified-profiled at 0.75 raw credit under the exact locally profiled NBAC and NFDB components; its archive, transformation, ingestion, release, publication, and production gates remain separate. Access-blocked rows still have route-exhaustion, outreach, and rights validators, but no local implementation can manufacture a publisher artifact, permission, owner decision, or external reply.

The local audit reports zero immediate raw-credit or formal-score delta. The remaining seven gap groups require owner input or external evidence; two federal rows are production-admitted and eligible, while the other 29 rows remain non-admitted and non-eligible.

## Exact next five owner/delegate actions

The ranking gives lawful immediacy priority to safe local preflight or a decision that can be made from existing evidence without an external reply. The score column is the maximum possible raw-credit and formal-score increase if every later gate also succeeds; the immediate increase is zero for every action.

| Rank | Action | Rows / deduplicated artifacts | What can happen now | Prerequisites | Maximum score impact |
| ---: | --- | --- | --- | --- | ---: |
| 1 | NBAC exact archive promotion | `cwfis-historical`; one 1,257,052,370-byte ZIP plus its manifest | Owner authorization for acquisition and publication is recorded, the current official OGL Canada metadata and local checksum/profile are bound, and the exact-key IAM delta is applied. Storage is not uploaded, and archive, transformation, ingestion, release, publication, and production admission remain false. | Upload only the exact payload and manifest with fresh owner-controlled execution, verify immutable archive/readback, then separately validate transformation, ingestion, release, publication, and admission. | +0 raw; +0 points |
| 2 | Québec current/original transformation and ingestion scope | Two remotely archived Québec rows | Exact immutable evidence is integrated; no downstream output or admission is implied. | Record the exact transformation scope, validate checksum-bound outputs, then decide ingestion, release, and production admission separately. | +0 raw; +0 points |
| 3 | Québec fourth-inventory downstream decisions | One logical product with **62 exact archive keys / 1 row** | Independent redacted exact-version/COMPLIANCE readback is complete. | Retain recovery proof separately; record transformation, ingestion, release, and admission decisions separately. | +0 raw; +0 percentage points |
| 4 | NRCan harvest/canopy downstream method | Two archived rows with recorded source-ledger decisions | Local source/profile validation is complete; no target output is authorized. | Owner names the transformation method and ingestion scope, then separate release and production decisions. | +0 raw; +0 points |
| 5 | Alberta PLVI transformation and ingestion | One archived raw/derived pair with recorded scope | Count, geometry, checksum, duplicate and no-loss validation are complete; ordered-schema ingestion preflight is blocked by two renamed fields and 23 integer type widenings. | Produce a corrected checksum-bound output or explicitly decide the field mapping, then separately admit transformation and ingestion; release and production decisions remain later gates. | +0 raw; +0 points |

The national federal ZIP is one artifact shared by two now-admitted ledger rows, and the Québec fourth-inventory product's 62 keys are one product rather than 62 credits. The audit rejects duplicate physical work in both cases.

## Fresh no-AWS local preflight receipts

The three ranked local groups were checked against the controlled workspace-data root. These checks read bytes and compare the pinned SHA-256 values only; they do not create sidecars, grant permissions, prompt for TOTP, call AWS, or change ledger credit.

- National: canopy is now remotely verified and must not be revisited. The federal artifact remains local-only and must use a separate federal-only path.
- Current wildfire: `zsh scripts/run-current-wildfire-approved-promotion.sh --preflight` passed all four exact local payloads (24,783,566 bytes total) by pinned SHA-256. It made no TOTP or AWS call and adds no immutable or production credit.
- Québec current/original: the validated redacted immutable attestation is integrated for both exact archives. Their staging profiles remain local-artifact evidence, while the ledger separately records immutable remote evidence. Transformation, ingestion, release, and production admission remain pending.
- Québec fourth set: the completed 62-object promotion has independent redacted exact-version readback binding plan byte lengths, all checksum values/types, and 62 `COMPLIANCE` retentions through `2033-08-12T00:00:00Z`. The six multipart payloads are represented by `COMPOSITE` checksums and the other 56 objects by `FULL_OBJECT` checksums. This is one raw-archive ledger credit only; recovery and all downstream admission decisions remain separate.
- NBAC: the exact ZIP is locally checksum-bound and profiled with passed ZIP integrity, 52,610 polygons, and 49 quarantined ring self-intersections. Owner authorization and exact-key IAM application are recorded, but storage upload has not occurred, so archive, transformation, ingestion, release, publication, and production admission remain false.

## Remaining categories and blockers

- The four current-wildfire rows have **6/6 primary payloads machine-verifiably archived** (four raw plus two derived); the recovery-replica proof remains separate. Each row has raw archive credit only, not transformation, ingestion, release, admission, or production eligibility.
- Four ordinary remote rows have named source-ledger decisions but still need separately evidenced transformation, ingestion, release, and production admission. Harvest and PLVI have their own owner decisions above.
- The one partial row remains at 0.25 raw credit. The read-only route exhaustion record [`phase1-partial-source-route-exhaustion.json`](../data/phase1-partial-source-route-exhaustion.json) remains historical for the former NBAC agreement/consent blocker and continues to cover the Alberta/Québec permission and current-2017-artifact blockers. The NBAC component now has owner authorization and local exact-byte/profile evidence under current official OGL Canada metadata, but its immutable archive and downstream gates remain false. The boundary row still needs owner review of the Alberta and Québec requests, written permission, and a stable current Québec 2017 artifact. Neither unsent request is a permission or acquisition.
- All 13 access-blocked rows remain at zero credit. Existing replies and route audits bind the blockers but do not grant rights or provide artifacts. BEC still requires an eligible owner, terms/order resolution, and the implemented TAP layer; Ontario FRI and Term 2 remain request/rights blocked. No identity, contact, source URL, fee choice, order, form submission, or permission is invented.
- The normal archive control exercise is complete redacted operational evidence: legal-hold ON/OFF, unchanged COMPLIANCE retention, denied exact-version delete, and authorized recovery-replica readback all passed. It changes no source row score, admission, or production state.
- Every non-admitted row still requires its own transformation, ingestion, release, and production-admission evidence. The two federal rows are production-admitted and eligible; the other 29 rows remain non-admitted and non-eligible.

The canonical baseline is **17.00/31 (41.4516129%)**, with **14 remote-verified-archived-profiled, 1 local-verified-profiled (`cwfis-historical`), 1 partial-component, 13 access-blocked, and 2 production-admitted** rows, **16 immutable rows**, **2/31 production admission**, and a **6/6 primary current-wildfire archive gate**. Québec’s 62 exact objects have independent redacted readback; this remains raw archive evidence only. The NBAC ZIP remains local profile evidence only. The formal Phase 1 exit is **2/4 (50%)**, core production admission is **2/22**, recovery proof is separate, and remaining downstream admission is blocked.
