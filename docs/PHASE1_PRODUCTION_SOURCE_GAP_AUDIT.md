# Phase 1 production-source gap audit

**Audit date:** 2026-08-14 (Pacific)  
**Authority:** plan sections 5, 5.9, 11.1 and Phase 1 exit criteria in [`Witness Tree Implementation Plan.docx`](specification/Witness%20Tree%20Implementation%20Plan.docx), reconciled with `phase1/integration-convergence` and the current source inventory.  
**Scope:** the 31 inventory records marked `planUse: production`. This is read-only evidence. “Staged” never means ingested or production-ready.

## Result

No production source satisfies the Phase 1 exit criteria. Five required source families have real local source evidence, but only the NTEMS annual land-cover series and canopy-cover archive have immutable-storage evidence; neither has ingestion or release approval. The current inventory understates the annual-land-cover, canopy-cover, and harvest facts and should be reconciled before treating it as a live status report.

`CPCAD` is an in-progress candidate, not a dataset required by plan section 5 or Appendix A; it is therefore not counted as a Phase 1 production-source gap. The locally staged Québec historical-fire archive and Alberta FMA/Ontario FMU supporting files likewise do not replace any required national/provincial production source.

## Dependency order and exact gaps

| Order | Required source(s) | Source/licence status | Acquisition / archive / profile / ledger status | Blocking gap |
| ---: | --- | --- | --- | --- |
| 1 | `ntems-annual-land-cover` | Official NRCan/NTEMS source; OGL Canada evidence recorded. | All 39 1984–2022 VLCE2 ZIPs are staged, read-only raster-profiled, and recorded as remotely verified with compliance retention. The planning inventory still says candidate-only, so it is stale. No production ledger or ingestion approval. | Reconcile inventory; record definitive current NTEMS end-year; complete source ledger/attribution and release approval. |
| 2 | `ntems-forest-harvest` | Official NRCan/Canadian Forest Service source; OGL Canada 2.0 and README citation verified. The catalogue’s harvest resource still points at a fire URL; the official NTEMS page and archive members establish the harvest identity. | Exact 247,945,479-byte ZIP exists in external local staging; SHA-256 `c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad`, ZIP test and read-only 30-m raster/value-table profile are verified. No immutable archive, integration or production ledger. | Immutable promotion and owner compute/ingestion/release approval; retain the publisher-link discrepancy. |
| 3 | `ntems-canopy-cover`, `ntems-canopy-height` | Canopy cover has NRCan/OGL Canada attribution evidence; height is candidate-only. | Cover ZIP is staged and remotely verified under retention; no profile/ingestion/release. Height has only a 10,347,564,066-byte HEAD observation. | Cover: ledger/release decision. Height: owner storage/compute approval, acquisition, checksum, archive and profile. |
| 4 | `cwfis-current`, `cwfis-historical` | Plan URLs only. Separately, NRCan `CA_Forest_Fire_1985-2022.zip` is OGL-verified historical change context, not a substitute for CWFIS historical perimeters/database or a live feed. | The separate wildfire ZIP exists in external staging (252,364,563 bytes, SHA-256 `725f3b582c87cb7c6f3fd397a523fba6621718ac59c68dc904cd1d849a9160c9`), passed ZIP integrity and has a read-only 30-m raster/value-table profile. It is not immutable or integrated. CWFIS itself has no selected endpoint, snapshot, archive/profile or ledger. | Promote/review the staged NRCan wildfire archive separately; select CWFIS active and perimeter/database feeds, verify terms/cadence/editions, then set snapshot retention. |
| 5 | `bc-wildfire`, `ab-wildfire`, `on-fire-disturbance`, `sopfeu` | BC/AB/ON plan URLs only; SOPFEU explicitly has unconfirmed reuse terms. | No selected endpoint, snapshot, archive/profile or ledger. | Per-province authoritative feed and refresh contract; written SOPFEU reuse terms before Québec integration. |
| 6 | `bc-fta-cutblocks`, `bc-harvesting-authorities`, `bc-vri`, `bc-consolidated-cutblocks`, `bc-old-growth-bec`, `bc-forest-operations-map` | Three partial candidates expose services, but licences/lifecycle semantics remain unresolved; VRI/consolidated/old-growth lack selected records. | No raw archive, profile or production ledger. | Verify licence and FTA lifecycle codes first; identify exact editions and coverage for the remaining four. |
| 7 | `qc-current-ecoforest`, `qc-original-current-inventory`, `qc-fourth-inventory` | Québec candidates have CC BY 4.0 catalogue evidence. | Current-map URL is known but is 12.4 GB and only HEAD-observed; other two lack direct resource selection. No archive/profile/ledger. | Owner storage/compute decision, exact file selection, acquisition and coverage polygon south of 52°N. |
| 8 | `ab-avi-crown`, `ab-avi-post-harvest`, `ab-primary-land-vegetation` | Crown AVI has OGL Alberta attribution evidence; other two plan URLs only. | Crown AVI staged, profiled and remotely verified; repair/quarantine evidence exists but ingestion remains blocked. Others have no raw archive/profile/ledger. | Decide disposition of quarantined AVI feature and archive lineage; select and acquire the two remaining layers. |
| 9 | `on-fri`, `on-fri-term-2` | Term 2 is request-based and carries an Electronic Intellectual Property notice; no confirmed open bulk licence. | No raw archive/profile/ledger. The known public items are web-map/explorer pages, not a data payload. | Obtain authorized access and resolve rights before acquisition; digitise managed-FMU coverage boundary after access. |
| 10 | `fed-2023-ridings`, `elections-canada-45th-files` | Current official Elections Canada 45th-election ZIP; OGL Canada 2.0 attribution verified. | Exact 10,301,648-byte SHA-256-bound archive staged and profiled (352 polygons/343 districts, bilingual fields); promotion remains intentionally blocked by archive controls. | Immutable-promotion approval/evidence, then explicit ingestion/release approval. |
| 11 | `provincial-electoral-boundaries` | No editions selected for BC, AB, ON or QC. | No raw archives, profiles or ledgers. | Four authority-specific editions, effective dates, licences, checksums and archive records. |
| 12 | `indian-reserves`, `first-nation-reserves`, `historic-treaties`, `modern-treaties` | Plan names federal catalogue sources, but no local licence/edition evidence has been recorded. | No raw archives, profiles or ledgers. | Verify exact open releases and caveats; acquire/profile only after engagement-safe presentation and right-of-reply operating requirements are ready. |

