# Phase 1 production-source exit audit

**Audit date:** 2026-08-14 (Pacific)  
**Base:** `phase1/integration-convergence` at `b729bc0f02fe5104279064878ab013ff9f8fe406`.  
**Authority:** plan section 5, Appendix A, and Phase 1 exit criteria in the extracted [implementation plan](../specification/Witness%20Tree%20Implementation%20Plan.docx).  
**Method:** read-only inspection of the base, all named source branches/commits, and the external staging tree. A blocked request, catalogue/service inspection, candidate, or supporting file is not counted as acquired production data.

## Strict result

The inventory contains **31** `planUse: production` rows. **Eight rows have checksum-bound, raw acquisition and read-only profile evidence; 23 do not. No row has a complete production ledger entry, and no row is ingested or production eligible.** The Phase 1 checkpoint therefore does not pass.

The audit reviewed `d63dd2f` (BC harvesting authority), `67900d3` (Ontario FRI Term 2), `daec65e` (SOPFEU), `22c2427` (BC VRI), `5f756b9`/`a25d16e` (BC BEC/TAP), `150a209` (Alberta historical wildfire), `9f228d6` (canopy height), the NFDB profile integrated at `9c82597`, the Elections records integrated from `d53be9f`/`1df58ac`, and archive-control evidence through `37e47ee`. The Québec current-ecoforest branch is still in progress and is not counted: its current head contains a proposed profile/coverage workflow, not a completed, integrated source record.

## Exact production-row reconciliation

`Acquired/profiled` below means the row receives the raw-evidence credit used in the progress calculation. `Partial/supporting` records real evidence but does not close the named row.

| # | Production row | Strict state | Remaining gap |
| ---: | --- | --- | --- |
| 1 | `ntems-annual-land-cover` | **Acquired/profiled.** 39 VLCE2 annual files have archive/profile evidence. | Complete ledger and explicit ingestion/release approval. |
| 2 | `ntems-forest-harvest` | **Acquired/profiled.** Exact local ZIP, checksum, integrity, and raster/value-table profile. | Ledger, immutable/recovery decision, ingestion/release; retain catalogue-link discrepancy. |
| 3 | `ntems-canopy-cover` | **Acquired/profiled.** Checksum-bound archive/profile evidence. | Complete ledger and explicit ingestion/release approval. |
| 4 | `ntems-canopy-height` | **Acquired/profiled.** `9f228d6` records the 10,347,564,066-byte SHA-256-bound ZIP and profile. | Ledger, immutable/recovery decision, ingestion/release. |
| 5 | `cwfis-current` | Unaddressed. | Select authoritative live endpoint, terms, cadence, snapshots and retention. |
| 6 | `cwfis-historical` | Partial/supporting only. NFDB is acquired/profiled, but the required burned-area-plus-fire-database row is not complete. | Select/acquire the missing required historical component and complete ledger/archive evidence. |
| 7 | `bc-wildfire` | Unaddressed. | Current authoritative service, terms, cadence and snapshot/archive contract. |
| 8 | `ab-wildfire` | Partial/supporting only. `150a209` is a historical CSV, explicitly not a current feed. | Current operational feed, refresh contract, archive, profile and ledger. |
| 9 | `on-fire-disturbance` | Unaddressed. | Exact layer, rights, cadence, archive/profile and ledger. |
| 10 | `sopfeu` | Blocked, not acquired. `daec65e` records unresolved written reuse terms. | Written reusable terms before any acquisition/integration. |
| 11 | `bc-fta-cutblocks` | Blocked, not acquired. Official catalogue/service only. | Coherent publisher export, version, checksum, profile and lifecycle approval. |
| 12 | `bc-harvesting-authorities` | Blocked, not acquired. `d63dd2f` is an access block. | Publisher-authorized snapshot and normal source evidence. |
| 13 | `bc-vri` | Blocked, not acquired. `22c2427` verifies access limits. | Authorized raw snapshot, terms, coverage, checksum and profile. |
| 14 | `bc-consolidated-cutblocks` | Blocked, not acquired. Access Only terms preclude staging. | Redistributable licence/authorization, then acquisition/profile. |
| 15 | `bc-old-growth-bec` | Blocked, not acquired. `5f756b9`/`a25d16e` exclude incomplete BEC/TAP artifacts. | Complete publisher snapshot, terms, version and profile. |
| 16 | `bc-forest-operations-map` | Unaddressed. | Licence, lifecycle semantics, versioned snapshot and profile. |
| 17 | `qc-current-ecoforest` | In progress, not counted. External working files and the QC branch do not yet establish an integrated completed source record. | Complete source/archive/profile/ledger and admitted scope decision. |
| 18 | `qc-original-current-inventory` | Unaddressed. | Exact resource, edition, checksum, archive/profile and ledger. |
| 19 | `qc-fourth-inventory` | Unaddressed. | Exact resource, edition, checksum, archive/profile and ledger. |
| 20 | `ab-avi-crown` | **Acquired/profiled.** Raw archive/profile and remote archive evidence exist; still non-production. | Complete ledger, quarantined-feature decision, ingestion/release. |
| 21 | `ab-avi-post-harvest` | **Acquired/profiled.** The same verified AVI FGDB contains the post-inventory-harvest layer and its profile. | Complete ledger, layer-specific release/ingestion decision. |
| 22 | `ab-primary-land-vegetation` | Unaddressed. | Exact dataset/version, terms, archive/profile and ledger. |
| 23 | `on-fri` | Unaddressed. Ontario FMU is supporting context, not FRI. | FRI access, terms, edition, archive/profile and ledger. |
| 24 | `on-fri-term-2` | Blocked, not acquired. `67900d3` records request-based access and unresolved rights. | Authorized access, rights, checksum/archive/profile and ledger. |
| 25 | `fed-2023-ridings` | **Acquired/profiled.** The current 45th-election archive supersedes the named 2023 representation-order use and is version/profile-bound. | Complete ledger, immutable/recovery and ingestion/release approval. |
| 26 | `elections-canada-45th-files` | **Acquired/profiled.** Exact 2025 SHP ZIP, OGL attribution, checksum, ZIP/schema/bilingual profile. | Promotion remains blocked; then ledger/ingestion/release. |
| 27 | `provincial-electoral-boundaries` | Partial/supporting only. BC and Ontario evidence is staged/profiled, but Alberta is rights-blocked and Québec is edition-gated. | Four authoritative current editions with licences, effective dates, archives and profiles. |
| 28 | `indian-reserves` | Unaddressed. Candidate/gate work is not a raw boundary acquisition. | Version, terms, checksum/archive/profile and engagement-safe release conditions. |
| 29 | `first-nation-reserves` | Unaddressed. | Version, terms, checksum/archive/profile and engagement-safe release conditions. |
| 30 | `historic-treaties` | Unaddressed. | Version, terms/caveats, checksum/archive/profile and engagement-safe release conditions. |
| 31 | `modern-treaties` | Unaddressed. | Version, terms/caveats, checksum/archive/profile and engagement-safe release conditions. |

