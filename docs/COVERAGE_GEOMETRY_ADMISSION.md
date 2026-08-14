# Phase 1 land-base coverage-geometry admission

`data/coverage-geometry-admission.json` is the only Phase 1 admission record for the four-province land-base coverage layer. It starts empty and admits no coverage. It is not a boundary dataset and never derives coverage from latitude, an illustrative shape, a fixture, or a coordinate rule.

An entry is acceptable only when it identifies an actual, versioned source geometry with its source ID, province, edition, CRS, raw SHA-256, HTTPS source location, finite extent and area, and profile evidence. The profile must name its evidence artefact and checksum, date, geometry type, feature and invalid-geometry counts, and passed validity result. Licence and attribution evidence are required too.

`complete` is deliberately stricter than syntactically valid evidence. It requires exactly one accepted layer for BC, Alberta, Ontario, and Québec, plus recorded `approved` decisions for Ontario's managed-forest scope and Québec's south-of-52 scope. Until those external source and scope decisions exist, the record must remain `pending-evidence` or `partial`; neither status admits complete land-base coverage.

Run `npm run check:coverage-geometry-admission` to enforce the contract. The negative corpus proves that missing provinces, unapproved Ontario/Québec decisions, latitude-proxy labels, fixtures, and unknown profile validity cannot satisfy the gate. Test literals exercise parsing only; they are never checked-in coverage evidence or a claim that geometry has been obtained.
