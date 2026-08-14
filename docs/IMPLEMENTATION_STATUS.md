# Implementation status

**Status: 45% complete — technical-preview foundation with verified staged source archives, guarded boundary/raster validation, and one verified lossless local transformation, not a completed public-data product.**

The delivered work is deliberately stronger in policy, rendering, contracts, and automated checks than in data acquisition and operations. The Québec historical-fire, Alberta AVI, and NRCan 2022 forest canopy cover ZIPs now have 10,925,681,632 verified local-staging bytes, ZIP integrity, and SHA-256 evidence, and the two geospatial vector archives also have read-only schema/geometry profiles. Québec attribution is metadata-verified, and its two clean layers have a checksum-bound, verified 1,017,495,552-byte lossless local copy. Alberta attribution is now metadata-verified against the version 2.2 default statement of the Open Government Licence – Alberta, and a deterministic repair-or-quarantine run over 792,443 features left 791,835 unchanged, repaired 607 of the 608 invalid geometries, and quarantined 1; Alberta is admitted to transformation design only, is not admitted to ingestion, and is not production eligible. Pure transformation-admission and immutable-promotion contracts prevent the remaining gaps from being bypassed. All three archives are now promoted to immutable object storage: each payload object version sits at its canonical snapshot key in the Canadian bucket, is byte- and checksum-verified against its staging record, and is locked under compliance-mode Object Lock retention until 2033-08-12. The evidence is in [`data/immutable-promotions.json`](../data/immutable-promotions.json), and `tests/archive-staging-promotions.test.ts` runs the real promotion gate over it. Promotion is a storage fact only. No source has been ingested, transformed beyond the recorded local runs, or connected to product records, and none is production eligible. Most visible product surfaces still use labelled illustrative fixtures; no production geography archive, managed account store, outbound alert sender, or authoritative live wildfire feed has been connected.

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
npm run check:staged-acquisitions
npm run check:staged-geospatial-profile
npm run check:immutable-promotions
npm run check:boundary-editions
npm run check:elections-canada-fed-2025
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
- Real-staging admission contracts bind exact source checksums, attribution and geometry profiles. Québec and Alberta are both admitted to transformation design only; neither is admitted to ingestion. A provider-neutral immutable-promotion contract requires Canadian-region, remote checksum, provider-version and active compliance-retention evidence before `remote-verified` is valid.
- Illustration-only wildfire snapshot/refresh policy and public status surfaces; account/alert policy and evaluator without managed storage or delivery.
- Bilingual/static accessibility, claim-language, raw-colour, brand-token, and artifact-budget gates wired into CI; BC Sans integration and third-party notice.
- A client MapLibre/PMTiles Explore foundation with illustrative points and server-rendered List/Table equivalents. No verified PMTiles archive or live operational map is claimed.

## Remaining work, in dependency order

### Phase 0 — approvals and foundational decisions

1. Close the name-request, legal, licence, privacy/security, translation, engagement, accessibility, editorial, and technical signoffs listed below. These are not code tasks.
2. Confirm real source selection, redistribution rights, attribution, retention, and the operational owners before replacing any fixture.
3. Establish production environment controls, Canadian data residency/secret handling where required, and an approved operational runbook.

### Phase 1 — source acquisition and lineage

1. Resolve the owner decisions in [`docs/ACQUISITION_DECISION.md`](ACQUISITION_DECISION.md). Current read-only preflight has confirmed at least 92,627,415,442 compressed bytes across six candidate artifacts. Ontario FRI remains a genuine blocker: no open bulk endpoint exists, access runs through a request form and a ministry science email address, and an Electronic Intellectual Property notice attaches instead of the Ontario open licence, which needs legal review. The CA Forest Harvest catalogue resource-name/URL conflict is resolved: the harvest and wildfire ZIPs are distinct archives, proven by reading their internal ZIP members, and the wildfire product that the bad link hid is now recorded separately. The publisher has still not corrected the resource URL on its own record.
2. Replace illustrative ledger entries with verified sources, actual licences, versions, retrieval timestamps, and attributable publisher metadata.
3. Acquire lawful immutable raw snapshots using the archive contract; put real objects in approved storage and retain checksums/previous links.
4. Create a source-review process for updates, corrections, licence changes, and reprocessing. Do not fabricate a successful acquisition or current coverage.

### Phase 2 — national baseline processing (1984–2022)

