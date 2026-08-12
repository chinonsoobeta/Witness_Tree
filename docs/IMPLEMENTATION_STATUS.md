# Implementation status

**Status: 40% complete — technical-preview foundation, not a completed public-data product.**

The delivered work is deliberately stronger in policy, rendering, contracts, and automated checks than in data acquisition and operations. Most visible product surfaces use labelled illustrative fixtures; no verified national or provincial dataset, production geography archive, managed account store, outbound alert sender, or authoritative live wildfire feed has been connected. The unbuilt work is therefore the dependency-heavy part of the approved programme, rather than cosmetic finishing work.

## Authoritative references and identity

| Item | Source |
| --- | --- |
| Approved build specification | `/Users/chinonsoobeta/Documents/Codex/2026-08-11/realtime-voice-chat/outputs/Witness Tree Implementation Plan.docx` (edited 2026-08-11 19:55:45 PDT) |
| Checked-in plan copy | [`docs/specification/Witness Tree Implementation Plan.docx`](specification/Witness%20Tree%20Implementation%20Plan.docx) |
| Non-normative visual reference | `/Users/chinonsoobeta/Documents/Codex/2026-08-11/realtime-voice-chat/outputs/Witness Tree - Front-End Visual Reference.html` (edited 2026-08-11 20:09:04 PDT) |
| Project root | `/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree` |
| Repository | [github.com/chinonsoobeta/Witness_Tree](https://github.com/chinonsoobeta/Witness_Tree) |
| Public technical preview | [witness-tree-canada.r7bv67rgkk.chatgpt.site](https://witness-tree-canada.r7bv67rgkk.chatgpt.site) |
| Product-name token | `lib/domain/brand.ts` → `PRODUCT_NAME` |

The plan is normative. The visual reference may guide layout, spacing, and component anatomy only; it cannot alter claims, scope, data policy, or the bilingual public wording governed by the plan.

`Witness Tree` / `Arbre témoin` is the current working name. `Mistik` is requested, not granted. Keep the name centralised in `PRODUCT_NAME`, out of durable identifiers and URLs, and run `npm run check:brand-token` after any wording work.

## Non-negotiable implementation rules

- Treat every fixture, example ledger entry, sample archive, release, wildfire snapshot, and account status as example-only unless a verified source and its approvals are actually present.
- Render insufficient evidence as `Unknown` with an em dash and a reason. Do not substitute `0`, including in summaries, exports, tables, or tests.
- Retain evidence class, visible provenance, confidence rule/reason, coverage, source licence, version, time range, denominator, boundary edition, and limitation with a published value.
- BC Sans is installed as `@bcgov/bc-sans` and imported once at the root through `@bcgov/bc-sans/css/BC_Sans.css`. It is the primary UI/body/heading family with documented fallbacks. Keep the SIL Open Font License 1.1 and Apache-2.0 notices in [`docs/THIRD_PARTY.md`](THIRD_PARTY.md).
- Prefer a small server-rendered and typed solution over speculative infrastructure. Do not add dependencies, background jobs, persistence, real feeds, or data claims merely to resemble the visual reference.
- Preserve English/French parity and semantic no-JS equivalents for map/chart interactions.

## Verified local commands

Run from the project root. These are the current scripts recorded in `package.json`; run the focused suite for the changed area first, then the release-oriented set before handoff.

```sh
npm run test:unit
npm run typecheck
npm run lint
npm run check:bilingual
npm run check:source-candidates
npm run check:acquisition-readiness
npm run check:claims
npm run check:style-tokens
npm run check:brand-token
npm run check:accessibility
npm run build
npm run check:budgets
npm test
git diff --check
git status --short
```

`npm test` builds and then runs rendered-HTML checks. The budget gate measures Vinext build artifacts; it is not a substitute for browser/LCP/network measurement. Do not call a check passed if it did not run or if another concurrent edit made its result stale.

## Completed, audited technical capability

The following are accepted foundations, primarily with illustrative fixtures and pure validation/policy logic. Details and audit cycles are in [`docs/AUDIT_LOG.md`](AUDIT_LOG.md).

- Bilingual shared shell, navigation, policy gallery, methodology/data/governance pages, accessible static place/location/search routes, and responsive semantic markup.
- Strict Figure/Unknown reporting components; exact evidence word-and-shape mapping; required coverage, provenance, and generated confidence reasons.
- Bilingual fixtures across eight place types and four provinces, location histories, annual chart/table alternatives, source/citation/download metadata, search aliases, compare and Explore route foundations.
- Source ledger, source/release/download, archive-manifest, normalized-record, ingestion, matching/precedence, coverage, fire-impact, and corrections contracts with negative tests.
- Illustration-only wildfire snapshot/refresh policy and public status surfaces; account/alert policy and evaluator without managed storage or delivery.
- Bilingual/static accessibility, claim-language, raw-colour, brand-token, and artifact-budget gates wired into CI; BC Sans integration and third-party notice.
- A client MapLibre/PMTiles Explore foundation with illustrative points and server-rendered List/Table equivalents. No verified PMTiles archive or live operational map is claimed.

## Remaining work, in dependency order

### Phase 0 — approvals and foundational decisions

1. Close the name-request, legal, licence, privacy/security, translation, engagement, accessibility, editorial, and technical signoffs listed below. These are not code tasks.
2. Confirm real source selection, redistribution rights, attribution, retention, and the operational owners before replacing any fixture.
3. Establish production environment controls, Canadian data residency/secret handling where required, and an approved operational runbook.

### Phase 1 — source acquisition and lineage

1. Resolve the owner decisions in [`docs/ACQUISITION_DECISION.md`](ACQUISITION_DECISION.md). Current read-only preflight has confirmed at least 72,325,455,437 compressed bytes across four candidate artifacts; Ontario FRI still lacks a verified downloadable data endpoint.
2. Replace illustrative ledger entries with verified sources, actual licences, versions, retrieval timestamps, and attributable publisher metadata.
3. Acquire lawful immutable raw snapshots using the archive contract; put real objects in approved storage and retain checksums/previous links.
4. Create a source-review process for updates, corrections, licence changes, and reprocessing. Do not fabricate a successful acquisition or current coverage.

### Phase 2 — national baseline processing (1984–present)

1. Obtain and validate NTEMS annual forest/change products, the Canada forest definition inputs, CA Forest Harvest and authoritative boundaries.
2. Build the actual forest mask, versioned boundary intersections, normalized event store, matching/precedence logic, aggregates, and lineage queries.
3. Validate against independent records, publish coverage/error limits, and produce real downloadable/citable releases. This requires real data, reviewed methods, and compute/storage choices.

### Phase 3/4 — public records and provincial enhancement

1. Replace place, location, comparison, and Explore fixtures only once Phase 2 data is auditable.
2. Add BC and Quebec enhanced records, then Alberta and Ontario, with sub-provincial coverage logic (including Quebec north of 52°) and reviewed source licences.
3. Generate real map tiles/downloads and verify server/client budgets, table equivalents, bilingual copy, and release citations from produced data.

### Phases 5–7 — operational features and geographies

1. Connect approved wildfire sources on the documented four-times-daily schedule, with retries, freshness/failure handling, emergency agency links, and source terms.
2. Implement real account persistence, authentication, consent, unsubscribe, rate/abuse controls, Canadian storage, and approved outbound alert delivery. The current account/alert code is policy/status only.
3. Validate official reserve/treaty data, establish right-of-reply and correction operations, then complete real riding comparison and geospatial Explore coverage. Asserted traditional territories remain out of scope unless separately approved.

### Phases 8–9 — release and ongoing operation

1. Run moderated English and French usability tests, independent-data validation, browser/assistive-technology testing, and production incident/correction drills.
2. Obtain launch signoff, publish a real source ledger/release, run public beta, and operate correction, source-update, wildfire, and alert obligations. Local green checks alone do not meet these exit criteria.

## External gates that code cannot close

All remain unconfirmed in [`docs/EXTERNAL_GATES.md`](EXTERNAL_GATES.md):

- legal review of dataset terms, attribution, privacy, security, and public claims;
- SOPFEU terms/reuse confirmation for wildfire data;
- written permission or rejection for the `Mistik` name request;
- Indigenous engagement, right-of-reply, and correction contacts for reserve/treaty pages;
- professional English/French translation and editorial review;
- independent WCAG 2.2 AA / EN 301 549 accessibility audit;
- provincial data-owner review, release/citation approval, and independent validation;
- final editorial and technical production-release signoff.

These gates must be recorded truthfully when they close. A component, validator, fixture, test, or public URL cannot stand in for them.

## Safe Sites and GitHub workflow

Sites configuration is intentionally minimal in `.openai/hosting.json`; use `npm run dev` for local work and `npm run build` before a preview/deploy handoff. The public preview is a technical preview, not proof of source/data readiness. Do not place secrets, credentials, source-download tokens, personal data, or production configuration in repository files, fixtures, tests, rendered text, Git history, or the Sites configuration. Do not commit `.dev.vars`.

The configured Git remote is `origin` → `https://github.com/chinonsoobeta/Witness_Tree.git`. `main` is protected: changes must use a branch and pull request, pass the required `verify` status, resolve conversations, preserve linear history, and must not force-push or delete `main`. Before pushing, inspect `git status --short`, `git diff --check`, the exact staged diff, and the applicable checks. Keep commits bounded and auditable. Do not push a claimed production-data release, a licence assertion, or an external-gate closure without written evidence and the responsible approval.

## Delegation and handoff

Plan section 20 requires Codex to delegate implementation units to **GPT-5.6 Terra at medium reasoning** and to conduct a primary audit after every delegation. Keep each unit narrow, state its allowed files and acceptance tests, inspect the resulting diff, rerun relevant checks, and record the verdict in [`docs/AUDIT_LOG.md`](AUDIT_LOG.md). Failed audits remain failures until corrected and re-audited.

Before ending a task, leave the tree clean or clearly identify intentional local changes. Never reset, discard, or overwrite another worker's changes. Record what ran, the exact result, what did not run, and any remaining external dependency.
