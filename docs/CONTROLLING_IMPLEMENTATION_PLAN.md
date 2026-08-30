WITNESS TREE

Implementation Plan

Version 2.1. Supersedes Forest Observatory, version 1, dated 2026-08-11. Scope amendment approved 2026-08-25.

| Field | Value |
| --- | --- |
| Status | Approved for build. Version 2.1 is the controlling build specification. |
| Product name | Witness Tree. Arbre témoin in French. Working name, see section 1.4. |
| Indigenous name | Mistik, Cree for tree or wood. Requested, not granted. Nothing ships under it without written permission. See section 11.5. |
| Coverage | National baseline for all Canada, including British Columbia, Alberta, Ontario and Quebec. Enhanced provincial detail is added only where cleared sources support it. |
| Record period | 1984 to the latest admitted source year. Public national artifacts use four-year snapshots from 1984 through 2020 plus 2022, with change summarized between adjacent snapshots. |
| Languages | English and French at full parity. Parity is a release gate. |
| Live wildfire | In scope. Four refreshes daily at 05:00, 12:00, 16:00 and 21:00 Pacific. |
| Riding comparison | In scope, including ranked comparison of electoral ridings. |
| Accounts and alerts | In scope for version 1. |
| Indigenous geographies | Reserve boundaries and treaty boundaries in scope. Asserted traditional territories excluded from version 1. |
| Deferred | Advanced layer controls, national pre-materialized change polygons, and restricted provincial enhancements unless and until written redistribution rights are recorded. |
| Build agent | Codex, delegating to GPT 5.6 Terra sub-agents at medium reasoning, with audit after every delegation. |

Purpose. Build a public record of forest change across Canada from 1984 to the latest admitted source year, with British Columbia, Alberta, Ontario and Quebec retained as the Big Four focus provinces. Bring together satellite observations, official forest and disturbance records, wildfire data, recovery signals and source information. Say clearly what the evidence shows, where it came from, how current it is, and what it cannot tell you.

# Version 2.1 scope amendment, approved 2026-08-25

Precedence. This amendment is binding. It supersedes any conflicting statement elsewhere in this plan that requires annual public artifacts, national pre-materialized change polygons, mandatory ingestion of restricted provincial layers, coverage limited to four provinces, or a new MFA code for each AWS action. Existing annual source evidence remains valid and may be retained internally for provenance, validation and reproducibility.

## National product and temporal cadence

- The baseline covers all Canada. British Columbia, Alberta, Ontario and Quebec remain the required Big Four focus provinces; no province or territory is removed from the national baseline.

- Publish eleven national forest-condition snapshots for 1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020 and 2022.

- Publish ten change rasters, one for each interval between adjacent snapshots. Each change product summarizes change observed during its whole interval; it is not merely a second endpoint image.

- Annual NTEMS inputs and the already-derived annual masks and loss rasters may be used internally to calculate the interval products and to preserve lineage. They are not required as separate public time-slider products.

- Do not materialize a national polygon for every changed cell or patch. Keep the national record raster-first, compute boundary summaries directly from rasters, and generate detailed geometry only on demand or for a specifically approved, bounded enhancement. This removes the national cell-geometry and polygon-materialization storage gate.

- Google Earth Engine is an optional compute route for scalable raster clipping, interval aggregation and future updates. It is not the archive or the legal source of record, and its use does not replace each dataset's licence. Existing verified local products remain usable; the simplest reproducible route may be used for each admitted run.

## Provincial enhancement policy

- Open provincial sources may proceed through the normal source-ledger, checksum, transformation and admission gates. For Quebec, this includes the cleared MRNF ecoforest and historical wildfire datasets. For British Columbia, it includes only catalogue records whose individual metadata explicitly grants the Open Government Licence - British Columbia or another recorded redistribution licence.

- Every provincial source marked Access Only, restricted, permission required or otherwise lacking a verified redistribution grant is an optional enhancement. Its absence must not block the national baseline, Big Four province summaries, public launch or later phases.

- The owner has submitted one copyright-licence request covering the British Columbia Vegetation Resources Inventory, Consolidated Cutblocks / Harvested Areas of BC, and Forest Operations Map cutblocks. The quoted combined fee is CAD 85, but the copyright officer has advised that access or permission is not guaranteed. Status is pending. Do not acquire for redistribution, ingest into a public product, pay a fee, or publish these layers without a written grant whose exact terms are recorded in the source ledger and separately accepted for execution. If permission is denied or never arrives, ship without them.

- The same optional rule applies to any other restricted British Columbia layer and to the live SOPFEU feed unless a written reuse grant is verified. Optional enhancements must be visibly labelled and coverage-bounded when added; their absence must never be represented as zero activity.

## Attribution and licensing release gate

- Build attribution into the product and every downloadable artifact. At minimum, record and display the publisher, dataset title, source URL, licence identifier and link, source edition or effective date, retrieval date, required attribution statement, and a plain-language description of Witness Tree's modifications.

- Apply the recorded terms for NRCan and other Government of Canada data under the Open Government Licence - Canada; acknowledge USGS for public-domain Landsat imagery; apply the Statistics Canada Open Licence to Statistics Canada boundaries; apply CC BY 4.0 attribution to Quebec MRNF datasets; and apply the Open Government Licence - British Columbia only to BC catalogue records that explicitly specify it.

- Attribution must appear on the public source page and in a machine-readable sidecar or manifest shipped with bulk downloads. Point-of-use views must identify the source and link to the complete attribution record. A build or release fails closed if any included dataset lacks its exact licence, attribution, redistribution status, source version or modification notice.

## AWS archive authentication

- Retain MFA on the archive role trust. The approved operator enters one fresh TOTP to assume the narrowly scoped archive role once per working session, rather than once per object, multipart part or API action.

- Request a direct operator-to-role STS session of 43,200 seconds, the AWS maximum of twelve hours. If the role's configured MaxSessionDuration is lower, use no more than that configured maximum and record the shorter setting as an IAM configuration blocker for separately authorized correction. Do not use role chaining, which would reduce the session limit.

- Reuse the temporary credentials only for actions already authorized by the role policy and the approved run. Keep credentials owner-only and ephemeral, never print or commit them, monitor expiry with a safety margin, and checkpoint provider state before expiry. A later continuation requires one new MFA-backed session and verified resume state, not a new code for every action.

- This plan amendment authorizes no IAM mutation, AWS storage call, upload or production action. It records the future operating design only.

## Phase effects

- Phase 1 core completion is based on the open national inputs and admitted open provincial sources. Pending optional permissions remain tracked risks, not owner-decision or phase-exit blockers.

- Phase 2 produces the eleven snapshots and ten interval-change rasters above, national boundary aggregates, lineage, checksums and validation evidence. National polygon materialization and cell geometry are removed from the required Phase 2 path.

- Phase 3 consumes versioned raster summaries and generated place aggregates. It must tolerate absent optional enhancement fields and show the applicable coverage grade rather than a zero.

- Phase 4 adds cleared provincial detail when available. It can ship incrementally and is not a prerequisite for the national product.

## Verified completion checkpoint through 2026-08-25

Maturity rule. “Completed” below means the named evidence or implementation exists and passed its recorded checks. It does not mean production admission, public release, scientific validation or an external human checkpoint unless that is stated explicitly. Phase 1 and Phase 2 percentages below are historical evidence-rubric scores under the pre-amendment plan; Version 2.1 is not mechanically re-scored from them. Phase 3 has no defensible current cumulative percentage and is therefore recorded by evidence rather than an invented score.

### Cross-cutting technical foundation completed

- The repository contains the bilingual English/French shell and route pairs; place, location, search, methods, source, download, correction, governance, comparison and Explore foundations; Figure-versus-Unknown rules; visible provenance, confidence, coverage and evidence components; and fail-closed source, archive, ingestion, release, event, matching, precedence, denominator, fire-impact and correction contracts.

- CI and deterministic validators cover bilingual parity, claims, accessibility structure, style and brand tokens, artifact budgets, source status, route identity, checksums and nonproduction boundaries. The public technical preview and its fixtures remain explicitly illustrative, unapproved and nonproduction.

- No completed technical foundation is evidence of a production geography archive, live operational wildfire feed, managed production account store, outbound alert sender, production map-tile archive or real-data public release.

### Phase 1 evidence completed

- The authoritative 31-row audit records 14.75 raw-evidence credits, a bounded evidence-tracking score of 39.2741935%, nine remotely verified / archived / profiled rows, seven locally verified / profiled rows, two partial rows and thirteen access-blocked rows. Nine rows have complete immutable archive evidence; zero rows have production-admission or production-eligibility proof. The percentage is evidence tracking, not production completion.

- The nine remotely verified rows are NTEMS annual land cover, NTEMS forest harvest, NTEMS canopy cover, NTEMS canopy height, Quebec current ecoforest, Quebec original/current inventory, Alberta AVI Crown, Alberta AVI post-harvest and Alberta Primary Land and Vegetation Inventory.

- The seven locally verified rows are the CWFIS, British Columbia, Alberta and Ontario current-wildfire snapshots, Quebec fourth inventory, the 2023 federal-riding edition and the Elections Canada 45th-election files. One federal Elections Canada archive supports the two federal ledger rows and must not be uploaded twice.

- All 39 NTEMS land-cover years from 1984–2022 were validated on a common 30 m grid, CRS, geotransform, dimensions, Byte band and nodata definition. The known 1991 and 2005 empty raster-attribute-table defects are recorded; affected class statistics remain Unknown rather than zero.

- The Quebec historical-wildfire lossless local transform completed 94,572 wildfire geometries and 94,572 metadata rows with no missing, empty or invalid geometries. The deterministic Alberta AVI run evaluated 792,443 features, left 791,835 unchanged, repaired 607 and quarantined one without altering the source. The bounded Alberta PLVI repair evidence preserves all 179,087 joined features and twelve recorded repairs; its schema drift remains an ingestion blocker.

- The Canadian immutable archive, versioning, Object Lock and block-public-access controls were provisioned. The first three canonical promotions—Quebec historical wildfire, Alberta AVI Crown and NRCan 2022 canopy cover—passed remote byte/checksum and retention readback, with COMPLIANCE retention through 2033-08-12. The recorded write-once exercise refused delete, retention-shortening and retention-mode-downgrade attempts.

- The two exact Quebec current/original payloads and their manifests are reported complete, exact-version verified and retained in COMPLIANCE mode through 2033-08-12; the redacted repository attestation requires its owner-private mode-600 pair for full verification. This is immutable source evidence only. Do not repeat either upload.

- The Quebec fourth inventory completed local acquisition and profiling of all 56 publisher-defined sheets: 16,177,306,782 archive bytes, all ZIP integrity checks passed, and the profile records 7,489,195 base stand polygons with no missing, empty or invalid base geometry. Its remote immutable promotion remains pending.

- Access-outreach evidence covers all thirteen access-blocked rows: seven verified new sends, one pre-existing request and eight substantive replies were recorded. The owner's later combined BC VRI / Consolidated Cutblocks / FOM copyright request remains a pending optional-enhancement request, not permission.

The controlling Phase 1 evidence is the `phase1/all-owner-approvals` branch at `0c4f547814a5855c138df221bfa9d5b2228657b9`, especially `data/phase1-current-state-completion-audit.json`, `data/phase1-production-source-ledger.json`, `docs/PHASE1_CURRENT_STATE_COMPLETION_AUDIT.md`, `docs/QC_IMMUTABLE_PROMOTION_PREPARATION.md` and `data/qc-fourth-inventory-evidence.json`. The later wildfire hardening commit adds race-safe preflight logic but no archive or score credit.

### Phase 2 evidence completed

- The approved versioned nonproduction national raster run produced 39 annual forest masks, 38 adjacent annual loss rasters and two historical disturbance rasters. All 79 outputs—23,141,889,028 bytes—passed the recorded checksum, lineage and GeoTIFF readback against 41 checksum-bound inputs. The conservative forest crosswalk is VLCE2 classes 210, 220 and 230; class 81 remains excluded.

- The exact component inventory completed all 38 loss pairs: 1,384,027,417 loss cells, 303,530,909 four-connected components, 528,596,703 run records and 12,199,309 aliases in 68,322,924,822 retained bytes. The recorded end-to-end interval was 4,676.643920 seconds with zero scratch bytes.

- The optimized local 1984–1985 pilot completed the first 10,000 finalized components and 13,519 loss cells in 11,355,097 candidate bytes. Its embedded final attestation records 1.355815 seconds whole-operation time, 69,828,608 bytes peak RSS and less than one average vCPU. It is a completed local nonproduction artifact pending formal integration into the checked-in Phase 2 status; it is not release or national-execution admission evidence.

- Independent audit accepted the checked-in Phase 2 raster and component evidence at 54% under the old annual/polygon-oriented rubric. That score is not production readiness and is not the Version 2.1 raster-first score.

- Version 2.1 reuses the existing annual masks and loss rasters to generate the eleven selected snapshots and ten interval products. The exact component inventory and pilot remain useful method evidence, but national patch polygons and per-cell geometry are no longer required deliverables.

The controlling Phase 2 evidence is the `phase2/national-baseline-batch` branch at `bba1983084c7d665537b8feb61b3423f6ea94535`, especially `data/phase2-real-national-execution-evidence.json`, `docs/PHASE2_REAL_LOSS_COMPONENT_INVENTORY.md` and `docs/PLAN_GAP_MATRIX.md`. The attested optimized pilot is retained outside Git in the owner-only derived-data tree.

### Phase 3 technical foundation completed

- The deterministic synthetic registry covers eight place types across the Big Four focus provinces: 32 place records plus 32 paired location records, 384 localized records, 192 exact bilingual pairs and 128 localized static place/location pages.

- The public value model fails closed: a Figure requires evidence, confidence, coverage and provenance; Unknown has no numeric value and requires a bilingual reason, coverage and provenance. The versioned Phase 2 adapter accepts only example, unapproved, nonproduction inputs and validates identities, arithmetic, denominators, years, coverage, versions and lineage.

- Methods, source ledger, glossary and corrections are generated from one typed bilingual registry. Thirty-two deterministic example CSV downloads have a manifest binding path, media type, byte length, SHA-256, place identity and nonproduction status.

- The automated built-browser audit covers fourteen English/French routes across seven templates. The recorded laboratory result has a maximum local LCP of 736 ms, zero axe violations, zero keyboard failures, zero forced-colour failures and zero 320-CSS-pixel reflow failures. Route, language, landmark, focus, cue and evidence-integrity validators include negative tamper cases.

- The Phase 3 external-checkpoint protocol and fail-closed empty evidence envelope are execution-ready. No moderated usability participants, human keyboard or screen-reader review, human forced-colour/CVD review, field performance or independent WCAG 2.2 AA / EN 301 549 report has been recorded.

The controlling Phase 3 evidence is the `phase3/registry-page-model` branch at `d9860988ab490c1946e8dfda6333d894fd8d0970`, especially `docs/PHASE3_REGISTRY_GENERATOR.md`, `docs/PHASE3_STRUCTURAL_REGISTRY.md`, `docs/PHASE3_BROWSER_AUDIT.md`, `data/phase3-browser-audit-summary.json` and `data/phase3-external-checkpoint-evidence.json`. Phase 3 is not re-scored here because its older percentages are stale or explicitly non-cumulative.

### Work still open after this amendment

