# Phase 1 remaining-action audit

This is the fresh, machine-checked remaining-action audit derived from the authoritative Phase 1 convergence records at `650a7da` on 2026-08-20. The machine record is [`data/phase1-remaining-actions-audit.json`](../data/phase1-remaining-actions-audit.json), and its checker is [`scripts/check-phase1-remaining-actions-audit.mjs`](../scripts/check-phase1-remaining-actions-audit.mjs).

The audit selects every production row where immutable remote proof is absent **or** production admission is absent. That is all 31 rows: 21 lack immutable remote proof, and all 31 remain non-admitted and non-eligible. The current evidence-tracking baseline is **15/31 raw credits and 39.516129%**. This percentage is not a readiness or production percentage. The audit does not add credit for a prepared payload, dry run, owner-local resume state, reply, permission request, owner decision, or archive plan.

Run the check with:

```sh
npm run check:phase1-remaining-actions-audit
```

## Exact next five owner/delegate actions

The ranking gives lawful immediacy priority to safe local preflight or a decision that can be made from existing evidence without an external reply. The score column is the maximum possible raw-credit and formal-score increase if every later gate also succeeds; the immediate increase is zero for every action.

| Rank | Action | Rows / deduplicated artifacts | What can happen now | Prerequisites | Maximum score impact |
| ---: | --- | --- | --- | --- | ---: |
| 1 | National canopy readback and federal-only promotion | Canopy height, plus one federal ZIP shared by the two Elections Canada rows; **2 artifacts / 3 rows** | Delegate may inspect the redacted record and run only the no-write local preflight; no canopy upload or completion is authorized. | Owner resolves the unavailable `s3:GetObjectVersion` permission, supplies exact-version/checksum/retention/readbacks for canopy primary and recovery, then separately approves a federal-only path that does not revisit harvest or canopy. | +0.75 raw; +0.7258065 percentage points |
| 2 | Québec current/original archive preflight and owner promotion | Two Québec payloads; **2 artifacts / 2 rows** | Delegate may run the no-write local preflight. | Fresh owner approval for exact keys, ca-central-1, sequential multipart execution, COMPLIANCE retention, and exact readbacks. | +0.50 raw; +0.483871 percentage points |
| 3 | Québec fourth-inventory dry run and owner approvals | One logical product with **62 exact archive keys / 1 row** | Delegate may run the local dry run and checksum validation. | Separate approval for exact artifact set, irreversible COMPLIANCE retention, least-privilege IAM, MFA, and readbacks. | +0.25 raw; +0.2419355 percentage points |
| 4 | NRCan harvest owner source-ledger decision | One already archived row | Delegate may prepare the evidence packet; only the owner may record the named decision. | Review the redacted primary/recovery evidence and keep harvest out of any new promotion command. | +0 raw; +0 points |
| 5 | Alberta PLVI owner scope decision | One already archived raw/derived pair | Delegate may present the prepared lineage; only the owner may decide the exact scope. | Decide on the raw ZIP and 179087-feature derived release, all 12 bounded repairs, preserved duplicate `POLYGON_ID 41405`, and downstream uses. | +0 raw; +0 points |

The national federal ZIP is one artifact shared by two ledger rows, and the Québec fourth-inventory product's 62 keys are one product rather than 62 credits. The audit rejects duplicate physical work in both cases.

## Remaining categories and blockers

- The four current-wildfire rows remain at a **4/6** immutable-object gate. A local preflight is available, but the BC and Ontario derived readbacks, owner execution, and exact retention/recovery evidence are missing. Raw score impact is zero because the four rows already have raw credit.
- Four ordinary remote rows have named source-ledger decisions but still need separately evidenced transformation, ingestion, release, and production admission. Harvest and PLVI have their own owner decisions above.
- The two partial rows remain at 0.25 raw credit each. The read-only route exhaustion record [`phase1-partial-source-route-exhaustion.json`](../data/phase1-partial-source-route-exhaustion.json) confirms the exact NBAC agreement/consent blocker and the Alberta/Québec permission and current-2017-artifact blockers. The historical row needs owner review of the exact NBAC agreement and written consent plus the missing artifact. The boundary row needs owner review of the Alberta and Québec requests, written permission, and a stable current Québec 2017 artifact. Neither unsent request is a permission or acquisition.
- All 13 access-blocked rows remain at zero credit. Existing replies and route audits bind the blockers but do not grant rights or provide artifacts. BEC still requires an eligible owner, terms/order resolution, and the implemented TAP layer; Ontario FRI and Term 2 remain request/rights blocked. No identity, contact, source URL, fee choice, order, form submission, or permission is invented.
- The normal archive control exercise is still not integrated. Its legal-hold, unchanged COMPLIANCE-retention, denied exact-version-delete, and recovery-replica readbacks are an operational gate and do not change the row score.
- Every row still requires its own transformation, ingestion, release, and production-admission evidence. `productionEligible` remains false for all 31 rows.

No AWS, email, form, archive mutation, permission grant, Phase 2 action, push, or deployment was performed for this audit. The latest redacted national record confirms canopy MPU completion and exact-byte/`FULL_OBJECT` payload and sidecar heads in primary and recovery, but no private path, contents, upload identifier, provider part identifiers, exact-version readback, or COMPLIANCE-retention readback is copied into this audit; no immutable archive credit is claimed.