1. Obtain and validate NTEMS annual forest/change products, the Canada forest definition inputs, CA Forest Harvest and authoritative boundaries. Boundaries are partly started: [`data/boundary-editions.json`](../data/boundary-editions.json) records five staged archives totalling 578,421,880 bytes — Statistics Canada 2021 Census province/territory, census division, census subdivision, and federal electoral district (2013 Representation Order) cartographic boundary files, plus the Elections Canada 2023 Representation Order federal electoral districts. Each entry carries its catalogue and file URL, edition, licence, required attribution, byte length, SHA-256, feature count, `unzip -t` result, and `productionEligible: false`, gated by `npm run check:boundary-editions`. What is verified is transport and container only: byte length equals the preflight `Content-Length`, SHA-256 recorded, `unzip -t` passes. `gdalinfo` is NOT installed, so geometry, CRS, and attribute schema are `Unknown` — no vector content was opened. Feature counts were derived from each shapefile's `.shx` index (100-byte header, 8 bytes per record), not by reading geometry. None of these has been ingested, promoted to object storage, or connected to product records. Two separate licences apply and both attributions are required: the Statistics Canada Open Licence, whose version is `Unknown` — the published text carries no version number — and the Open Government Licence – Canada version 2.0 for the Elections Canada product. French-language editions of the Statistics Canada files are not staged and the bilingual app will need them. Statistics Canada publishes no 2023 Representation Order boundary file, so the current-order geometry has to come from Elections Canada. `lib/boundaries/` makes the resulting vintage hazard a compile-time failure: 2021 census attributes on the 338-riding 2013 basis cannot be joined to 343-riding 2023 geometry.
2. Geospatial validation of the staged archives has now been run with real GDAL reads, and its result is recorded in [`data/raster-grid.json`](../data/raster-grid.json) and [`data/raster-defects.json`](../data/raster-defects.json), gated by `npm run check:raster-grid`.

   **What is now validated.** GDAL 3.13.2 / PROJ 9.8.1 / GEOS 3.14.1 opened all 39 staged NTEMS VLCE2 annual land cover years read-only over the `/vsizip` virtual filesystem, with zero GDAL errors and no archive extracted or modified. All 39 years share one coordinate reference system, one geotransform `(-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0)`, and one raster size of 193,936 × 128,340 cells, single Byte band, nodata 255, pixel size exactly 30 m — so the series is pixel aligned end to end. The projected CRS carries no EPSG code of its own, so the full WKT is recorded and no authority code is asserted. The temporal coverage of the staged series is **1984–2022**; NTEMS ends at 2022 and coverage after 2022 is `Unknown`. The 13-class VLCE2 scheme is recorded with English and French labels. The five boundary feature counts previously derived from `.shx` index arithmetic — 343, 338, 13, 293, 5161 — were confirmed by real OGR reads. The Statistics Canada and Elections Canada boundary CRSs were proven identical by PROJ (`IsSame` true, zero displacement on round-tripped test points); only the name string differs. The raster CRS and the boundary CRS are *not* the same, and differ by roughly 6,000 km. `lib/grid/` turns the three resulting hazards into failures rather than warnings: a vector layer cannot be intersected with the raster unless it declares it has been reprojected onto the raster grid CRS, and the reverse direction — warping the categorical raster into the boundary CRS — has no representable value, because resampling class codes fabricates classes that are not in the source; a class list or per-class area for 1991 or 2005 taken from the `.vat.dbf` sidecar returns `Unknown` with a reason rather than `0`; and a year whose CRS, geotransform, or dimensions differ from the canonical grid cannot enter a change comparison.

   **The one deviation found.** The 1991 and 2005 archives ship an empty raster attribute table: a 98-byte header-only `.tif.vat.dbf` holding 0 records, against 488 bytes and 13 records in every other year. Their pixels were checked and are sound — both years carry all 13 documented classes and match the canonical grid exactly — so this is a sidecar defect, not a data defect, and it is an upstream packaging problem in the published archives. Any class statistic for those two years taken from the sidecar is `Unknown` with a reason; `0` would read as "no forest of that class existed in 1991", which is a false public claim.

   **What is NOT validated.** `gdalinfo -stats` was never run on any year, so class checking used the publisher-supplied attribute table plus the coarsest built-in overview — a decimated sample of roughly 1 cell in 261,000. A rare out-of-scheme pixel at full resolution would not have been caught. `ogrinfo -so` reads headers only, so **no geometry validity check has been run on any vector**: self-intersections, ring order, null or empty geometries, duplicate identifiers, and topological gaps or overlaps between adjacent polygons are all `Unknown`. **No reprojection and no intersection has actually been executed** — only the CRS difference was established, so whether the boundary polygons fall inside the raster footprint is `Unknown`. The full-resolution class distribution of 1991 and 2005 is `Unknown`. The `data/boundary-editions.json` notice still states that `gdalinfo` is not installed, which was true when that record was written and before this validation run; the OGR reads above confirm every count that record enforces. Nothing described here has been ingested, converted, promoted to object storage, or connected to product records, and nothing is production eligible.
3. Build the actual forest mask, versioned boundary intersections, normalized event store, matching/precedence logic, aggregates, and lineage queries.
4. Validate against independent records, publish coverage/error limits, and produce real downloadable/citable releases. This requires real data, reviewed methods, and compute/storage choices.

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
