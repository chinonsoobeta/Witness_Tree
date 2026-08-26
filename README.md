# Witness Tree / Arbre témoin

Witness Tree is a bilingual public record of documented and satellite-observed forest change in British Columbia, Alberta, Ontario, and Quebec. It is being built from the [implementation plan](docs/specification/Witness%20Tree%20Implementation%20Plan.docx).

Public technical preview: [witness-tree-canada.r7bv67rgkk.chatgpt.site](https://witness-tree-canada.r7bv67rgkk.chatgpt.site)

This repository currently delivers the audited technical foundation and a public preview. Its source ledger is explicitly illustrative: no real provincial or national dataset has yet been ingested. The current data end year is therefore **unknown**, not zero.

## What exists

- English and French public routes for methods, data, places, location records, wildfire context, riding comparison, and governance disclosures
- enforced `Figure` versus `Unknown` reporting types
- visible evidence, confidence, coverage, and provenance components
- forest definition and denominator policy
- spatial/temporal matching and hectare-year precedence rules
- immutable wildfire snapshot workflow with Vancouver DST gating and retry/degraded/stale states
- strict example source ledger and versioned release manifests
- privacy-safe alert/digest domain policy (no outbound delivery yet)
- CI gates for types, lint, bilingual parity, tests, and build
- delegated-unit [audit log](docs/AUDIT_LOG.md) and [external gates](docs/EXTERNAL_GATES.md)
- preliminary [name and domain screen](docs/NAME_CLEARANCE.md)

## Important nonclaims

Witness Tree does not estimate merchantable timber, predict wildfire spread, label detected change as logging or deforestation, make legal or compliance findings, or infer responsibility from proximity. An absent integrated record is shown as Unknown and never as numeric zero.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/en` or `http://localhost:3000/fr`.

## Verify

```bash
npm run typecheck
npm run lint
npm run check:bilingual
npm run check:archive-operations-readiness
npm run test:unit
npm test
```

`npm test` performs a production build and rendered-route smoke test. CI runs every gate on pushes and pull requests.

## Data and licences

Every future production input must have a source-ledger entry with publisher/custodian, exact catalogue URL, effective and retrieval dates, spatial and temporal coverage, immutable SHA-256, update cadence, transform version, attribution, and a typed licence ID. The present [`data/source-ledger.json`](data/source-ledger.json) uses reserved `example.local` URLs and placeholder hashes solely to test that contract.

Code is currently distributed under an [all-rights-reserved notice](LICENSE), not an open-source licence. [DATA_LICENSES.md](DATA_LICENSES.md) records the example fixtures and the clearance required before real data is distributed. Data retains its source-specific licence; no example fixture grants redistribution rights. Licence review, real-source approval, professional translation, engagement, accessibility review, and other launch gates remain listed in [docs/EXTERNAL_GATES.md](docs/EXTERNAL_GATES.md).

## Status

This is an early technical release, not the completed 53-week public-data program. See the implementation plan and external-gates record before interpreting it as production-ready.