## Supporting facts that do not close a required-source gap

- `qc-historic-wildfire-detailed`: staged, profiled and remotely verified; it is useful Québec evidence but does not substitute for CWFIS historical or Québec ecoforest sources.
- `nrcan-ca-forest-wildfire-1985-2022`: staged and read-only profiled with the hash above; it is an additional acquired NRCan source that the plan inventory does not count as a distinct required production record, and it does not substitute for CWFIS current/historical operational sources.
- `alberta-fma-published-area` and `ontario-forest-management-units`: locally staged supporting coverage/context records; neither is a named production source in the plan.
- `canadian-protected-and-conserved-areas-database` (CPCAD): official December 2025 release is an unresolved candidate; it is not in the plan’s required production inventory.
- Indigenous reference records (`first-nations-locations`, `atris-reference`) remain reference-only. Asserted territory polygons and other explicitly excluded inputs remain non-analytic.

## Next source selection

**Select next, but do not acquire in this audit:** NRCan `CA_canopy_height_2022.zip`. Harvest and wildfire are already acquired/profiled, so they cannot be selected as missing work. Canopy height is the remaining clearly licensed national-baseline source with an exact official HTTPS endpoint and a HEAD-observed 10,347,564,066-byte payload. It is not small: owner storage/compute, archive, retrieval, checksum and profiling controls must precede acquisition.

No external contact, download, archive write, retention action, transformation, ingestion, or production claim was made by this audit.