- Phase 1: federal archive promotion, Quebec fourth-inventory promotion, six-object current-wildfire archive proof, the normal archive-control exercise, remaining source transformations and admission decisions, French boundary editions, and all real-data release/production admissions. Restricted provincial permissions remain optional enhancements.

- Phase 2: deterministic creation and validation of the eleven Version 2.1 snapshots and ten interval-change rasters; admitted boundary intersections and raster-derived aggregates; real matching where cleared provincial evidence exists; validation samples and statistics; tiles, downloads, scientific review, release and production admission. Old national polygon execution is removed rather than pending.

- Phase 3: admit real Phase 2 aggregates; generate real national place/location records, search, maps, tiles and downloads; complete moderated bilingual usability, human accessibility, field performance, outside accessibility review, professional translation, legal review and production content approval.

- AWS: the twelve-hour MFA-backed session design is approved in the plan only. The role's current MaxSessionDuration has not been read or changed by this plan update, and no AWS or IAM action was performed.

# 0. What changed in version 2

Version 1 set out what the product may claim. It did not say how to build it. It carried no budget, no schedule, no team, no technology, no data volumes, and no definition of the word forest, which every published number depends on. Its 18 item build checklist repeated the same acceptance sentence 18 times, so the build had no real acceptance criteria at all.

Version 2 keeps the editorial discipline of version 1 and adds the parts you build from.

| Change | Reason |
| --- | --- |
| The record now starts in 1984, not 2000. | The 2000 date came from a global dataset that starts in 2000. Canada has its own national product that starts in 1984 and already separates harvest from wildfire. You are not buying new data. You are keeping data you would otherwise discard. |
| NTEMS replaces generic satellite products as the spine. | Version 1 asked for Landsat and Sentinel change products in general terms. The Canadian Forest Service already publishes annual national change with cause attribution. Building on anything else duplicates work that is already done and funded. |
| Forest is now defined. | Every percentage in the product divides by forested area. Version 1 never said what counts as forest. Three common definitions give three different answers. |
| Coverage grades are now sub-provincial. | Quebec ecoforestry mapping effectively stops around the 52nd parallel. Ontario forest inventory covers managed forest units only. A province level grade would claim enhanced records for northern Quebec, where you only have national baseline. |
| Live wildfire runs on a fixed four times daily schedule. | Version 1 said poll on a documented cadence. That is now a specific schedule with a specific staleness window and specific display rules. |
| Ranked riding comparison is in scope. | Version 1 forbade it. You decided to build it. Version 2 specifies the safeguards that travel with the ranking. |
| Accounts, saved areas and change alerts are in version 1. | This is the feature that turns a reference site into something people come back to. |
| Reserve and treaty boundaries are in scope. | Both are official, surveyed or legislated, and openly licensed. The product would misrepresent the land base without them. |
| Confidence ratings are rule derived. | Version 1 required every rating to explain itself. At this scale that means millions of explanations, so the rules must generate them. The rules are now written down. |
| Every data assumption carries a source URL. | You asked for this. Section 5 and Appendix A give the catalogue entry for every dataset named in this plan. |
| The front end is specified, not deferred. | Rendering strategy decides whether the accessibility and bilingual gates are reachable. Those are release gates, so the front end cannot wait for later discovery. |
| Every build checklist item has its own acceptance test. | The version 1 checklist repeated one sentence 18 times. |
| Advanced layer controls are deferred. | Your decision. They are the classic maintenance sink in map products. |
| Asserted traditional territories are excluded from version 1. | Your decision, on the recommendation in section 11.2. |
| The product is now called Witness Tree. | Forest Observatory described the machinery. Witness Tree is a survey term that already exists in both official languages and describes the evidence. A request for permission to use Mistik runs in parallel. See section 1.4. |

# 1. Executive summary

Witness Tree is a public record of forest change in British Columbia, Alberta, Ontario and Quebec from 1984 to the present. You search a place, a watershed, a municipality, a provincial riding, a federal riding, a reserve or a treaty area. You click any location. You get an ordered history of what happened to the forest there, what official records support it, what is unknown, and how confident the product is in each statement.

The product is not a GIS workstation and it is not an emergency service. GIS is the internal foundation. The public experience is a location history, a time slider, place pages, sources and plain language, in English and French.

## 1.1 The public promise

| Witness Tree helps you understand recorded and observed forest change in four provinces. Every result shows what the evidence says, where it came from, how current it is, and what it cannot tell you. |
| --- |

## 1.2 What version 1 of the product ships

- A national baseline covering all four provinces from 1984, built on NTEMS annual land cover and CA Forest Harvest.

- Enhanced provincial records for British Columbia and Quebec, then Alberta and Ontario.

- Place pages for province, watershed, forest district, municipality, provincial riding, federal riding, reserve and treaty area.

- Ranked and side by side comparison of electoral ridings, with forced normalisation.

- Live wildfire at four refreshes daily, with freshness stamps and emergency routing to the responsible agency.

- Accounts, saved areas and change alerts.

- Full English and French parity across every surface.

- A public source ledger, methods pages, a glossary, coverage grades, release notes and a correction route.

- Bulk downloads and a citation format.

## 1.3 Non-goals

These stay out. If a stakeholder asks for one of them, the answer is a separate approved research plan, not a feature request.

- No estimate of remaining merchantable timber or annual allowable cut.

- No wildfire spread prediction, evacuation instruction or emergency warning.

- No causal claim that harvesting caused a specific wildfire.

- No claim that detected tree cover loss is deforestation or logging.

- No legal, regulatory, trespass or compliance finding about any organisation.

- No corporate ownership histories.

- No coverage beyond the four provinces in version 1.

- No ranked comparison across reserves or treaty areas. Ranked comparison applies to electoral ridings only.

## 1.4 The name

A witness tree is a real thing. Surveyors blaze a tree near a survey corner so the corner can be found again. The tree stands as the reference the record depends on. French forestry and survey practice use the same term, arbre témoin, and témoin means witness. You get one name that works in both official languages with no translation, and it says evidence rather than alarm.

Witness Tree is the working name. The team is seeking permission to use Mistik, the Cree word for tree or wood, from a Cree language authority through the engagement track in section 11.3. Cree territory spans Alberta, Ontario and Quebec, three of the four provinces in scope. If permission is granted, Mistik becomes the product name and the meaning is published alongside it, in the form the language authority approves. If permission is not granted, or is granted and later withdrawn, Witness Tree stands.

| Build for the rename. A name that might change is an engineering constraint, not a branding question. Phase 3 generates tens of thousands of static URLs and Phase 9 turns them into citations other people rely on. Renaming after that point costs far more than renaming before it. |
| --- |

Do all of the following in Phase 0, whatever the naming outcome turns out to be.

- Keep the name out of persistent identifiers. Place page and location URLs carry the geography and the data version, never the product name. A citation must survive a rename without a redirect.

- Register both names now. The .ca and .org domains for both, in both languages, before either name is public. A name you cannot register is a name you cannot use.

- Put the name in exactly one token in the code. One entry in the localised string registry, referenced everywhere else. A rename is then one commit plus asset regeneration.

- Keep the share image generator deterministic. Section 9.3 burns the product name into pixels. Regenerating every share image is the real cost of a rename, so make it a single command.

- Decide before Phase 3 if you can. That is the last checkpoint where a rename is cheap. Engagement moves at the pace of the people you are engaging, so start the request in Phase 0 and do not chase it.

- Plan the switchover, not just the switch. If the name changes, keep the old domain redirecting permanently, publish a rename note in both languages, and add an entry to the corrections log so old citations resolve and explain themselves.

# 2. Decisions taken

These are settled. Do not reopen them during the build.

| Decision | Choice | Why |
| --- | --- | --- |
| Product name | Witness Tree, working name | A survey term that exists in English and in French as arbre témoin. One name, two languages, no translation. |
| Indigenous name | Mistik, requested, not yet granted | Cree for tree or wood. Permission is being sought through the engagement track in section 11.3. Nothing ships under this name until permission is in writing. |
| Record start | 1984 | NTEMS annual land cover starts in 1984 and CA Forest Harvest starts in 1985, both open licence, both 30 metre. The data already exists. |
| Default view start | 2000 | Official provincial harvest records thin out sharply before the mid 1990s. The 1984 to 1999 window will show a large unmatched share. That is honest but confusing as a first impression, so the slider opens at 2000 and extends back on request. |
| Satellite spine | NTEMS, not Hansen Global Forest Change | NTEMS is Canadian, annual, 30 metre, and already attributes change to wildfire or harvest. Hansen is global and does not attribute cause. |
| Live wildfire | In scope, four refreshes daily | 05:00, 12:00, 16:00 and 21:00 Pacific. |
| Riding ranking | In scope | Normalised by forested hectares, coverage grade shown on every row, absolute and normalised values both visible. |
| Accounts and alerts | Version 1 | Saved areas plus change notifications. |
| Advanced layer controls | Deferred | Downloads serve expert users better. |
| Reserve boundaries | In scope | Legally surveyed, published open by Indigenous Services Canada and Natural Resources Canada. |
| Treaty boundaries | In scope | Historic and modern treaty boundaries published open by Crown-Indigenous Relations and Northern Affairs Canada. |
| Asserted traditional territories | Excluded from version 1 | No authoritative source exists. See section 11.2. |
| Indigenous engagement timing | Runs in parallel with publication | Reserve and treaty pages publish on the normal release schedule. Engagement, right of reply and corrections run alongside. |
| Front end | Specified in this document | See section 12. |
| Build agent | Codex with GPT 5.6 Terra sub-agents | See section 20. |

# 3. Users, questions and success tests

## 3.1 Who this is for

| User | What they need |
| --- | --- |
| Residents and communities | A trustworthy answer to what changed here, without GIS knowledge. |
| Journalists and civil society | Traceable, citable records and comparable summaries. |
| Researchers and students | Provenance, dates, methods and downloadable data. |
| Public officials and staff | Riding, watershed, district and provincial context. |
| Forestry and wildfire practitioners | Accurate presentation of official records and explicit limits. |
| First Nations, Metis and Inuit governments and organisations | Accurate boundaries, a right of reply on pages that describe their lands, and a correction route that works. |

## 3.2 The questions the product must answer

- Where did detected tree cover change happen here between 1984 and today?

- Does an official record show harvest, wildfire, insect disturbance or another event?

- What forest condition was mapped before the change?

- Does later imagery show canopy recovery?

- What fire history intersects this location?

- Which organisation is named in the authoritative record, if any?

- How does this location compare with its watershed, district, municipality, riding and province?

- What source, date, method, licence and confidence supports each answer?

- What can this product not tell me about this place?

## 3.3 Success tests, with numbers

Version 1 said a non-GIS user should be able to answer the core questions. That is not testable. These are.

| Test | Pass threshold |
| --- | --- |
| Unassisted task completion | 8 of 10 participants complete 4 of 5 core tasks with no help, under 3 minutes per task. Run separately in English and in French, with separate panels. |
| Claim classification | 100 percent of published claims carry an evidence class of official record, satellite observation, derived estimate or unknown. Checked automatically at build. |
| Licence coverage | 100 percent of production datasets have a recorded licence, attribution string, source version and retrieval date before ingestion. |
| Coverage honesty | Every place page shows a coverage grade. No page displays zero where the correct answer is insufficient coverage. Checked by an automated test that asserts the formatter refuses bare zeroes. |
| Bilingual parity | Zero missing French strings at build. Zero critical French defects at release. French page count equals English page count. |
| Wildfire freshness | Every live wildfire view shows source time, last successful refresh, source agency and the emergency routing link. Verified by an automated check on every deploy. |
| Accessibility | WCAG 2.2 AA on all four screen templates. Keyboard only pass with no blocked task. Every map view has a working table equivalent. |
| Traceability | Any displayed number can be traced to its source records through a lineage query in under 60 seconds. |

# 4. Definitions that everything depends on

Settle these before writing pipeline code. Every published number changes if you change one of them later.

## 4.1 What counts as forest

This is the single most important definition in the product. Every percentage divides by forested area. Three definitions are in common use and they do not agree.

| Definition | Rule | Problem if you pick it |
| --- | --- | --- |
| Canada National Forest Inventory | At least 1 hectare, at least 10 percent crown closure, trees able to reach 5 metres at maturity. | Matches national reporting and international obligations. Does not match provincial inventory polygons exactly. |
| Satellite tree cover threshold | Pixels above a chosen canopy cover percentage. | Threshold choice moves the answer by a large margin. Includes plantations, orchards and urban tree cover. |
| Provincial productive forest or timber harvesting land base | Provincial inventory attributes and operability rules. | Different in every province. Not comparable across the four. Excludes forest that is real but not merchantable. |

| Decision. Use the Canada National Forest Inventory definition as the single denominator across all four provinces. Derive the forest mask from NTEMS annual forest land cover for the relevant year. Publish provincial productive forest area as a separate, clearly labelled figure where a provincial inventory supports it. Never mix the two in one calculation. |
| --- |

Write the chosen definition into the glossary, link it from every percentage in the product, and version it. If it ever changes, that is a breaking change and it triggers a full recomputation plus a release note in both languages.

## 4.2 Denominators and the year problem

Forest extent changes over time, so a percentage needs a reference year. Fix these rules now.

- Standard denominator. Forested hectares inside the boundary, using the forest mask for the first year of the requested time range.

- Never divide by total land area. A riding that is half tundra would look untouched.

- Boundary edition travels with the number. Every aggregate states which boundary edition produced it and whether current boundaries were applied to historic events.

- Cross edition comparison is blocked. The comparison component refuses two places computed on different boundary editions unless the user acknowledges a warning.

- Overlapping events are counted once. See the precedence hierarchy in section 6.5.

## 4.3 Evidence classes

Every public claim carries exactly one of these. This is the strongest idea in version 1 and it stays unchanged.

| Class | You may say | You may not say |
| --- | --- | --- |
| Official record | Recorded harvest or intervention. Within a reported fire perimeter. Recorded tenure holder or client. | The logger. Deforested. Any compliance conclusion. |
| Satellite observation | Tree cover reduction detected. Later imagery indicates canopy recovery. | Logged. Fully regenerated. Permanent loss. |
| Derived estimate | The perimeter intersects an estimated X hectares of mapped mature forest. | The fire destroyed X hectares, unless a qualified damage source supports it. |
| Unknown | No authoritative public record has been integrated for this question. | Any inferred organisation, cause or date presented as fact. |

## 4.4 Confidence, and the rules that assign it

Version 1 required every confidence rating to explain itself. At this scale that is millions of explanations, so a person cannot write them. The rules below generate the explanation text. Store the rule identifier on every record so the explanation can be regenerated if wording changes.

| Rating | Assignment rule | Generated explanation pattern |
| --- | --- | --- |
| High | An authoritative record with geometry, a resolved event date accurate to the year or better, and the attributes the claim relies on. | Direct authoritative record with clear geometry, date and attributes. |
| Medium | Strong official or satellite evidence with one material limitation. Examples: event date uncertain by more than one year, partial attribution, geometry generalised beyond 30 metres. | Strong evidence with a material limitation: [named limitation]. |
| Limited | Useful indication only. Examples: source inventory vintage predates the event by more than 5 years, source resolution coarser than 100 metres, or a documented coverage gap overlaps the location. | Inventory vintage predates the event by [N] years. Attributes carried forward without growth modelling. |
| Unknown | Evidence does not support the requested conclusion. | No authoritative public record has been integrated for this question. |

