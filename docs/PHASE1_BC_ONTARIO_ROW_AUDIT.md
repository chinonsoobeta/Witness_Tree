# Phase 1 BC/ON row audit

The machine-checked record [`data/phase1-bc-ontario-row-audit.json`](../data/phase1-bc-ontario-row-audit.json) reconciles all eleven BC/ON production rows from the canonical ledger at `4466a14` (`4466a14dd1462d09692db869523df713a6db2291`). It joins the existing geometry, archive, route, access, reply and permission records without acquiring a new artifact or changing an admission decision.

The canonical Phase 1 baseline is unchanged:

- historical-at-the-time **14.25/31 raw-evidence credits** and **38.7903226%** bounded evidence-tracking score;
- **7 remote / 9 local / 2 partial / 13 access-blocked** rows;
- historical-at-the-time **7 immutable archive proofs**, **0/31 production-admission proofs**, and **0/31 production-eligible rows**;
- current-wildfire gate **0/6 machine-verifiable**, **6/6 attested-only**, with exact-version proof and downstream admission blocked;
- BC/ON scope: **2.25 raw credits**, **0 raw-credit change**, and **0 production/admission change**.

Run the check with:

```sh
npm run check:phase1-bc-ontario-row-audit
```

## Reconciled rows

| Rows | Current state | Evidence-backed finding | Immediate blocker | Current raw-credit change |
| --- | --- | --- | ---: | ---: |
| `bc-wildfire`, `on-fire-disturbance` | Local-verified, profiled | Raw and derived payloads are locally checksum-bound, but archive records omit concrete version identifiers and use placeholder checksum values. | Machine-verifiable immutable proof plus transformation, ingestion, release and production-admission records | 0.25 each |
| `bc-fta-cutblocks`, `bc-harvesting-authorities` | Access-blocked | OGL-BC service routes are mutable or custom-order; the FOI reply supplied a route, not a coherent export. | Publisher-bounded export with edition, checksum, profile and lifecycle review | 0 |
| `bc-vri`, `bc-forest-operations-map` | Access-blocked | VRI remains Access Only and unsubmitted with its advertised current artifact unavailable. The FOM-only form and clarification reply are submitted, but grant no permission or authorized access. | Written permission, authorized access, and a complete exact artifact | 0 |
| `bc-consolidated-cutblocks` | Access-blocked | A public ZIP is still Access Only; the FAIB reply clarified output details but granted no rights. | Written FAIB authorization or redistributable licence | 0 |
| `bc-old-growth-bec` | Access-blocked | Public BEC routes are incomplete/unversioned; the custom order is blocked before submission by owner eligibility, email and Terms; the implemented TAP layer is unresolved. | Owner-authorized order/terms path plus TAP source and rights | 0 |
| `on-fri`, `on-fri-term-2` | Access-blocked | Term 2 exposes mutable WEB explorers and pilot/index material, not a complete package; the catalogue reply supplied no package or rights decision. | Complete FMU package/API, checksum/profile and written intended-use confirmation | 0 |
| `provincial-electoral-boundaries` | Partial-component (0.25) | BC and Ontario are locally checksum-bound/profiled. Alberta and Québec remain unacquired; permission/current-edition gates remain unresolved. | Owner-approved Alberta/Québec requests, permissions and missing artifacts | 0 |

The conditional maximum raw-credit increase for the six BC access rows, two Ontario FRI rows and the missing boundary components is **+8.75**; it is not current credit and does not affect production eligibility. Each wildfire row can gain 0.25 only after durable machine-verifiable archive proof. Their gate is 0/6 verified and transformation, ingestion, release and production admission remain blocked.

The audit records no permission, archive mutation, external reply resolution, transformation, ingestion, release or production admission. It retains no owner contact details. The FOM-only copyright route was submitted and clarified outside this audit; VRI/TAP remain unsubmitted, and the BEC route remains unsubmitted.
