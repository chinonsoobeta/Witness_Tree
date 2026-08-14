# Phase 1 land-base coverage-geometry admission

`data/coverage-geometry-admission.json` is the only Phase 1 admission record for the four-province land-base coverage layer. It starts empty and admits no coverage. It is not a boundary dataset and never derives coverage from latitude, an illustrative shape, a fixture, or a coordinate rule.

An entry is acceptable only when it identifies an actual, versioned source geometry with its source ID, province, edition, CRS, raw SHA-256, HTTPS source location, finite extent and area, and profile evidence. The profile must name its evidence artefact and checksum, date, geometry type, feature and invalid-geometry counts, and passed validity result. Licence and attribution evidence are required too.

The Phase 1 exit is not a claim that each province has one complete forest-inventory or forest-hectare denominator. The implementation plan instead requires a coverage geometry layer that assigns a grade to **every part of the provincial land base**. `national-baseline-land-base` is therefore a versioned provincial land-boundary geometry assigned the `national-baseline` grade. It is not a forest-land denominator.

`complete` requires one such national-baseline land-base geometry for each of BC, Alberta, Ontario, and Québec, plus recorded `approved` decisions for Ontario's managed-forest scope and Québec's south-of-52 scope. It may also include any number of distinct `local-context` polygons. A local-context or enhanced-local-records polygon never fills an uncovered provincial baseline. Until the four baseline geometries and both scope decisions exist, the record must remain `pending-evidence` or `partial`.

## Ontario and Québec scope decisions

Ontario's current official Forest Management Unit union is admitted as **Crown-forest planning-unit context only**. It is not a statement of Ontario's total forest land base, does not supply a forest-hectare denominator, and does not itself enable an enhanced provincial record. The national baseline remains the coverage outside the union. An enhanced Ontario record requires separately verified provincial FRI or other local evidence that names the applicable FMU and period.

The union is derived deterministically from all 39 polygons in the approved `FORMGMT.zip` archive. Its evidence binds the source ZIP checksum, output geometry checksum, profile checksum, input count, CRS, extent, equal-area area calculation, and the no-repair/no-filter/no-clipping method. The raw and derivative files remain external evidence artifacts; the admission record references them by normalized path and checksum.

Québec's current-ecoforest footprint is admitted as **publisher-defined local context only**. It is a deterministic union of all 9,827,536 valid, non-empty stand geometries in the official provincial archive, with no latitude clip, feature filter, geometry repair, or simplification. The admitted record binds the official archive checksum, exhaustive source profile, derivative checksum, evidence checksum, CRS, extent, area, licence, and attribution. It does not represent the full province or a forest-land denominator, and it does not enable enhanced records.

## British Columbia reference boundary

The official BC terrestrial boundary is admitted only as **national-baseline jurisdiction/reference geometry**. It identifies the jurisdictional extent for baseline presentation; it does not establish BC forest extent, forest hectares, a provincial inventory footprint, enhanced coverage, or a forest-land denominator. Its official catalogue address remains HTTPS. The publisher-hosted FTP resource is retained separately and is allowed only for this explicitly named source; that exception does not weaken the HTTPS requirement for catalogue evidence or other coverage sources.

## Completed Phase 1 coverage exit

Verified national-baseline jurisdiction/reference geometry now exists for all four provinces: BC's official terrestrial boundary plus the Statistics Canada 2021 Province/Territory Cartographic Boundary File selected by PRUID for Alberta (48), Ontario (35), and Québec (24). Alberta is a lossless source copy. Ontario and Québec had invalid source polygons, so their admitted derivatives use the explicit, checksum-bound `ST_MakeValid` plus polygon-only collection extraction recorded in the external transformation evidence; both area changes are within its 0.05% tolerance. These layers establish baseline geographic context only, never a forest denominator or enhanced-record claim.

The four national baselines and the two explicit scope decisions now satisfy the plan's six coverage-exit requirements. Alberta's bounded known-coverage footprint, Ontario's Forest Management Unit union, and Québec's publisher-defined current-ecoforest footprint add local context without replacing any national baseline. The manifest therefore records `complete` for this Phase 1 coverage-geometry exit.

Ontario FRI access and terms remain a separate source-acquisition requirement before the FMU area can be upgraded to enhanced local records. Québec's verified archive and derivative remain local evidence, not immutable production assets. Coverage completion does not itself prove that every Phase 1 production dataset has been acquired, archived immutably, licensed, versioned, checksummed, ingested, and admitted in the production-source ledger.

Run `npm run check:coverage-geometry-admission` to enforce the contract. The negative corpus proves that missing provinces, unapproved Ontario/Québec decisions, latitude-proxy labels, fixtures, and unknown profile validity cannot satisfy the gate. Test literals exercise parsing only; they are never checked-in coverage evidence or a claim that geometry has been obtained.