A colour alone never communicates confidence. Every badge shows a word, a shape and the generated reason on hover, focus or tap.

## 4.5 Coverage grades, at sub-provincial resolution

Version 1 graded coverage by province. That would claim enhanced records for northern Quebec, where enhanced records do not exist. Grade by mapped coverage geometry instead.

| Grade | Meaning |
| --- | --- |
| Enhanced local records | National baseline plus detailed provincial forest, disturbance and administrative records for this specific area. |
| National baseline plus local context | National baseline plus selected provincial fire or forest layers, with material record gaps here. |
| National baseline | Comparable satellite and federal data only. No enriched provincial record claim for this area. |
| Extended record, sparse official matching | Applies to the 1984 to 1999 window. Satellite observation is complete. Official records are thin, so most detected change here will not match a record. |
| Not applicable | The metric does not apply to this geography or this evidence. |

Build coverage as a polygon layer, not a province attribute. Every place page intersects with it and reports the grades present inside its boundary, with the share of forested area under each grade.

## 4.6 The conflicting evidence rule

Version 1 handled each evidence class alone. It never said what happens when satellite shows loss and no official record exists. That case is common, it is the most interesting thing the product surfaces, and it is the easiest to misread as an accusation.

| Rule. When detected change has no matching official record, the product says: no authoritative record has been integrated for this location. It never says unexplained, unreported, undocumented or illegal. The claim describes what Witness Tree holds, not what happened in the world. |
| --- |

Record the reason for non-matching where you can determine it. Common causes: the change sits outside a provincial reporting boundary, the record exists but is not published, the change is natural, the change is on private land where no reporting obligation applies, or the match failed on a date or geometry tolerance. Publish the distribution of these causes on the methods page so readers can calibrate.

# 5. Data sources, with citations

Every dataset named in this plan appears below with its catalogue entry. Verify licence, attribution text, version, retrieval date, update cadence and redistribution terms before ingestion. Record all of it in the source ledger. Appendix A lists every URL in one place.

## 5.1 National baseline

This is the spine. It makes all four provinces comparable and it works even where provincial records differ. NTEMS is produced by the Canadian Forest Service with the University of British Columbia and support from the Canadian Space Agency. It gives you annual 30 metre coverage from 1984 with change already attributed to wildfire or harvest, which is exactly the attribution the evidence framework needs.

| Dataset | Role | Source |
| --- | --- | --- |
| NTEMS overview and access | Programme entry point, methods and product list. | https://opendata.nfis.org/mapserver/nfis-change_eng.html and https://irsslab.forestry.ubc.ca/research/ntems-national-terrestrial-ecosystem-monitoring-system/ |
| Annual high resolution forest land cover for Canada, 1984 to 2022 | The forest mask and the annual change spine. Source of the forest denominator. | https://open.canada.ca/data/en/dataset/2785c103-9c2d-429b-9f3d-89f5cd9ea94d |
| CA Forest Harvest, 1985 to 2022 | Harvest attributed change. The satellite side of harvest matching. | https://open.canada.ca/data/en/dataset/87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe |
| Forest canopy cover, 2022 | Condition context and crown closure. | https://open.canada.ca/data/en/dataset/5b905ab8-44dc-42b4-ad5b-3b1dde8423ab |
| Forest canopy height, 2022 | Structure context. | https://open.canada.ca/data/en/dataset/016d2624-30b4-45f3-87d7-30b06c6a30ca |

| Check at ingestion. NTEMS products are extended as new years are processed. Confirm the current end year at first ingestion and record it. The plan assumes annual coverage through at least 2022 and that later years are published on the same terms. If the end year lags, the product shows the real end year and says so on every affected page. It does not extrapolate. |
| --- |

## 5.2 Fire

| Dataset | Role | Source |
| --- | --- | --- |
| Canadian Wildland Fire Information System | National active fire and hotspot context. Cross province fallback when a provincial service is unavailable. | https://cwfis.cfs.nrcan.gc.ca/ |
| National Burned Area Composite and Canadian National Fire Database | Historical fire perimeters and points, national and consistent. | https://cwfis.cfs.nrcan.gc.ca/datamart |
| BC Wildfire Service current incidents and perimeters | Provincial operational source for British Columbia. | https://catalogue.data.gov.bc.ca/ and the BC Wildfire Service open services |
| Alberta Wildfire | Provincial operational source for Alberta. | https://www.alberta.ca/wildfire-status and Alberta open data |
| Ontario fire disturbance data | Provincial current and historical fire for Ontario. | https://geohub.lio.gov.on.ca/ |
| SOPFEU | Provincial operational source for Quebec. Confirm public reuse terms in writing before integration. | https://sopfeu.qc.ca/ |

## 5.3 British Columbia

| Dataset | Role | Source |
| --- | --- | --- |
| Forest Tenure Cutblock Polygons, FTA 4.0 | Recorded harvest geometry, tenure type and recorded client or holder. Carries a life cycle status of PENDING, ACTIVE or RETIRED. | https://catalogue.data.gov.bc.ca/dataset/forest-tenure-cutblock-polygons-fta-4-0 |
| Forest Tenure Harvesting Authority Polygons | Harvesting authority context. | https://open.canada.ca/data/dataset/cff7b8f7-6897-444f-8c53-4bb93c7e9f8b |
| Vegetation Resources Inventory | Pre-event forest condition: species, age, height, crown closure, inventory vintage. | https://catalogue.data.gov.bc.ca/ search Vegetation Resources Inventory |
| Consolidated Cutblocks | Combined harvest history across tenure and satellite sources. | https://catalogue.data.gov.bc.ca/ search Consolidated Cutblocks |
| Old Growth Technical Advisory Panel layers and BEC ecosystems | Old growth and ecosystem context. | https://catalogue.data.gov.bc.ca/ |
| Forest Operations Map | Planned activity. Must be shown separately from completed activity. | https://catalogue.data.gov.bc.ca/ |

| Critical field. FTA 4.0 life cycle status. PENDING means submitted and not yet approved. ACTIVE means approved, and activity may or may not have happened. RETIRED means harvesting is complete. Treating PENDING or ACTIVE as harvest is a serious and highly visible error. Only RETIRED, or an ACTIVE block corroborated by detected change, may be labelled recorded harvest. Everything else is planned or authorised activity and is labelled as such. |
| --- |

## 5.4 Quebec

| Dataset | Role | Source |
| --- | --- | --- |
| Carte écoforestière à jour | Current ecoforestry mapping with disturbances. Includes forest interventions: récolte, éclaircie, reboisement, in public forest. | https://www.donneesquebec.ca/recherche/dataset/carte-ecoforestiere-avec-perturbations |
| Carte écoforestière originale et résultats d’inventaire courants | Original ecoforestry map and inventory result tables. Licence Creative Commons Attribution 4.0 Québec. | https://ouvert.canada.ca/data/fr/dataset/a232475f-ec3d-476a-8725-d0c12367b3f0 |
| Carte écoforestière originale et résultats du quatrième inventaire | Fourth inventory series. | https://ouvert.canada.ca/data/fr/dataset/77ec9009-b733-4f09-ade3-99d7b2156ad4 |
| Données Québec portal | Discovery point for further Quebec forest, protected area and tenure layers. | https://www.donneesquebec.ca/ |

| Coverage limit you must display. Quebec ecoforestry mapping covers close to the whole territory south of the 52nd parallel. North of that line you have national baseline only. Do not grade Quebec as enhanced records province wide. Grade the mapped coverage polygon as enhanced and the north as national baseline. |
| --- |

## 5.5 Alberta

Alberta is in better shape than version 1 assumed. Crown vegetation inventory is published as open data.

| Dataset | Role | Source |
| --- | --- | --- |
| Alberta Vegetation Inventory, Crown | Pre-event forest condition on Crown land. Open Government Licence Alberta. | https://open.canada.ca/data/en/dataset/64b0e73a-da5f-4f7f-bca1-b656b6e86c94 |
| AVI Crown post inventory harvest areas | Harvest areas recorded after the inventory date. | https://catalogue.arctic-sdi.org/geonetwork/srv/api/records/da07e4d0-bf30-45a8-b0d2-a6fcb3939a7a |
| Primary Land and Vegetation Inventory | Additional land and vegetation coverage. | https://geodiscover.alberta.ca/geoportal/rest/metadata/item/2d41d0e64a844a2fbf4485525e17178f/html |
| Alberta vegetation inventory standards | Attribute definitions needed to map Alberta fields into the common schema. | https://open.alberta.ca/publications/alberta-vegetation-inventory-standards |
| Alberta open data portal | Dispositions, forest management and ecological context. | https://open.alberta.ca/opendata |

One caution. Inventory held by Forest Management Agreement holders is a separate matter from Crown AVI and may not be open. Do not assume it. Where a named holder is not available in an open Alberta source, the organisation field stays unknown. Do not carry British Columbia tenure patterns across the border.

## 5.6 Ontario

| Dataset | Role | Source |
| --- | --- | --- |
| Forest Resources Inventory | Pre-event forest condition. Term 1 covers 2008 to 2017. Term 2 covers 2018 to 2028 and is lidar enhanced. | https://geohub.lio.gov.on.ca/pages/forest-resources-inventory |
| Forest Resource Inventory Term 2, 2018 to 2028 | Current inventory cycle. | https://open.canada.ca/data/en/dataset/c4760737-da46-4653-bdf1-b87957260886 |
| First Nation Reserve, Ontario | Provincial reserve boundary layer for cross checking the federal source. | https://geohub.lio.gov.on.ca/datasets/first-nation-reserve/about |
| Ontario GeoHub | Forest management units, harvest and management planning records, protected areas, fire. | https://geohub.lio.gov.on.ca/ |

| Coverage limit you must display. Ontario Forest Resources Inventory covers managed forest units only. The Far North sits outside it. Grade the managed forest area as enhanced records and the rest as national baseline. This is the same shape of gap as Quebec north of the 52nd parallel. |
| --- |

## 5.7 Boundaries

### Electoral

| Dataset | Role | Source |
| --- | --- | --- |
| Federal Electoral Districts, 2023 Representation Order | 343 districts, proclaimed 22 September 2023. The federal riding layer. | https://app.geo.ca/en-ca/map-browser/record/18bf3ea7-1940-46ec-af52-9ba3f77ed708 |
| Electoral geography boundary files, 45th general election | Current boundary file release from Elections Canada. | https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05 |
| Elections Canada maps and boundary descriptions | Authoritative descriptions and retired editions for reproducibility. | https://www.elections.ca/map_01.aspx?w=0&section=res&lang=e |
| Elections BC, Elections Alberta, Elections Ontario, Directeur général des élections du Québec | Provincial electoral district boundaries. Use the provincial elections authority or the authoritative provincial open data source in each case. | Provincial elections authority open data portals |

### Indigenous

| Dataset | Role | Source |
| --- | --- | --- |
| Indian Reserve boundaries | Reserve polygons, boundaries defined by the Legal Surveys Division of Natural Resources Canada. | https://open.canada.ca/data/en/dataset/79671bf3-706a-47df-9ebd-d4789ce957e8 |
| First Nation Reserve | Reserve polygons with associated Bands, Nations and Tribal Council associations. | https://open.canada.ca/data/en/dataset/80e642cc-c153-4b6d-9b10-92f4d4aaff4e |
| First Nations Location | Point locations and basic attributes from the Indigenous Services Canada Band Governance Management System. Used for naming and linking, not for area statistics. | https://open.canada.ca/data/en/dataset/b6567c5c-8339-4055-99fa-63f92114d9e4 |
| Historic treaties | Treaty boundaries for agreements negotiated between 1725 and 1929. Canada recognises 70 historic treaties signed between 1701 and 1923. | https://open.canada.ca/data/en/dataset/f281b150-0645-48e4-9c30-01f55f93f78e |
| Modern treaties | Comprehensive land claim settlement areas. The CIRNAC and ISC source of record for modern treaty boundaries. | https://open.canada.ca/data/en/dataset/be54680b-ea62-46f3-aaa9-7644ed970aef |
| Indigenous agreements | Other arrangements between Canada, provinces, territories and Indigenous organisations. | https://open.canada.ca/data/en/dataset/82cad281-ff7d-47b3-b2ce-9f794257e86d |
| Aboriginal and Treaty Rights Information System | Reference only. Consult for context and for links to nations. Not ingested as a boundary layer. See section 11.2. | https://sidait-atris.rcaanc-cirnac.gc.ca/SIDAIT-GEO-ATRIS/index-eng.html |

## 5.8 Sources deliberately excluded

| Source | Why it is out |
| --- | --- |
| Hansen Global Forest Change as the spine | Global product, not tuned for boreal forest, and it does not attribute cause. NTEMS does both. Hansen may be used as an independent cross check in validation, labelled as such. |
| Native Land Digital polygons | The project states its map does not represent official or legal boundaries and directs people to contact nations directly. Using it as an analytic boundary would fail the evidence standard in section 4.3. Link to it as a public education resource if you wish. Do not compute statistics against it. |
| ATRIS asserted territory polygons as a map layer | CIRNAC describes ATRIS as not exhaustive or definitive and as a starting point that complements rather than replaces direct contact with Indigenous groups. Asserted territories overlap by design and several are contested. See section 11.2. |
| Scraped public map interfaces | Use the published dataset or service. Scraping a viewer breaks terms and produces unversioned data. |
| Aggregator platforms treated as a single licence | Platforms that republish many layers do not confer a blanket licence on every constituent layer. Audit each layer at source. |

## 5.9 Source ledger requirements

Before any dataset enters the pipeline, record all of the following. A dataset with a missing field cannot be ingested. Enforce this with a schema check in the ingestion job, not with a policy document.

- Dataset name in its original language, plus a reviewed plain language explanation in the other official language.

- Publisher and catalogue URL.

- Licence identifier and the exact attribution string the licence requires.

- Source version or edition, and the effective date.

- Retrieval timestamp and the raw response checksum.

- Update cadence and the date of the next expected refresh.

- Redistribution terms, including whether bulk download may be republished.

- Known coverage limits, as a geometry where one exists.

- Contact route for corrections at the source.

# 6. Data model

## 6.1 Forest event

One table holds every event, whatever province or source produced it. Provincial meaning is preserved in the source label fields rather than flattened away.

| Group | Fields |
| --- | --- |
| Identity | event_id, province, source_id, source_dataset, source_version, ingest_run_id. |
| Geometry | geom_original, geom_normalised, area_ha, positional_confidence_m, intersections with province, watershed, municipality, forest district, provincial riding, federal riding, reserve, treaty area, protected area. |
| Time | event_start, event_end, observation_year, record_date, publication_date, updated_at, date_confidence. |
| Event | event_class, event_subtype, evidence_class, source_label_original, lifecycle_status. |
| Forest context | pre_species, pre_age, pre_height, pre_crown_closure, pre_biomass, ecosystem, inventory_vintage, old_growth_flag, land_tenure_class. |
| Organisation | recorded_holder, holder_role, holder_source_date, attribution_confidence. |
| Recovery | recovery_first_year, recovery_confidence, recovery_source. |
| Confidence | confidence_level, confidence_rule_id, confidence_reason_en, confidence_reason_fr. |
| Display | name_en, name_fr, definition_en, definition_fr, licence_id, limitation_text_en, limitation_text_fr. |