Supporting data deliberately excluded from the eight-row credit includes the NFDB-only part of the combined CWFIS historical requirement, the Alberta historical-fire CSV, Québec historical-fire, FMA/FMUs, CPCAD, and partial provincial electoral files. They are real evidence where documented, but not substitutes for the named production row.

## Evidence-weighted Phase 1 progress

The established source-exit weighting is **ledger 45%, raw archive/refetch 30%, four-province coverage 15%, corrupted-input validation 10%**. The prior numeric scoring table is not present in the `b729bc0` base or any currently available ref; its provenance for this audit is the prior audit instruction, restated in the correction request that required this amendment. `docs/PLAN_GAP_MATRIX.md` is cited for the plan's rule that documentation does not increase progress, but it does not define these weights. This audit therefore preserves the supplied established weights rather than inventing replacements.

### Raw-evidence states

The raw criterion says every required raw file must be checksummed and either re-fetchable or restorable. Its 31-row denominator is scored by evidence state, not by a blanket acquisition label:

| State | Row credit | Meaning |
| --- | ---: | --- |
| Remote verified/archive-restorable | 1.00 | Exact raw artifact, checksum/profile, and recorded immutable remote evidence. |
| Local verified/re-fetchable | 0.75 | Exact local artifact, checksum/profile, and official re-fetch source; no remote recovery evidence. |
| Partial component or incomplete multi-authority requirement | 0.25 | Useful checksum-bound source evidence exists, but it does not yet satisfy the whole named row. |
| Candidate, request, blocked access/rights, or plan URL | 0.00 | No qualifying raw-file evidence. |

The resulting raw numerator is **7.50 / 31**: annual land cover 1.00; harvest 0.75; canopy cover 1.00; canopy height 0.75; CWFIS historical/NFDB component 0.25; AVI Crown 1.00; AVI post-harvest layer 1.00; each of the two federal-electoral rows 0.75; and the incomplete provincial-electoral bundle 0.25. The Alberta historical CSV, Québec historical fire, CPCAD, FMA/FMUs, and access-block records receive zero because they do not satisfy the named production row.

For coverage, the exit wording requires a layer covering all four provinces with a grade for every part of the land base. The current admission record has all four verified national-baseline geometries and Ontario's scope decision, but is formally `partial` because Québec's south-of-52 decision remains pending. The implementation's own complete condition divides this into six explicit evidence elements (four provincial baselines plus Ontario and Québec scope decisions), five of which are verified. This supports proportional evidence credit of **5/6**, while still correctly reporting that the exit does not pass.

| Exit criterion | Evidence numerator / denominator | Weight | Credit |
| --- | ---: | ---: | ---: |
| Complete ledger entry for every production dataset | 0 / 31 | 45 | 0.00 |
| Every required raw file checksum-bound and re-fetchable or restorable | 7.50 / 31 | 30 | 7.26 |
| Four-province coverage geometry and explicit scope decisions | 5 / 6 | 15 | 12.50 |
| Deliberately corrupted dataset fails validation | 1 / 1 | 10 | 10.00 |
| **Total** | **weighted evidence; no exit is fully complete** | **100** | **29.76%** |

Calculation: `(0/31 × 45) + (7.5/31 × 30) + (5/6 × 15) + (1/1 × 10) = 29.76%`. The formal rounded Phase 1 source-exit percentage is therefore **30%**.

Sensitivity: a binary, remote-only interpretation of the raw criterion yields 4/31 and **26.37%**; treating every locally verified/re-fetchable acquired/profiled row as full yields 8/31 and **30.24%**. The stable reported 30% uses the stated intermediate evidence states, does not treat blocks as data, and does not imply the Phase 1 exit has passed.

AWS evidence is credited only to the three records actually named in `data/immutable-promotions.json`; it does not make other sources immutable, and it never makes data production eligible.

## Next genuinely missing work

The highest-value legally downloadable missing source remains the CWFIS historical burned-area component needed to complete row 6, if its official edition/terms can be selected without treating NFDB as a substitute. If that is not a separate downloadable product, the next clear path is the approved Québec current-ecoforest completion already in progress; it must finish source profiling and scope admission before it receives any credit. No access-block document should be reclassified as acquisition.

No download, external message, archive write, retention action, transformation, ingestion, deployment, or production claim was made by this audit.
