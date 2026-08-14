# Phase 1 land-base coverage-geometry admission

`data/coverage-geometry-admission.json` is the only Phase 1 admission record for the four-province land-base coverage layer. It starts empty and admits no coverage. It is not a boundary dataset and never derives coverage from latitude, an illustrative shape, a fixture, or a coordinate rule.

An entry is acceptable only when it identifies an actual, versioned source geometry with its source ID, province, edition, CRS, raw SHA-256, HTTPS source location, finite extent and area, and profile evidence. The profile must name its evidence artefact and checksum, date, geometry type, feature and invalid-geometry counts, and passed validity result. Licence and attribution evidence are required too.

`complete` is deliberately stricter than syntactically valid evidence. It requires exactly one accepted layer for BC, Alberta, Ontario, and Québec, plus recorded `approved` decisions for Ontario's managed-forest scope and Québec's south-of-52 scope. Until those external source and scope decisions exist, the record must remain `pending-evidence` or `partial`; neither status admits complete land-base coverage.

## Ontario decision and current partial admission

Ontario's current official Forest Management Unit union is admitted as **Crown-forest planning-unit context only**. It is not a statement of Ontario's total forest land base, does not supply a forest-hectare denominator, and does not itself enable an enhanced provincial record. The national baseline remains the coverage outside the union. An enhanced Ontario record requires separately verified provincial FRI or other local evidence that names the applicable FMU and period.

The union is derived deterministically from all 39 polygons in the approved `FORMGMT.zip` archive. Its evidence binds the source ZIP checksum, output geometry checksum, profile checksum, input count, CRS, extent, equal-area area calculation, and the no-repair/no-filter/no-clipping method. The raw and derivative files remain external evidence artifacts; the admission record references them by normalized path and checksum.

## British Columbia reference boundary

The official BC terrestrial boundary is admitted only as **national-baseline jurisdiction/reference geometry**. It identifies the jurisdictional extent for baseline presentation; it does not establish BC forest extent, forest hectares, a provincial inventory footprint, enhanced coverage, or a forest-land denominator. Its official catalogue address remains HTTPS. The publisher-hosted FTP resource is retained separately and is allowed only for this explicitly named source; that exception does not weaken the HTTPS requirement for catalogue evidence or other coverage sources.

Run `npm run check:coverage-geometry-admission` to enforce the contract. The negative corpus proves that missing provinces, unapproved Ontario/Québec decisions, latitude-proxy labels, fixtures, and unknown profile validity cannot satisfy the gate. Test literals exercise parsing only; they are never checked-in coverage evidence or a claim that geometry has been obtained.