New in version 2. land_tenure_class carries Crown, private, federal, reserve or unknown. Version 1 mentioned public and private forest once, for Quebec only. Around a tenth of Quebec forest is private and it sits mostly in the productive south. Southern Ontario and parts of Alberta are similar. Without this field the product will misrepresent the south of every province, and it interacts directly with organisation attribution, because private land harvest has no tenure holder to name.

Also new. event_subtype must distinguish stand replacing harvest from partial cut, thinning and salvage. Salvage of burned or beetle killed stands looks identical to green harvest in 30 metre satellite data and tells a completely different story. In Quebec, coupe partielle and CPRS are different interventions. Where you cannot tell them apart, set event_subtype to undetermined and say so at point of use. Do not guess.

## 6.2 Place

- place_id, place_type, name_en, name_fr, official_name_language, aliases, parent_place_ids.

- boundary_source, boundary_edition, boundary_effective_from, boundary_effective_to, boundary_retired flag.

- forest_ha by year, coverage_grade breakdown by share of forested area, centroid, bounding box.

- Precomputed annual summaries for fast display, plus a link back to the event records that produced them.

Retain every retired boundary edition. A result computed in 2027 on the 2023 Representation Order must still be reproducible in 2031 after the next redistribution.

## 6.3 Aggregation rules

- Intersect source geometry with a versioned boundary. Never with a current boundary silently applied to a historic event.

- State the denominator, the time range, the data version and the coverage grade with every aggregate.

- Precompute province, watershed, district, municipality, provincial riding, federal riding, reserve and treaty summaries.

- Keep event level records so any total can be audited back to source.

- Show insufficient coverage instead of zero wherever coverage is incomplete.

- Publish a method note for every aggregation and every revision.

## 6.4 Matching detected change to official records

This is the operation that produces the product core claim. Specify it precisely and version it.

| Parameter | Rule |
| --- | --- |
| Spatial tolerance | A detected change patch matches a record when their intersection covers at least 50 percent of the smaller of the two geometries. Record the actual overlap share on every match. |
| Temporal tolerance | Plus or minus 2 years between detected observation year and recorded event year. Widen to plus or minus 3 years before 1995 and record which tolerance applied. |
| Multiple candidates | Choose the record with the highest overlap share. Store the rejected candidates for audit. |
| No candidate | Set evidence to satellite observation and record the non match reason from section 4.6. |
| Record with no detected change | Keep it. A recorded harvest with no detected change is informative and often means partial cut or a small block below the detection floor. |
| Versioning | The matching parameters are part of the published method version. Changing them triggers recomputation and a release note. |

## 6.5 Precedence, so nothing is double counted

When several event types cover the same hectare in the same year, count it once and attribute it in this order.

- Fire, where a reported perimeter covers the location.

- Recorded harvest, where an official record with RETIRED status or corroborated ACTIVE status covers the location.

- Recorded insect or disease disturbance.

- Other recorded intervention, including salvage, thinning and reforestation.

- Detected change with no matching record.

Store every overlapping event, not just the winner. The precedence order decides display and totals. It never deletes evidence.

# 7. Architecture

Version 1 deferred technology to later discovery. That is the one deferral that makes the rest of a plan unfalsifiable, because rendering strategy and data volume decide whether the accessibility and bilingual release gates are reachable at all. Commit to the following now. You can still change vendors.

| Layer | Choice | Why |
| --- | --- | --- |
| Raw archive | Object storage, immutable, one prefix per source per retrieval, with checksum and metadata sidecar. | Reproducibility depends on never overwriting a source. Storage is cheap. |
| Raster processing | Cloud optimised GeoTIFF plus a STAC catalogue. Process with a hosted Earth observation platform rather than a self managed Landsat pipeline. | NTEMS products are already processed. You are clipping, masking and summarising, not building composites. Do not self host a Landsat pipeline. |
| Vector and event store | PostgreSQL with PostGIS for authoring, DuckDB or Parquet for analytics. | PostGIS for the correctness sensitive joins. Columnar files for the aggregations that feed the site. |
| Tiles | PMTiles archives on object storage, served by range request. | No tile server to run, no per tile cost, trivially versioned. You can keep the 2026-04 extract next to 2026-10 forever, which reproducibility requires. |
| Raster time series delivery | Pre-rendered per year tile pyramids, one per view mode. | The time slider becomes a URL template swap. It caches perfectly and survives a traffic spike from a news cycle, which is the only load pattern this product will see. |
| Front end | Next.js App Router, static generation for place pages, client island for the map. | See section 12. |
| Map runtime | MapLibre GL JS. | No per view licence cost and no vendor that can change terms on a public interest product. |
| Scheduled jobs | GitHub Actions cron in the Witness_Tree repository. | Versioned with the code, free, auditable. See section 8.2 and section 20.3. |
| Accounts and alerts | A managed Postgres with row level security, plus a transactional email provider. | See section 10. |
| Search | Prebuilt static index of place names and aliases, both languages. | Search must work without a server and must return French and English names. |

## 7.1 Volumes, so nobody is surprised

Estimate at design time and confirm at Phase 1. These are order of magnitude figures for planning, not commitments.

- Four provinces cover roughly 3.7 million square kilometres of land, of which a large majority is forested ecosystem. NTEMS covers a 650 million hectare forested ecosystem nationally.

- One 30 metre annual layer over the four provinces is in the low gigabytes compressed. Forty annual layers from 1984 to 2024, across four view modes, is the main storage line.

- Event records will number in the millions once detected change patches are vectorised. Plan the event table for tens of millions of rows and index on geometry, year and place.

- Tile pyramids dominate egress cost. Serve from a CDN and cache aggressively. Tiles are immutable once a data version is published, so cache lifetimes can be long.

## 7.2 Environments and non-negotiable controls

- Four environments: development, data review, staging, production. Data review exists so a human can look at new source data before it reaches staging.

- Never overwrite a published result. Publish a new version and keep the old one addressable.

- Validate geometry, dates, units, schema drift, duplicate records, language completeness and licence status automatically on every ingestion run.

- Review manually: high profile fires, disputed organisation attribution, unusually large detected change events, and any disagreement between two sources covering the same place.

- Publish material data and method changes in English and French, on the same day.

- Every published number is reproducible from the raw archive plus the recorded method version. Test this quarterly by recomputing a random sample and comparing.

# 8. Live wildfire

## 8.1 Role and limits

Wildfire information here gives forest context. It is not emergency direction. Provincial agencies remain the authority for evacuation, road access, response and public safety. Every wildfire surface links to the responsible agency before it shows any Witness Tree content.

## 8.2 Refresh schedule

Four refreshes daily, at 05:00, 12:00, 16:00 and 21:00 Pacific.

| Consequence you must design around. The gap between the 21:00 and 05:00 refreshes is 8 hours. During a fast moving fire, displayed data can be up to 8 hours behind the source. That makes the freshness stamp and the emergency routing more important, not less. Both are mandatory on every wildfire view and neither may be collapsed, hidden or placed below the fold. |
| --- |

GitHub Actions cron runs in UTC and does not follow daylight saving. Schedule the union of both offsets and gate inside the job.

| Pacific slot | UTC during PDT, UTC minus 7 | UTC during PST, UTC minus 8 |
| --- | --- | --- |
| 05:00 | 12:00 | 13:00 |
| 12:00 | 19:00 | 20:00 |
| 16:00 | 23:00 | 00:00 next day |
| 21:00 | 04:00 next day | 05:00 next day |

Set the workflow cron to 0 0,4,5,12,13,19,20,23 star star star. At the top of the job, read the current time in the America/Vancouver zone. If the local hour is not 5, 12, 16 or 21, exit successfully without doing work. This gives you the exact four runs in both halves of the year with no daylight saving drift.

## 8.3 Snapshots and versioning

- Store a timestamped snapshot of every incident and perimeter response, raw, before any transformation.

- Never overwrite the previous snapshot. Perimeter history is the product, not a byproduct.

- Compute observed area change between two official versions only as a historical observation. Never present it as a forecast or a rate of spread.

- Retain snapshots permanently. They become the historical fire record for the current season.

## 8.4 Display requirements

Every live wildfire view shows all five of these, at all times, in both languages.

- The time the source agency last updated the record.

- The time of the last successful Witness Tree refresh.

- The name of the source agency.

- The next scheduled refresh time, in the reader’s local time zone.

- A link to the responsible agency for emergency information, placed above Witness Tree content.

An automated check on every deploy asserts all five are present on every wildfire route. The deploy fails if any is missing.

## 8.5 Failure handling

| Failure | Behaviour |
| --- | --- |
| A refresh fails | Keep showing the last good snapshot. Show its age prominently. Retry once after 15 minutes. Do not show stale data as current. |
| Two consecutive refreshes fail | Switch the affected province to a degraded state banner and route users to the agency. Alert the on call address. |
| Source schema changes | Halt ingestion for that source, keep the last good snapshot, alert. Never partially parse a changed schema. |
| Source terms change or access is withdrawn | Remove the live layer for that province within one business day, keep historical snapshots, publish a release note in both languages. |
| Data is older than 24 hours | Replace the live view with a static notice and the agency link. |

## 8.6 Fire impact summaries

For a selected perimeter, publish derived estimates for forested area intersected, age, species and ecosystem context, overlap with recorded prior harvest, overlap with previous fires, overlap with protected areas, and old growth context where a provincial source supports it. State on every summary that a perimeter is not a damage or mortality map. Do not publish causal claims linking harvest and fire. Any future work in that direction needs matched comparison areas, controls for weather, drought, topography, fuels, roads, insect mortality and prior disturbance, expert review, sensitivity testing and a separate approved research plan.

# 9. Riding comparison and ranking

You decided to build ranked comparison. This section specifies how to build it so the ranking carries its own context.

## 9.1 What ships

- A ranked table of federal ridings and, separately, provincial ridings, for a chosen time range and metric.

- A side by side view of exactly two ridings, with a shared method note.

- Both views available in English and French, with a table equivalent at the same URL.

## 9.2 Normalisation is forced

Ridings are drawn by population, not by forest. A raw hectare count mostly measures how far north a riding sits. Northern ridings are enormous and heavily forested. Southern ridings are small and often have little forest. So the default metric is normalised and the absolute value never appears alone.

- Default sort metric. Detected change as a percentage of forested hectares inside the boundary, for the selected time range.

- Both values always visible. Every row shows the normalised percentage and the absolute hectares. Neither can be hidden.

- Forested area on every row. The denominator is visible, so a reader can see that one riding has 40 times the forest of another.

- Coverage grade on every row. A riding that is mostly national baseline coverage is marked as such, inline, not in a footnote.

- Rows with insufficient coverage are not ranked. They appear in a separate section below the table, labelled, rather than sorted to the bottom as if they scored zero.

## 9.3 The screenshot rule

Assume every ranking will be screenshotted and shared without any surrounding page. Design so the screenshot carries its own caveats.

- The time range, boundary edition, data version and denominator definition sit inside the table header, not in page chrome above it.

- A one line method statement sits directly under the table, inside the same visual container.

- The evidence class of the ranking metric is shown once, clearly, in the header.

- A generated share image includes all of the above burned into the image.

## 9.4 Excluded from ranking

Ranking applies to electoral ridings only. Do not build ranked comparison across reserves, treaty areas, watersheds, districts or municipalities. Electoral ridings are held by elected representatives who accepted public scrutiny. The same mechanic pointed at communities is a different thing and it will be used in ways nobody consented to. Side by side comparison of two places of the same type remains available for every geography type.

## 9.5 Neutral language rules

- Never label a riding as worst, best, top or a leader in loss.

- Never colour a ranked row on a red to green scale.

- Never imply that a riding boundary identifies a responsible government, landowner, tenure holder or fire management authority.

- Column headers state the measurement, not a judgement. Use detected change as a share of forested area, not forest destruction rate.

# 10. Accounts, saved areas and alerts

This is the feature that turns a reference site into something you come back to. It is also the feature that turns a public data project into a service that holds personal data, sends email and can be wrong in someone’s inbox. Build it with that in mind.

## 10.1 What a person can do

- Create an account with an email address and a password, or with a magic link.

- Save a place. Any geography the product supports, plus a custom radius around a point, up to a size cap.

- Name a saved area and give it a note.

- Choose which changes to be told about, per saved area.

- Choose how often to hear: immediately, daily digest, weekly digest, or monthly digest.

- Choose the language for notifications, independently of the browsing language.

- See a history of every alert sent, with the exact data version behind each one.

- Export saved areas and alert history.

- Delete the account and everything in it, with a confirmation and a real deletion.

## 10.2 What triggers an alert

| Trigger | Fires when | Default cadence |
| --- | --- | --- |
| New wildfire perimeter intersects a saved area | A refresh brings in a perimeter that overlaps the area and was not there before. | Immediate |
| Wildfire perimeter near a saved area | A perimeter comes within a user chosen distance, default 10 km. | Immediate |
| New official harvest or intervention record | An ingestion run adds a record whose geometry overlaps the area. | Weekly digest |
| New detected change with no matching record | An annual or interim satellite update adds detected change inside the area. | Weekly digest |
| Annual data release covering the area | A new NTEMS year or provincial refresh lands. | Immediate, once per release |
| Correction or restatement affecting the area | A published figure the person was previously told about changes. | Immediate |
| Coverage grade change | The area moves between coverage grades because a new source landed. | Monthly digest |

| The correction alert is the one that matters. If you tell someone that 400 hectares burned near their home and the figure is later restated to 120, you owe them the restatement in the same channel that carried the original. Version 1 promised a corrections policy. This is what makes it real. Build the correction alert before the discovery alerts. |
| --- |

## 10.3 Alert content rules

Every alert is a claim, so every alert obeys the evidence framework. Nothing in an alert is exempt.

- State the evidence class in the first line, not in a footer.

- State the data version and the source agency.

- State when the underlying data was observed, not only when the email was sent.

- Never use urgent language for anything that is not an emergency, and never use emergency language at all.

- For any wildfire alert, put the responsible agency link above the Witness Tree content and label it as the authoritative source for safety information.

- Link to the exact page and the exact data version, so the alert stays interpretable years later.

- Send in the language the person chose, at full quality. A machine translated alert is a defect.

## 10.4 Privacy and data protection

A saved area is a strong signal about where someone lives, works or owns land. Treat the saved area table as sensitive personal data.

| Control | Requirement |
| --- | --- |
| Legal basis | Consent, collected at the point of subscription, recorded with a timestamp and the wording shown. |
| Data minimisation | Store email, password hash, locale, saved geometries, alert preferences and send history. Nothing else. No analytics identifier joined to the account. |
| Retention | Delete an account and its saved areas within 30 days of a deletion request. Purge send history after 24 months. |
| Access | Row level security in the database so one account cannot read another account’s saved areas, enforced at the database, not in application code. |
| Encryption | Encrypt saved geometries at rest. Do not log them. |
| Third parties | One transactional email provider. Send the minimum payload. No marketing platform, no tracking pixels, no open tracking. |
| Unsubscribe | One click, working from every email, without logging in. |
| Jurisdiction | Host account data in Canada. Publish the location in the privacy notice. |
| Bilingual | Privacy notice, consent wording, all email templates and the deletion flow exist in English and French at parity. |

## 10.5 Abuse and load controls

- Cap saved areas per account, default 25, with a documented route to request more.

- Cap custom radius area, default 5,000 square kilometres, so nobody subscribes to an entire province and gets an unusable alert.

- Rate limit account creation and magic link requests.

- Verify the email address before any alert is sent.

- Cap immediate alerts per area per day, default 6, then roll the remainder into a digest.

- Suppress a duplicate alert when the underlying record has not changed, even if a refresh re-delivered it.

## 10.6 Operational duties this creates

Be clear with yourselves about what shipping alerts commits you to.

- Someone must watch email deliverability, bounce rates and spam complaints.

- Someone must be reachable when an alert goes out wrong, including during fire season.

- A wrong alert needs a correction alert within one business day.

- The alert queue must be drained or explicitly stopped during an incident. Silence is better than wrong.

- A kill switch must exist that stops all outbound alerts within 5 minutes, operable by one person, and it must be tested quarterly.

# 11. Indigenous geographies

The product maps land. Around 3 million square kilometres of the four provinces sit inside historic or modern treaty areas, and reserves sit inside many of the watersheds and ridings the product will publish. A forest change product that shows federal ridings and municipal boundaries but not reserves or treaty areas is making an editorial choice, and not a neutral one.

## 11.1 What is in scope

| Layer | Status | Basis |
| --- | --- | --- |
| Indian Reserve boundaries | In scope for version 1 | Legally surveyed by the Legal Surveys Division of Natural Resources Canada. Published open by Indigenous Services Canada. Boundaries are definite and citable. |
| First Nation Reserve, with Band and Tribal Council association | In scope for version 1 | Published open by Indigenous Services Canada. Supplies naming and governance association. |
| First Nations Location points | In scope, for naming and linking only | Point data from the Band Governance Management System. Never used to compute area statistics. |
| Historic treaty boundaries | In scope for version 1 | Published open by Crown-Indigenous Relations and Northern Affairs Canada. Boundaries derive from the treaty texts and are the government record of them. |
| Modern treaty boundaries | In scope for version 1 | Comprehensive land claim settlement areas, published open by CIRNAC. |
| Indigenous agreements | In scope as context | Other arrangements between Canada, provinces, territories and Indigenous organisations. |
| Asserted traditional territories | Excluded from version 1 | See 11.2. |

## 11.2 Why asserted traditional territories are excluded

This is not a judgement about the territories. It is a judgement about the data.

- No authoritative national dataset of asserted traditional territories exists. ATRIS is the closest thing, and CIRNAC describes it as not exhaustive and not definitive, and as a starting point that complements rather than replaces direct contact with Indigenous groups.

- Asserted territories overlap by design. Shared and overlapping use is normal, and several boundaries are actively contested between nations or in litigation.

- A choropleth of forest loss by asserted territory would assign hectares to one nation and not another, on data that its own publisher says is not definitive. That fails the evidence standard in section 4.3.

- Native Land Digital states that its map does not represent official or legal boundaries and directs people to contact nations directly. It is a good public education resource and a bad analytic layer.

What to do instead. On any location result, name the treaty area if one applies, and link to ATRIS and to the nation’s own resources for the wider question of territory. Say plainly that reserve and treaty boundaries are administrative and legal records, and that they do not describe the full extent of Indigenous lands, rights, title or relationships. Revisit this decision after engagement, in version 2 of the product.

## 11.3 Engagement, running in parallel

You decided to publish reserve and treaty pages on the normal release schedule. Engagement runs alongside, not before. That makes the engagement track a hard commitment, because the pages are already live while it runs.

| When | Action |
| --- | --- |
| Phase 0 | Open the request to use Mistik as the product name, through a Cree language authority. Fund an honorarium before you ask. See section 11.5. |
| Phase 1 | Publish an engagement statement on the site describing what the product does, what it does not claim, and how to reach the team. Both languages. Set up a dedicated contact route with a named person and a 5 business day response commitment. |
| Phase 1 | Write to the First Nations, Métis and Inuit governments and organisations whose reserves or treaty areas appear in the product, before those pages publish. Offer a briefing and a right of reply. |
| Phase 2 onward | Offer every reserve or treaty page a right of reply: a clearly attributed statement published on the page, in the language the author chooses, without editing beyond formatting. |
| Phase 2 onward | Run a correction route for this content with a 10 business day resolution commitment, faster than the general route. |
| Continuous | Publish a register of engagement contacts made and responses received, respecting any request for confidentiality. |
| Before version 2 | Ask, through engagement, whether asserted territory mapping should be added and on whose terms. |

## 11.4 Safeguards that travel with these pages

- No ranked comparison across reserves or treaty areas. Ranking is limited to electoral ridings. See section 9.4.

- No statement about resource rights, consultation adequacy, consent or compliance. The product reports forest change and official records only.

- Use the name each nation uses for itself, from the authoritative source, with correct diacritics and orthography. Where the federal dataset name differs from the name the nation uses, show the nation’s own name first and the federal record name as the source citation.

- Do not describe a treaty boundary as a boundary of a nation. It is the boundary of an agreement as recorded by the Crown.

- Where a reserve is small relative to the tile resolution, say so rather than publishing a percentage built on a handful of pixels. Set a minimum area threshold below which the product reports the raw record and declines to compute a rate.

## 11.5 The name request

The team is asking to use Mistik, the Cree word for tree or wood, as the product name. A name taken without permission would cost you the relationship every other part of this section depends on, so the request runs by the same rules as the rest of the engagement track.

| Rule | Detail |
| --- | --- |
| Route | Through the Indigenous engagement lead, not through a designer, an agency or a search engine. The lead makes the approach and holds the relationship afterwards. |
| Who decides | A Cree language authority or Elder council with standing to grant it. Take their direction on who that is rather than deciding yourself. |
| Payment | Pay an honorarium, agreed before the request. Naming is work and reviewing a request is work. |
| One request | Ask once, in one place. Do not shop the request to several nations until one agrees. That behaviour is visible and it ends relationships. |
| Form of permission | In writing, naming who granted it, on what terms, and how the meaning is to be published. |
| Spelling | They set the spelling, the diacritics and the pronunciation guidance. Section 11.4 already commits the product to correct orthography. |
| Right to withdraw | Written into the agreement. If the name is withdrawn, revert to Witness Tree within one release cycle and publish the reason in the form they approve. |
| Meaning travels with the name | Publish what the word means, who granted it and why, on a permanent page in both languages. A name with no explanation reads as decoration. |
| No pressure on timing | Engagement moves at the pace of the people you are engaging. Start in Phase 0, then wait. Do not follow up on a project schedule. |
| If the answer is no | Accept it without a second ask, thank them, pay the honorarium anyway, and ship as Witness Tree. |

Section 1.4 covers the engineering side. Build so a rename costs one commit and one asset regeneration, and decide before Phase 3 if the answer arrives in time.

# 12. Front-end implementation

Version 1 deferred the interface. That cannot hold, because the rendering strategy decides whether the accessibility and bilingual gates are reachable, and both are release gates. This section is the front-end specification. Build it as written.

## 12.1 The stance

The product is an evidence record that has a map in it. Most environmental data products are built as dashboards and then apologised for on a methods page. Build this one the other way around. The caveat is the content, and the interface should make that feel like rigour rather than hedging.

| Principle | What it means in code |
| --- | --- |
| Record, not console | The reading experience is closer to a reference work than an analytics tool. Serif prose, generous measure, dated entries, citations. A reader consults it. A reader does not operate it. |
| Pages before pixels | Place pages are server rendered, statically cacheable, indexable and fully readable with JavaScript disabled. They are the search surface, the accessibility surface, the mobile surface and the citation surface at once. Build them first. Add the map later. |
| Provenance is a component | Source, version, retrieval date, licence and confidence travel with the value as one component. No code path renders a figure without them. |
| Absence is a value | No record and zero are different types with different renderings. The formatter refuses to print 0 unless the caller asserts a true zero. |
| Two languages, one build | A missing French string fails the build. Parity is a compiler error, not a backlog ticket. That is the only mechanism that survives a deadline. |
| Colour is never decorative | Colour appears only where it carries meaning, so a reader learns that colour means something. |

## 12.2 Type roles

Three roles, split along a line that carries meaning.

- Serif for prose, headings and headline figures. A transitional serif with a technical pedigree. Charter, with Iowan Old Style as a fallback. Bookish without being precious, and its diacritics hold up under French accenting, which rules out several otherwise attractive faces.

- Monospace for machine derived tokens. Source identifiers, dataset versions, coordinates, retrieval timestamps, evidence chips, axis ticks.

- Neutral sans inside application chrome only. Controls, rails, form labels.

The split does real work. Serif means Witness Tree is asserting something. Monospace means a source said this verbatim. Sans means this is a control. A reader learns it in about four seconds and you never have to explain it.

## 12.3 Colour doctrine

The product encodes three independent variables on one canvas. Conflating them is how map products mislead. Give each its own channel.

| Variable | Channel | Rule |
| --- | --- | --- |
| Record type: harvest, fire, insect, none | Hue, categorical | Four discrete identities, validated for deuteranopia, protanopia and tritanopia separation in both themes. |
| Evidence class: official, observed, derived, unknown | Texture and edge | Orthogonal to hue, so a reader sees fire but only satellite observed without a second legend. Solid fill is an official record. A 45 degree hatch is observation with no matching record. A dashed edge is unknown. |
| Year of change | Single hue sequential ramp | Appears only in the Forest change view mode, where the categorical hues are off. The two encodings never share a canvas. |

Green for forest and red for loss is not in this product. That pairing is the worst available choice for red and green colour vision deficiency, it is emotionally loaded in a product committed to neutrality, and it spends the most legible contrast in the palette on a variable the basemap already answers. Forest extent is a desaturated ground, not a series.

### Validated palette

| Record type | Light theme | Dark theme | Meaning |
| --- | --- | --- | --- |
| Recorded harvest | #2a78d6 | #3987e5 | An official record exists and its geometry intersects the detected change. |
| Fire perimeter | #eb6834 | #d95926 | Within a reported perimeter. A perimeter is not a damage map. |
| Insect disturbance | #4a3aa7 | #9085e9 | Recorded in a provincial or national pest survey. |
| No matching record | neutral, 45 degree hatch | neutral, 45 degree hatch | Detected by satellite with no authoritative record integrated. Not illegal. Not unexplained. Unmatched. |

These values pass lightness band, chroma floor, adjacent pair colour vision deficiency separation, normal vision separation and contrast checks in both themes. Re-run the check if anyone changes a value. The fourth category is the one the product exists to surface, and it is deliberately the only one without a hue. Neutral plus texture says Witness Tree is showing you an absence in its records, which is exactly the claim.

Evidence and confidence chips carry a shape as well as a colour: square, circle, triangle and hollow, so the four classes survive greyscale printing and forced colours mode. Confidence uses a three bar meter plus a word. Hover or focus reveals the specific reason, generated from the rule that assigned it, never a generic definition.

## 12.4 Screen templates

Four templates cover the whole product. Province, watershed, forest district, municipality, provincial riding, federal riding, reserve and treaty area are all the place page template with different parameters. That is what makes eight geography types affordable for a small team.

### A. Location result: what happened here

The core screen, reached by clicking the map or searching an address. It is organised as a dated sequence of events, not a stack of toggled layers. Nobody wants to know which datasets intersect a point. They want to know what happened, in order, and who says so.

- A plain language summary line at the top, one sentence, in the reader’s language.

- Coordinates with a positional accuracy figure.

- The containing geographies as links: province, watershed, forest district, municipality, provincial riding, federal riding, reserve and treaty area where applicable.

- Then the events, newest first. Each event carries a year, an evidence chip, a title, a confidence meter, a plain language note about what the evidence cannot tell you, and the full provenance block with dataset, version, retrieval date, licence and a link to the source record.

- It works as a 420 pixel drawer inside the map and as a standalone permalink page at the same URL. Build the permalink page first.

### B. Place page: one template, eight geographies

- A coverage band at the top, stating the coverage grades present and their share of forested area.

- Stat tiles, each one a Figure with its provenance attached in the same visual unit.

- The annual change chart, server rendered as SVG, readable with JavaScript disabled, with a table equivalent at the same URL.

- A sources list generated from the source ledger, not hand written.

- Downloads and a citation block.

- Both locales, statically generated, independently indexable.

### C. Explore: the map as a mode

- Four view modes: Forest change, Recorded harvest, Wildfire, Condition and recovery.

- Released reference-boundary overlays: federal ridings, provincial ridings, Statistics Canada 2021 economic regions and NRCan Water Survey of Canada version 6.0 sub-drainage areas. Economic regions and watersheds are boundary-only reference frameworks, not forest-loss aggregates. Reserves and treaty areas were removed from the Explore overlay set by owner scope decision on 2026-08-29, because their source families remain authority and rights blocked and a permanently unavailable label is itself a claim about geography Witness Tree has no right to publish. The obligation to publish them is not withdrawn. It is tracked solely by the Phase 7 reserve-and-treaty-layers-loaded gate, which stays failed until those sources are released, at which point both overlays return to this list.

- A Presentation toggle of Map or List, and a Chart or Table toggle, so every spatial view has a tabular equivalent at the same URL. That is the accessibility answer and it also makes the product usable on a train.

- The time control is a native input of type range, so arrow keys step by year and screen readers announce it with no extra work. Most map products fail accessibility exactly here, on a custom slider built out of divs.

- Play through respects reduced motion preferences by advancing without the animated camera.

- Attribution is always visible and names every source in the current view.

### D. Bilingual parity

French is a second rendering of the same record, not a translation layer over an English product. Two asymmetries need design, not translation.

- Official names are preserved verbatim, then glossed. Quebec sources are French first and have no official English name. British Columbia, Alberta and Ontario sources have no official French name. Translating Forest Tenure Cutblock Polygons would make the record unfindable in the British Columbia catalogue, which defeats the point of citing it. Keep the official name, add a reviewed gloss in the other language.

- French runs roughly 15 to 20 percent longer than English. Test chips, tiles, table headers and axis labels at the longer measure, not the shorter.

## 12.5 Policy as a compiler error

This is the load-bearing idea in the front end. The editorial rules in this plan are good and they will be broken within six months of launch. Not maliciously. A developer under deadline will render a number without its source, or print a zero where the honest answer is no coverage. Style guides do not survive deadlines. Type signatures do.

Put the rules in the component layer, where breaking one fails the type check rather than a code review.

| Type | Shape | What it prevents |
| --- | --- | --- |
| Figure | value, unit, evidence, confidence with a required reason, provenance with dataset, version, retrieved date, licence and an optional record URL. | A figure cannot exist without its lineage. There is no other constructor. |
| Unknown | evidence set to unknown, a required reason, a coverage grade. | Unknown is a different type, not a Figure with a null value, so the stat component physically cannot render an unknown as 0. |
| Reported | Figure or Unknown. | Every displayed value is one or the other. There is no third state. |
| LocalizedString | A pair of en and fr. | A missing French string fails the build. |
| LicenceId | A union of registered licence identifiers. | An unlicensed source cannot be cited, because its identifier does not exist. |
| CoverageGrade | A required prop on the place page template, with no default. | A page cannot ship without stating its coverage. |

### Rule to enforcement mapping

| Rule from this plan | Enforcement | Fails at |
| --- | --- | --- |
| Every confidence rating shows why it was assigned. Colour alone is never sufficient. | reason is required on confidence. The badge component takes no optional rationale form. | Type check |
| Show insufficient coverage rather than zero where source coverage is incomplete. | Unknown is a distinct variant. The formatter has no path from absence to 0. | Type check |
| All public claims carry an evidence class. | evidence is required and non-nullable on every reported value. | Type check |
| Maintain an English and French record for every product string. | LocalizedString requires both keys. A lint rule bans bare string literals in markup. | Type check and lint |
| All sources have a documented licence and attribution. | LicenceId is a union of registered licences. The source ledger is generated, not hand written. | Type check |
| Every place page shows a coverage grade. | The template requires a CoverageGrade prop with no default. | Type check |
| Map colours are never the sole carrier of meaning. | Snapshot tests render every legend under a greyscale filter and assert shape and texture distinctness. | CI |
| Live wildfire always shows freshness and agency routing. | A route level test asserts the five required elements from section 8.4 on every wildfire route. | CI, blocking deploy |
| Riding rankings always show the denominator and coverage grade. | The ranked table component requires forestedHa and coverageGrade per row and renders both. | Type check |
| No ranked comparison across Indigenous geographies. | The ranked table component accepts only federal riding and provincial riding place types. Any other type is a type error. | Type check |

| Honest note. The riding ranking rules are the weakest row in this table, because the failure mode is a screenshot, not a render. Code can force the denominator and the coverage grade into the table header. Code cannot stop someone cropping them out. Section 9.3 is the mitigation and it is not a guarantee. Accept that residual risk knowingly, because you chose to ship the ranking. |
| --- |

## 12.6 Stack

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | Next.js, App Router | Static generation for tens of thousands of place pages. Server components keep the JavaScript budget on the map route where it belongs. Astro is the alternative worth considering if the map ends up being the only interactive surface. |
| Map | MapLibre GL JS | Not Mapbox. A public interest product should not carry a per view licence cost or a vendor that can change terms. MapLibre is the fork with the ecosystem. |
| Tiles | PMTiles on object storage | Single file tile archives served by range request. No tile server, no per tile cost, trivially versioned. You can keep the 2026-04 extract next to 2026-10 forever, which reproducibility requires. |
| Raster time series | Pre-rendered per year tile pyramids | The time slider becomes a URL template swap. Simple, cacheable, and it survives a traffic spike from a news cycle, which is the only load pattern this product will see. |
| Internationalisation | Route based, /en and /fr | Not query parameters. Not cookies. Both locales must be independently indexable and citable, with hreflang pairs. |
| Charts | Server rendered SVG, hover added client side | Charts must exist in the HTML for the no-JavaScript and screen reader paths. Bars are static markup. The tooltip is progressive enhancement. |
| UI primitives | Radix over Tailwind on a token layer | Dialogs, popovers and tooltips are where hand-rolled accessibility fails. Do not hand-roll them. |
| Editorial content | MDX with a bilingual pair check at build | Methods, glossary and limitations are maintained by non-developers, and every entry needs both languages before it can merge. |

## 12.7 Budgets, treated as gates

| Budget | Threshold | Checked |
| --- | --- | --- |
| Place page JavaScript | Under 100 KB | CI, every pull request |
| Place page LCP | Under 2.0 seconds on a simulated 4G connection | CI, every pull request |
| Place page with JavaScript disabled | Fully readable, every figure and its provenance present | CI, every pull request |
| Explore route JavaScript | Under 400 KB including MapLibre, lazily loaded, never in the shared bundle | CI, every pull request |
| Accessibility | WCAG 2.2 AA, tested against EN 301 549 as the procurement relevant standard in Canada | Automated axe checks plus a keyboard only pass on each of the four templates |
| No-map path | Every spatial view has a tabular equivalent at the same URL through a view parameter. Not a separate page. Not a separate build. | Route test |

Automated accessibility checks catch roughly 30 percent of real problems. Budget for the manual keyboard pass on every template, every release.

## 12.8 Front-end build order

Sequenced so each step ships something publishable, and so the riskiest surface, the map, comes late rather than first. The common instinct is to build the map first because it demos well. That instinct produces products that are inaccessible, unindexable and impossible to cite.

| Step | Work | What ships |
| --- | --- | --- |
| 1 | Token layer, type roles and the policy components. Colours, type scale, both themes, and the Figure, Unknown and LocalizedString primitives with their tests. No pages yet. | A component gallery and a passing test suite |
| 2 | Place page template, hard coded to one riding. Full template rendered from a single fixture, both locales. | One real URL you can test with readers |
| 3 | Generate place pages from the pipeline. Eight geography types, four provinces, both locales, all static. Search over place names with alias handling. | A citable, indexable public reference with no map at all |
| 4 | Location result as a permalink page. Template A rendered server side at a coordinate URL, before it is ever a drawer. | Shareable point histories |
| 5 | Methods, glossary, source ledger and corrections, generated from the same registry the components validate against. | The transparency surface this plan promises |
| 6 | Explore route. MapLibre, PMTiles, four view modes, time slider, template A reused in the drawer. Lazy loaded. | The map |
| 7 | Live wildfire surfaces, including freshness stamps, agency routing and the degraded state banner. | Current fire context |
| 8 | Accounts, saved areas and alerts. | The return visit |
| 9 | Comparison: two at a time first, then the ranked table with the section 9 safeguards. | Comparison, with its context attached |

## 12.9 What the front end does not build in version 1

- Advanced layer controls. No opacity sliders, no arbitrary layer ordering, no user defined styling. Downloads serve expert users better and layer controls are a permanent maintenance cost.

- A user defined query builder.

- Any chart type beyond the annual change chart, the recovery chart and the comparison table.

- Offline or installable app packaging.

- A public API. Publish versioned bulk downloads instead, and revisit an API after launch.

# 13. Bilingual delivery

Parity is a release gate. A release with missing or machine translated French does not ship.

| Requirement | Detail |
| --- | --- |
| Coverage | Interface, navigation, help, methods, glossary, limitations, source names, licence text, alerts, emails, error messages, form validation and the privacy notice. |
| Source names | Preserve the official name in its original language. Add a reviewed gloss in the other language. Never translate a dataset title used for citation. |
| Terminology | Maintain a bilingual glossary as the single source of truth. Every technical term resolves to one approved pair. Review with a professional terminologist familiar with Canadian forestry vocabulary. |
| Quality | Professional translation with subject matter review. Machine translation may draft. It never ships unreviewed. |
| Testing | Usability testing in French with French speaking participants, not English testing with translated screens. Layout tested at the longer French measure. |
| Publication | Data updates, method changes, corrections and release notes publish in both languages on the same day. |
| Build enforcement | A missing French string fails the build. The bilingual pair check also covers MDX content, not only interface strings. |
| Metrics | French page count equals English page count. Zero missing strings. Zero critical French defects at release. |

# 14. Legal, governance and corrections

## 14.1 Before any public release

- Legal review of defamation risk, given that the product names organisations recorded in official sources.

- Legal review of licence compliance for every dataset, including redistribution and bulk download terms.

- Legal review of the disclaimer language, the terms of use and the privacy notice, in both languages.

- Named accountable owner for published content.

- Named accountable owner for data quality.

- A documented escalation route for disputes.

- Insurance appropriate to a public information service.

## 14.2 Organisation attribution rules

Naming a company next to forest loss is the highest risk thing this product does. These rules are not optional.

- Name an organisation only where an authoritative public record names it, and cite that record.

- Use the exact recorded role. Tenure holder, licensee, client and operator are different things and the record says which.

- State the record date and version alongside the name. Holders change.

- Never infer a holder from proximity, from a neighbouring block, or from a pattern.

- Never present a recorded holder as responsible for an environmental outcome.

- Publish a named contact route for an organisation to dispute an attribution, with a 10 business day resolution commitment.

## 14.3 Corrections, with service levels

Version 1 promised a corrections policy. Here it is, with the parts that make it enforceable.

| Class | Examples | Acknowledge | Resolve |
| --- | --- | --- | --- |
| Critical | A wrong organisation attribution. A wrong fire perimeter shown as current. A published figure wrong by more than an order of magnitude. A wrong alert sent to subscribers. | 1 business day | 5 business days |
| Indigenous geography content | Any error on a reserve or treaty page, including naming, boundary or statistic. | 1 business day | 10 business days |
| Material | A figure restated by more than 10 percent. A misclassified evidence class. A wrong coverage grade. | 3 business days | 15 business days |
| Minor | Typography, a broken link, a translation defect that does not change meaning. | 5 business days | 30 business days |

- Every correction gets a public entry in a corrections log, in both languages, stating what was wrong, what it is now, and why it changed.

- Every restated figure keeps its previous value addressable, so an old citation still resolves and shows the restatement.

- Every subscriber previously told about a corrected figure gets a correction alert. See section 10.2.

- Publish correction volume and median resolution time quarterly. A corrections policy nobody measures is a paragraph, not a process.

## 14.4 Governance

- An editorial board that signs off on method changes, new data sources and anything that changes a published number.

- A technical advisory group with remote sensing and forest inventory expertise, including at least one reviewer per province.

- A published decision log. Every scope, method and source decision is recorded with its date and its reason.

- A quarterly review of the evidence framework against what the product actually publishes.

- A standing invitation to source agencies to flag misrepresentation of their data.

# 15. Quality assurance and acceptance

## 15.1 Automated, on every change

- Schema validation on every ingested dataset, with a hard stop on drift.

- Geometry validity, coordinate reference system and topology checks.

- Date range and unit checks, with a hard stop on impossible values.

- Duplicate record detection within and across sources.

- Licence presence check. A dataset with no licence identifier cannot enter the pipeline.

- Bilingual completeness check across interface strings and MDX content.

- Type check, lint and the policy component tests from section 12.5.

- Greyscale snapshot tests on every legend.

- Route test asserting the five wildfire display requirements from section 8.4.

- Performance budget checks from section 12.7.

- Automated accessibility checks on all four templates.

## 15.2 Manual, on a schedule

- Keyboard only pass on all four templates, every release.

- Screen reader pass on the location result and the place page, every release, in both languages.

- Expert review of a random sample of 100 location results per province per quarter, against the source records.

- Review of every high profile fire summary before publication.

- Review of any detected change event larger than a set threshold, default 500 hectares.

- Review of any disagreement between two sources covering the same place.

- Quarterly reproducibility test: recompute a random sample from the raw archive and compare to what is published.

## 15.3 Validation against independent data

Publish the numbers, do not just compute them.

- Compare Witness Tree annual harvest area against provincial published harvest statistics, per province, per year. Publish the difference and explain it.

- Compare Witness Tree burned area against the National Burned Area Composite. Publish the difference.

- Cross check a sample of NTEMS detected change against Hansen Global Forest Change as an independent product, labelled as a cross check and never as a source.

- Publish the accuracy figures the source products report, and do not restate them as the accuracy of this product.

# 16. Phases, checkpoints and exit criteria

Nine phases. Each has a checkpoint with a named decision and exit criteria that can be tested. Do not start the next phase until the current phase exit criteria pass. Durations assume the team in section 19 and run partly in parallel where noted.

## Phase 0. Foundations and definitions

| Field | Detail |
| --- | --- |
| Duration | 4 weeks |
| Goal | Settle every definition that later work would have to redo. Nothing in this phase is glamorous and everything in it is load-bearing. |

### Work

- Adopt the forest definition from section 4.1 and write it into the glossary in both languages.

- Write the confidence rules from section 4.4 as executable rules with identifiers.

- Write the evidence class definitions and the conflicting evidence rule from section 4.6.

- Draft the coverage grade schema and the coverage geometry model.

- Stand up the source ledger schema and its ingestion gate.

- Complete legal review of the disclaimer, terms, privacy notice and attribution rules.

- Publish the engagement statement and open the Indigenous engagement contact route.

- Open the Mistik name request through the engagement lead, with the honorarium agreed before you ask. See section 11.5.

- Do the rename-proofing work in section 1.4. Register both names, keep the product name out of persistent identifiers, and reduce the name to one token in the string registry.

- Set up the repository, environments, CI and the audit trail described in section 20.

### Checkpoint

Editorial board signs off on the forest definition, the evidence classes and the confidence rules. This is the one sign-off that cannot be delegated.

### Exit criteria

- The forest definition is published in the glossary in English and French.

- The confidence rule set produces a generated explanation for every rule, in both languages, verified by a unit test.

- The source ledger rejects a test dataset that is missing a licence identifier.

- Legal sign-off is recorded in the decision log.

- The engagement contact route answers a test message within 5 business days.

- The product name resolves from one token. Changing that token changes every surface, proven by a test.

- Both names are registered in both languages, and no persistent identifier contains the product name.

## Phase 1. Data acquisition and the source ledger

| Field | Detail |
| --- | --- |
| Duration | 6 weeks |
| Goal | Get every version 1 dataset in the archive, licensed, versioned, checksummed and described. |

### Work

- Acquire every dataset listed in section 5 and Appendix A.

- Record every ledger field from section 5.9 for each one.

- Confirm the current NTEMS end year and record it.

- Confirm SOPFEU reuse terms in writing before planning any Quebec live fire integration.

- Digitise the sub-provincial coverage limits: the Quebec ecoforestry coverage polygon, and the Ontario managed forest unit coverage polygon.

- Build the immutable raw archive with checksums and metadata sidecars.

- Build the ingestion validation suite from section 15.1.

### Checkpoint

Data lead confirms every version 1 source is acquired, licensed and reproducible from the archive. Any source that is not moves to a named risk with an owner.

### Exit criteria

- 100 percent of production datasets have a complete ledger entry.

- Every raw file has a checksum and can be re-fetched or restored from the archive.

- The coverage geometry layer exists and covers all four provinces with a grade for every part of the land base.

- The validation suite fails a deliberately corrupted test dataset.

## Phase 2. National baseline pipeline, 1984 to present

| Field | Detail |
| --- | --- |
| Duration | 8 weeks |
| Goal | Produce the annual change spine for all four provinces from 1984, with harvest and fire attribution and the forest mask. |

### Work

- Process NTEMS annual forest land cover into the forest mask per year.

- Process CA Forest Harvest into harvest attributed change.

- Vectorise detected change patches and load the forest event table.

- Compute forested hectares per boundary per year for every geography type.

- Build the pre-rendered per year raster tile pyramids for the Forest change view mode.

- Publish method version 1 of the pipeline, with parameters.

### Checkpoint

Technical advisory group reviews the baseline against provincial published statistics for two provinces. Difference must be explainable.

### Exit criteria

- Annual national baseline exists for every year from 1984 to the current NTEMS end year, for all four provinces.

- A random sample of 100 locations per province resolves to the correct year and attribution on expert review.

- The comparison in section 15.3 is computed and the difference is documented per province per year.

- Every aggregate carries its denominator, time range, data version and coverage grade.

## Phase 3. Front-end foundation and place pages

| Field | Detail |
| --- | --- |
| Duration | 8 weeks, overlapping Phase 2 |
| Goal | Ship a citable, indexable public reference with no map. |

### Work

- Front-end build order steps 1 to 5 from section 12.8.

- Token layer, type roles, both themes, the policy components and their tests.

- Place page template, then generation across eight geography types, four provinces, both locales.

- Location result permalink pages.

- Methods, glossary, source ledger and corrections pages, generated from the registry.

- Search over place names and aliases in both languages.

### Checkpoint

Usability testing with 10 non-GIS participants in English and 10 in French, on the success tests in section 3.3.

### Exit criteria

- Every performance and accessibility budget in section 12.7 passes in CI.

- 8 of 10 participants complete 4 of 5 core tasks unassisted in each language.

- French page count equals English page count. Zero missing strings.

- A test that renders a figure without provenance fails the type check.

- A test that renders an unknown value produces an en dash and a reason, never a zero.

## Phase 4. Provincial enhancement: British Columbia and Quebec

| Field | Detail |
| --- | --- |
| Duration | 8 weeks |
| Goal | Add enhanced local records where the coverage supports them. |

### Work

- Ingest British Columbia cutblocks, harvesting authority, Vegetation Resources Inventory, consolidated cutblocks and forest operations map.

- Implement the FTA 4.0 life cycle status rule from section 5.3 and test it explicitly.

- Ingest Quebec ecoforestry mapping with disturbances and the inventory result tables.

- Implement the matching algorithm from section 6.4 and publish its parameters as part of the method version.

- Implement the precedence hierarchy from section 6.5.

- Populate land tenure class and event subtype, with undetermined where the source cannot tell.

- Turn on enhanced coverage grades, bounded by the coverage geometry, not by province.

### Checkpoint

Provincial reviewers, one per province, confirm the product represents their data correctly. This checkpoint requires an outside reviewer.

### Exit criteria

- A PENDING or uncorroborated ACTIVE cutblock never renders as recorded harvest. Proven by a test with a fixture of each status.

- North of the 52nd parallel in Quebec grades as national baseline, not enhanced. Proven by a coverage query.

- Match rate, non-match rate and the distribution of non-match reasons are published on the methods page.

- Salvage, partial cut and thinning are distinguished where the source supports it, and marked undetermined where it does not.

## Phase 5. Live wildfire

| Field | Detail |
| --- | --- |
| Duration | 4 weeks |
| Goal | Ship current fire context, on schedule, with freshness and routing that cannot be removed. |

### Work

- Build the four times daily scheduled job with the DST-safe gate from section 8.2.

- Build the snapshot store and the permanent retention policy.

- Build the freshness stamp, the agency routing component and the degraded state banner.

- Build the failure handling matrix from section 8.5.

- Build fire impact summaries as derived estimates, with the perimeter is not a damage map statement.

### Checkpoint

Operations rehearsal. Simulate a source outage, a schema change and a stale feed. Confirm each produces the specified behaviour, not a blank map.

### Exit criteria

- The scheduled job runs exactly four times daily in both halves of the year, verified across a daylight saving transition.

- The route test asserting the five display requirements blocks a deploy when one is removed.

- A simulated 25 hour stale feed replaces the live view with a static notice and the agency link.

- Snapshots for a full simulated season are retained and queryable.

## Phase 6. Accounts, saved areas and alerts

| Field | Detail |
| --- | --- |
| Duration | 5 weeks |
| Goal | Ship the return visit, with the privacy and safety controls that come with it. |

### Work

- Accounts, saved areas, alert preferences and language preference.

- Alert triggers from section 10.2, correction alerts first.

- Row level security, encryption at rest and the deletion flow.

- Rate limits, caps and duplicate suppression.

- The kill switch, and a rehearsal of using it.

- Bilingual email templates, reviewed, not machine translated.

### Checkpoint

Privacy review sign-off, plus a live test of the kill switch and the deletion flow by someone who did not build them.

### Exit criteria

- One account cannot read another account’s saved areas, proven by a test that attempts it directly against the database.

- Account deletion removes saved areas and personal data within 30 days, proven by a test.

- The kill switch stops all outbound alerts within 5 minutes.

- Every alert template carries its evidence class, data version, source agency and observation time.

- A correction to a published figure produces a correction alert to everyone previously notified.

## Phase 7. Indigenous geographies, explore map and comparison

| Field | Detail |
| --- | --- |
| Duration | 6 weeks |
| Goal | Ship the map, the remaining boundary layers and comparison. |

### Work

- Ingest reserve, treaty and agreement boundaries with correct names and diacritics.

- Build reserve and treaty place pages with the safeguards in section 11.4 and the right of reply component.

- Build the explore route: MapLibre, PMTiles, four view modes, boundary overlays, native range time control, map and list toggle.

- Build two at a time comparison.

- Build the ranked riding table with the section 9 safeguards and the generated share image.

### Checkpoint

Engagement checkpoint. Confirm that every nation whose reserve or treaty area appears has been written to and offered a briefing and a right of reply, before the pages go live.

### Exit criteria

- Every reserve and treaty page carries a right of reply route and the section 11.4 language.

- The ranked table component rejects a non-riding place type at the type check.

- Every ranked row shows the normalised value, the absolute value, forested hectares and the coverage grade.

- Rows with insufficient coverage appear in a separate labelled section and are not ranked.

- The generated share image contains the time range, boundary edition, data version and denominator.

- The explore route passes its JavaScript budget and its keyboard pass.

## Phase 8. Launch readiness

| Field | Detail |
| --- | --- |
| Duration | 6 weeks |
| Goal | Close everything that a public launch exposes. |

### Work

- Full bilingual review by a professional translator with subject matter review.

- Full accessibility audit against WCAG 2.2 AA and EN 301 549, by someone outside the build team.

- Security review, including the account system and the alert sender.

- Load test at 50 times normal traffic, which is the news cycle case.

- Publish the decision log, the corrections log, the release notes and the citation format.

- Operational runbook, on-call rota for fire season, and the escalation route.

- Bulk downloads and the reproducibility test from section 15.2.

### Checkpoint

Go or no-go, chaired by the editorial board, against the eight success tests in section 3.3. Any failed test is a no-go for that surface, not for the whole product. Ship the surfaces that pass.

### Exit criteria

- All eight success tests in section 3.3 pass.

- Zero critical accessibility defects. Zero critical French defects.

- The load test holds with the CDN in place.

- A published figure is reproduced from the raw archive and matches.

- The on-call rota is staffed and tested.

## Phase 9. Public beta, then launch

| Field | Detail |
| --- | --- |
| Duration | 8 weeks |
| Goal | Learn in public with a limited audience before the general launch. |

### Work

- Invite provincial agencies, researchers, journalists and the engagement contacts to a public beta.

- Run the corrections process for real and publish the first quarterly correction metrics.

- Fix what beta finds. Hold the gates.

- Launch.

- Begin Alberta and Ontario enhancement as the first post-launch workstream.

### Checkpoint

Beta review. Correction volume, correction cause analysis and the first real read on whether the evidence framework survives contact with readers.

### Exit criteria

- Median correction resolution time is inside the section 14.3 service levels.

- No unresolved critical correction at launch.

- At least one source agency has reviewed its own data as presented and confirmed it.

- The quarterly reproducibility test passes.

## 16.1 Schedule summary

| Phase | Weeks | Cumulative | Runs in parallel with |
| --- | --- | --- | --- |
| 0. Foundations and definitions | 4 | 4 | Nothing. This blocks everything. |
| 1. Data acquisition and ledger | 6 | 10 | Front-end step 1 can start in week 8. |
| 2. National baseline pipeline | 8 | 18 | Phase 3 |
| 3. Front end and place pages | 8 | 18 | Phase 2 |
| 4. BC and Quebec enhancement | 8 | 26 | Phase 5 can start in week 22. |
| 5. Live wildfire | 4 | 28 | Phase 4 |
| 6. Accounts and alerts | 5 | 33 | Nothing |
| 7. Indigenous geographies, map, comparison | 6 | 39 | Nothing |
| 8. Launch readiness | 6 | 45 | Nothing |
| 9. Public beta and launch | 8 | 53 | Nothing |

Fifty-three weeks to public launch with the team in section 19, assuming no source acquisition blocks and no scope added. Alberta and Ontario enhancement follows launch and adds roughly 12 weeks.

# 17. Build checklist

Every item has its own acceptance test. Version 1 of this plan repeated one sentence 18 times, which meant the build had no acceptance criteria. An item is done when its test passes, not when someone says it is done.

## Definitions and framework

| Item | Done when |
| --- | --- |
| Forest definition adopted and published | The glossary shows the National Forest Inventory definition in both languages, and every percentage in the product links to it. |
| Evidence classes implemented | A unit test asserts every reported value carries one of the four classes and that a value without one fails the type check. |
| Confidence rules implemented | Each rule has an identifier, and a test asserts every rule generates a bilingual explanation sentence. |
| Conflicting evidence wording locked | A lint rule fails the build on the words unexplained, unreported, undocumented and illegal in claim templates. |
| Coverage geometry built | A query returns a coverage grade for any point in the four provinces, and Quebec north of 52 returns national baseline. |
| Denominator rules implemented | A test asserts no aggregate divides by total land area, and that every aggregate carries its boundary edition. |

## Data

| Item | Done when |
| --- | --- |
| Source ledger complete | The ingestion job rejects a dataset missing any required ledger field, proven by a test fixture. |
| Raw archive immutable | A test asserts a second retrieval writes a new prefix and never overwrites the first. |
| NTEMS baseline processed | Annual forest mask and change layers exist for every year from 1984 to the recorded end year, for four provinces. |
| Harvest matching implemented | A fixture with a known overlap of 60 percent matches, and one with 40 percent does not, at the documented tolerance. |
| FTA life cycle rule implemented | Fixtures with PENDING, ACTIVE and RETIRED status render as planned, authorised and recorded harvest respectively. |
| Precedence hierarchy implemented | A fixture where fire and harvest overlap in the same year counts the hectare once and attributes it to fire, while retaining both records. |
| Land tenure class populated | A query returns Crown, private, federal, reserve or unknown for every event, with a published share of unknown per province. |
| Event subtype populated | Salvage, partial cut and thinning are distinguishable where the source supports it, and undetermined elsewhere, proven by a per-province count. |
| Boundary editions retained | A result computed on the 2023 Representation Order still reproduces after a new boundary edition is loaded. |
| Validation suite green | A deliberately corrupted dataset fails schema, geometry, date and duplicate checks. |

## Front end

| Item | Done when |
| --- | --- |
| Token layer and both themes | Every colour in the product resolves from a token, proven by a lint rule banning raw hex in components. |
| Policy components shipped | A component that renders a Figure without provenance does not compile. |
| Unknown renders as an en dash | A test renders an Unknown and asserts the output contains an en dash and a reason, and never the character zero. |
| Place page template complete | One fixture renders coverage band, tiles, chart, sources and downloads, in both locales, under the JavaScript budget. |
| Place pages generated | All eight geography types across four provinces exist at static URLs in both locales, and the counts match between locales. |
| Location result permalink | A coordinate URL renders the full dated event sequence server side, with JavaScript disabled. |
| No-JavaScript path | Playwright loads a place page with JavaScript disabled and finds every figure and its provenance. |
| Table equivalent everywhere | Every spatial view returns a table at the same URL with a view parameter, proven by a route test. |
| Native time control | The explore time control is an input of type range, and a keyboard test steps year by year with arrow keys. |
| Greyscale legibility | Snapshot tests render every legend under a greyscale filter and assert every class is distinguishable by shape or texture. |
| Reduced motion respected | Play through advances without camera animation when the reduced motion preference is set. |
| Budgets enforced | CI fails a pull request that pushes place page JavaScript over 100 KB or the explore route over 400 KB. |

## Wildfire

| Item | Done when |
| --- | --- |
| Four daily refreshes | A log shows exactly four successful runs per day at 05:00, 12:00, 16:00 and 21:00 Pacific, verified across a daylight saving change. |
| Freshness stamps | A route test asserts all five elements from section 8.4 on every wildfire route and blocks the deploy if one is missing. |
| Snapshots retained | Every refresh writes a new immutable snapshot, and a query returns the perimeter history for a named fire. |
| Degraded state works | Two simulated consecutive failures produce the banner and the agency link, not a blank map. |
| Stale cut-off works | A simulated 25 hour old feed replaces the live view with a static notice. |
| No prediction language | A lint rule fails the build on forecast, spread rate and predicted in wildfire templates. |

## Accounts and alerts

| Item | Done when |
| --- | --- |
| Saved areas isolated | A direct database query as one account returns zero rows from another account’s saved areas. |
| Deletion works | A deletion request removes the account, saved areas and personal data within 30 days, proven by an integration test. |
| Correction alerts work | Restating a figure a subscriber was notified about produces a correction alert to that subscriber. |
| Kill switch works | A timed rehearsal stops all outbound alerts in under 5 minutes. |
| Caps enforced | Attempting a 26th saved area or an oversized radius is refused with a clear bilingual message. |
| Bilingual alerts | Every template exists in both languages and a test asserts no untranslated string reaches the sender. |

## Comparison and ranking

| Item | Done when |
| --- | --- |
| Normalisation forced | The ranked table cannot be sorted by absolute hectares alone, proven by a component test. |
| Context on every row | Every row renders the normalised value, the absolute value, forested hectares and the coverage grade. |
| Insufficient coverage separated | A riding with insufficient coverage appears in the labelled section below the table, not ranked as zero. |
| Screenshot rule met | The generated share image contains the time range, boundary edition, data version and denominator, verified by an image snapshot test. |
| Ranking scope enforced | Passing a reserve or treaty place type to the ranked table is a type error. |
| Neutral headers | A lint rule fails the build on worst, best, top and destruction in comparison column headers. |

## Indigenous geographies

| Item | Done when |
| --- | --- |
| Reserve and treaty layers loaded | Every reserve and treaty area in the four provinces has a page with the correct name and diacritics, checked against the federal source. |
| Right of reply live | Every reserve and treaty page carries a working right of reply route with a named recipient. |
| Minimum area rule | A reserve below the area threshold shows the raw record and declines to publish a rate, proven by a fixture. |
| Engagement register published | A public register lists contacts made and responses received, respecting confidentiality requests. |
| No ranking | A test asserts no ranked view accepts an Indigenous geography type. |
| Name request recorded | The Mistik request, its terms, its honorarium and its outcome appear in the decision log and the engagement register, whatever the answer. |

## Governance and launch

| Item | Done when |
| --- | --- |
| Corrections log live | A test correction appears publicly in both languages within the class service level. |
| Decision log published | Every decision in section 2 appears in the public decision log with its date and reason. |
| Attribution dispute route | A test dispute is acknowledged within 1 business day and resolved within 10. |
| Reproducibility proven | A random published figure is recomputed from the raw archive and the recorded method version, and matches. |
| Accessibility audited | An external audit reports zero critical WCAG 2.2 AA defects across all four templates. |
| Load tested | The site holds at 50 times normal traffic with the CDN in place. |
| Rename costs one commit | A dry run changes the name token, regenerates every share image and asset, and leaves no surface carrying the old name. No persistent identifier changes. |

# 18. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A wrong organisation attribution reaches publication | Medium | Severe | The rules in section 14.2, the FTA life cycle rule, manual review of large events, the dispute route with a 10 day resolution, and legal review before launch. |
| Live wildfire data is stale during a fast moving fire and someone relies on it | Medium | Severe | The five mandatory display elements, the stale cut-off at 24 hours, agency routing above Witness Tree content, and language that never sounds like emergency direction. |
| A ranked riding table is screenshotted without its context | High | Moderate to severe | Context inside the table header, a method line inside the container, and a generated share image with everything burned in. This is a residual risk you accepted knowingly. |
| Detected change is read as logging | High | Moderate | Evidence classes, the section 4.6 wording rule, the non-match reason distribution published on the methods page, and a lint rule on the banned words. |
| A source changes licence, schema or access | Medium | Moderate | Immutable raw archive, schema drift hard stop, ledger with redistribution terms, and a one business day removal process with a bilingual release note. |
| NTEMS end year lags the current year | High | Moderate | Show the real end year on every affected page. Never extrapolate. Use provincial records and fire data for the recent window and grade coverage accordingly. |
| French parity slips under deadline | High | Moderate | A missing French string fails the build. Parity is a release gate, not a backlog item. |
| Scope grows during the build | High | Moderate | Section 1.3 non-goals, section 2 locked decisions, and a change control route through the editorial board. |
| An Indigenous government objects to how their lands are represented | Medium | Severe | Parallel engagement from Phase 1, right of reply on every page, a 10 business day correction service level, no ranking, and a standing offer to revisit. |
| An alert goes out wrong during fire season | Medium | Severe | The kill switch, duplicate suppression, per day caps, verified email addresses, and a correction alert within one business day. |
| Traffic spike from a news cycle takes the site down | Medium | Moderate | Static place pages, immutable tiles, CDN caching, and a 50 times load test before launch. |
| Attribution matching parameters are quietly changed and numbers move | Medium | Moderate | Matching parameters are part of the published method version. A change triggers recomputation and a release note. |

# 19. Resourcing

Estimates for planning. Confirm at Phase 0 against real rates.

| Role | Count | Engaged | Why |
| --- | --- | --- | --- |
| Product and editorial lead | 1 | Full time, all phases | Owns the evidence framework, the language and the go or no-go. |
| Geospatial data engineer | 2 | Full time, Phases 1 to 7 | Raster and vector pipelines, matching, aggregation, tiles. |
| Remote sensing specialist | 1 | Full time, Phases 1 to 5, then part time | NTEMS handling, validation against independent products, accuracy statements. |
| Back-end engineer | 1 | Full time, Phases 2 to 8 | Event store, accounts, alerts, scheduled jobs, security. |
| Front-end engineer | 2 | Full time, Phases 3 to 8 | The stack in section 12.6, budgets, accessibility. |
| Designer | 1 | Full time to Phase 4, then part time | Templates, tokens, both themes, share images. |
| Bilingual content lead | 1 | Full time, Phases 3 to 9 | Glossary, methods, translation coordination, plain language. |
| Indigenous engagement lead | 1 | Part time from Phase 0, full time Phases 6 to 9 | Section 11.3. This is a relationship role, not a compliance role. |
| QA and accessibility specialist | 1 | Part time to Phase 6, full time Phases 7 to 9 | Section 15. |
| Provincial reviewers | 4 | Contract, at Phase 4 and Phase 8 | One per province. External review is the point. |
| Legal counsel | 1 | Contract, Phases 0, 6 and 8 | Defamation, licensing, privacy, terms. |
| Professional translation | Vendor | Phases 3 to 9 | Subject matter review, not machine output. |

Core team of about 10 full time equivalents for 53 weeks, plus contract reviewers, legal and translation. Infrastructure is a small line next to salaries. Object storage, a CDN, a managed Postgres, a transactional email provider and a hosted Earth observation platform for processing. Budget the processing platform carefully. It is the one line that can move by an order of magnitude depending on how much you reprocess.

If the team is smaller, cut scope in this order and say so publicly: Alberta and Ontario enhancement, then the explore map, then ranked comparison. Do not cut the evidence framework, the bilingual gate, the accessibility gate or the corrections process. Those are what make the product worth building.

# 20. Instructions to Codex

This section is written for the build agent. Follow it exactly.

## 20.1 Repository

- Create a GitHub repository named Witness_Tree under the account at https://github.com/chinonsoobeta.

- Make it public.

- Initialise with a README that states the purpose, the four provinces, the 1984 record start, the licences of the data sources, and a link to the live site.

- Add a LICENSE for the code and a separate DATA_LICENSES.md that records every data source licence and its required attribution string.

- Commit this implementation plan to docs/ in the repository, as the build specification.

- Use conventional commits and require a pull request for every change to main.

- Turn on branch protection on main, with CI required to pass before merge.

- Add CI that runs the type check, the lint rules named in section 17, the tests, the bilingual pair check and the performance budgets.

## 20.2 Hosting and access

- Build and publish the webapp as a ChatGPT-hosted website.

- Make the site public to anyone with the link. No sign-in wall on public content.

- Give Claude Code access to the site, so it can fetch pages, read the rendered output and verify the build.

- Put the public URL in the repository README and in the repository About field, so the link is discoverable from the code.

- If the hosting environment cannot serve a required capability, do not silently drop it. Record the limitation in the README, implement the closest working alternative, and say which capability was affected.

## 20.3 The scheduled jobs constraint

A hosted static site cannot run a cron job. The four times daily wildfire refresh must therefore run outside the site.

- Put the refresh job in the Witness_Tree repository as a GitHub Actions workflow.

- Set the cron to 0 0,4,5,12,13,19,20,23 on every day. That covers both daylight saving offsets.

- At the start of the job, read the current hour in the America/Vancouver time zone. If it is not 5, 12, 16 or 21, exit successfully and do no work.

- On a real run, fetch each provincial and national wildfire source, write a timestamped immutable snapshot, and write a small static JSON file that the site reads.

- Commit the static JSON to the repository, or publish it to object storage the site can read. Either way it must be versioned and the previous version must remain addressable.

- Record the run time, the source response times and any failures in a run log the site can display.

- On failure, follow section 8.5. Do not let a failed run publish an empty file.

Apply the same pattern to any other scheduled work: annual data releases, digest alerts and the reproducibility test. The site stays static. The schedule lives in the repository, where it is versioned and auditable.

## 20.4 Delegation to sub-agents

Delegate as much of the build as possible. Use GPT 5.6 Terra sub-agents at medium reasoning.

- One sub-agent per bounded unit of work. A unit is one checklist item from section 17, or one tightly related group of them.

- Give each sub-agent the relevant plan sections, the exact acceptance test from section 17, and the files it may change. Nothing more.

- Never give two sub-agents overlapping write access to the same files in the same run.

- Run independent units in parallel. Run dependent units in order.

- Every sub-agent must return: what it changed, the test it ran, the test output, and anything it could not do.

- A sub-agent that cannot meet its acceptance test must say so and stop. It must not lower the test.

### Good units to delegate

- Each policy component in section 12.5, with its type tests.

- Each lint rule named in section 17.

- The place page template, then place page generation.

- Each ingestion adapter, one per dataset in section 5.

- The matching algorithm from section 6.4, with its fixtures.

- The wildfire workflow and its DST gate.

- Each alert trigger from section 10.2.

- The ranked table component and its share image test.

- The bilingual pair check and the MDX content pipeline.

### Do not delegate

- The forest definition, the evidence classes and the confidence rules. These are the spine and they need one consistent author.

- Any wording that appears in a public claim. Wording drift is how a neutral product becomes an accusatory one.

- The Indigenous geography content and its safeguards.

- Any decision that changes a published number.

## 20.5 Audit after every sub-agent

Audit each sub-agent work as soon as it finishes. Do not batch audits and do not accept a summary as evidence.

- Read the actual diff. Do not rely on the sub-agent’s description of what it did.

- Run the acceptance test yourself, from a clean state. A test that only passes in the sub-agent’s session does not count.

- Check the negative case. If the item says a bad input must fail, feed it a bad input and confirm it fails.

- Check for scope drift. Any file changed that was not in the assignment is a finding.

- Check the plan rules the unit touches: evidence class present, provenance attached, no bare zero, both languages present, no banned wording.

- Check that no test was weakened, skipped or deleted to make the unit pass.

- Record the result in an audit log in the repository: unit, sub-agent, verdict, evidence, and any follow-up.

- On a fail, send it back with the specific failure. Do not fix it silently, because that hides a pattern you need to see.

| The audit rule that matters most. A sub-agent that reports success and did not run the test is the failure mode to watch for. Re-run every acceptance test yourself, from a clean checkout, before you accept a unit. If you cannot run it, the unit is not accepted. |
| --- |

## 20.6 Definition of done for the first Codex deliverable

- The Witness_Tree repository exists, is public, and contains this plan in docs/.

- CI runs and passes on an empty scaffold, including the type check, lint, tests and the bilingual pair check.

- The token layer, both themes and the policy components from section 12.5 exist with passing tests.

- A component gallery is published at the public site URL and Claude Code can fetch it.

- The wildfire workflow exists, runs on the correct schedule, and its DST gate is proven by a test.

- An audit log exists with one entry per delegated unit.

- The README states the public URL, the licences, the current data end year, and what the product does not claim.

# Appendix A. Source index

Every URL cited in this plan, in one place. Verify each at Phase 1 and record the retrieval date in the source ledger.

| Source | URL |
| --- | --- |
| NTEMS programme access | https://opendata.nfis.org/mapserver/nfis-change_eng.html |
| NTEMS description, UBC IRSS | https://irsslab.forestry.ubc.ca/research/ntems-national-terrestrial-ecosystem-monitoring-system/ |
| Annual forest land cover, 1984 to 2022 | https://open.canada.ca/data/en/dataset/2785c103-9c2d-429b-9f3d-89f5cd9ea94d |
| CA Forest Harvest, 1985 to 2022 | https://open.canada.ca/data/en/dataset/87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe |
| Forest canopy cover, 2022 | https://open.canada.ca/data/en/dataset/5b905ab8-44dc-42b4-ad5b-3b1dde8423ab |
| Forest canopy height, 2022 | https://open.canada.ca/data/en/dataset/016d2624-30b4-45f3-87d7-30b06c6a30ca |
| Canadian Wildland Fire Information System | https://cwfis.cfs.nrcan.gc.ca/ |
| CWFIS datamart, burned area and fire database | https://cwfis.cfs.nrcan.gc.ca/datamart |
| BC Data Catalogue | https://catalogue.data.gov.bc.ca/ |
| BC Forest Tenure Cutblock Polygons, FTA 4.0 | https://catalogue.data.gov.bc.ca/dataset/forest-tenure-cutblock-polygons-fta-4-0 |
| BC Forest Tenure Harvesting Authority Polygons | https://open.canada.ca/data/dataset/cff7b8f7-6897-444f-8c53-4bb93c7e9f8b |
| Alberta Vegetation Inventory, Crown | https://open.canada.ca/data/en/dataset/64b0e73a-da5f-4f7f-bca1-b656b6e86c94 |
| AVI Crown post inventory harvest areas | https://catalogue.arctic-sdi.org/geonetwork/srv/api/records/da07e4d0-bf30-45a8-b0d2-a6fcb3939a7a |
| Alberta Primary Land and Vegetation Inventory | https://geodiscover.alberta.ca/geoportal/rest/metadata/item/2d41d0e64a844a2fbf4485525e17178f/html |
| Alberta vegetation inventory standards | https://open.alberta.ca/publications/alberta-vegetation-inventory-standards |
| Alberta open data | https://open.alberta.ca/opendata |
| Ontario Forest Resources Inventory | https://geohub.lio.gov.on.ca/pages/forest-resources-inventory |
| Ontario FRI Term 2, 2018 to 2028 | https://open.canada.ca/data/en/dataset/c4760737-da46-4653-bdf1-b87957260886 |
| Ontario GeoHub | https://geohub.lio.gov.on.ca/ |
| Ontario First Nation Reserve | https://geohub.lio.gov.on.ca/datasets/first-nation-reserve/about |
| Québec, Carte écoforestière avec perturbations | https://www.donneesquebec.ca/recherche/dataset/carte-ecoforestiere-avec-perturbations |
| Québec, Carte écoforestière originale et résultats courants | https://ouvert.canada.ca/data/fr/dataset/a232475f-ec3d-476a-8725-d0c12367b3f0 |
| Québec, Carte écoforestière, quatrième inventaire | https://ouvert.canada.ca/data/fr/dataset/77ec9009-b733-4f09-ade3-99d7b2156ad4 |
| Données Québec | https://www.donneesquebec.ca/ |
| SOPFEU | https://sopfeu.qc.ca/ |
| Federal Electoral Districts, 2023 Representation Order | https://app.geo.ca/en-ca/map-browser/record/18bf3ea7-1940-46ec-af52-9ba3f77ed708 |
| Electoral geography boundary files, 45th general election | https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05 |
| Elections Canada maps and boundary descriptions | https://www.elections.ca/map_01.aspx?w=0&section=res&lang=e |
| Indian Reserve boundaries | https://open.canada.ca/data/en/dataset/79671bf3-706a-47df-9ebd-d4789ce957e8 |
| First Nation Reserve | https://open.canada.ca/data/en/dataset/80e642cc-c153-4b6d-9b10-92f4d4aaff4e |
| First Nations Location | https://open.canada.ca/data/en/dataset/b6567c5c-8339-4055-99fa-63f92114d9e4 |
| Historic treaties | https://open.canada.ca/data/en/dataset/f281b150-0645-48e4-9c30-01f55f93f78e |
| Modern treaties | https://open.canada.ca/data/en/dataset/be54680b-ea62-46f3-aaa9-7644ed970aef |
| Indigenous agreements | https://open.canada.ca/data/en/dataset/82cad281-ff7d-47b3-b2ce-9f794257e86d |
| ATRIS, reference only | https://sidait-atris.rcaanc-cirnac.gc.ca/SIDAIT-GEO-ATRIS/index-eng.html |
| Native Land Digital, education reference only | https://native-land.ca/ |
| GitHub account for the build repository | https://github.com/chinonsoobeta |

# Appendix B. Glossary seed

Start the bilingual glossary with these. Every entry needs an approved French pair before it can appear in the product.

| Term | Plain language definition |
| --- | --- |
| Forest | Land of at least 1 hectare, with at least 10 percent crown closure, carrying trees able to reach 5 metres at maturity. This product uses the Canada National Forest Inventory definition. |
| Detected change | A reduction in tree cover seen in satellite imagery between two years. It does not say what caused the change. |
| Recorded harvest | An official record from a province showing that trees were cut at this location. |
| Cutblock | An area a province has recorded for harvesting. A recorded cutblock is not always a harvested cutblock. Check the life cycle status. |
| Fire perimeter | The outer boundary an agency reports for a fire. It is not a map of damage. Unburned patches are common inside a perimeter. |
| Salvage harvest | Cutting trees that have already been killed by fire or insects. In satellite data it looks like ordinary harvest. |
| Evidence class | One of four labels on every claim: official record, satellite observation, derived estimate, or unknown. |
| Coverage grade | How much detailed record the product holds for an area. Coverage varies inside a province, not only between provinces. |
| Denominator | The forested hectares a percentage is divided by. Always stated with the number. |
| Unmatched change | Detected change with no matching official record in Witness Tree. It does not mean illegal, unreported or unexplained. |
| Boundary edition | The version of a boundary used for a calculation. Ridings and other boundaries change over time. |
| NTEMS | The National Terrestrial Ecosystem Monitoring System. Annual satellite mapping of Canadian forests from 1984, produced by the Canadian Forest Service with the University of British Columbia. |
| Recovery indicated | Later imagery shows increasing canopy. That is not the same as recovered forest structure, species mix or habitat value. |
| Method version | The recorded version of the rules used to produce a number. Change the rules and the numbers are recomputed and the change is published. |

End of the implementation plan.
