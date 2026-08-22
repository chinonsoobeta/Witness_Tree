# Phase 1 Alberta transformation and ingestion audit

The machine record in [`data/phase1-alberta-transform-ingestion-audit.json`](../data/phase1-alberta-transform-ingestion-audit.json) reconciles the exact existing local evidence for:

- `ab-avi-crown`;
- `ab-avi-post-harvest`; and
- `ab-primary-land-vegetation`.

It is a read-only evidence audit. It does not call AWS, write remote storage, send email, submit a form, accept terms, modify a source archive, or start Phase 2.

## AVI rows

The owner decisions for both AVI rows are explicitly `approved-source-ledger-only`. The existing `alberta-avi-geometry-repair-v1` run is therefore validated as a checksum-bound local repair/quarantine policy run, not as an admitted production transformation:

- 792,443 input features;
- 608 invalid geometries;
- 607 bounded in-memory repairs; and
- one quarantined `AVI_PostInventoryHarvestIndex` FID 1 whose area change exceeds the one-part-per-million tolerance.

For the Crown row, the quarantine decision separately records that the excluded index footprint contains zero Crown observations and has no Crown denominator impact. For the post-inventory-harvest row, the observation layer contains 3,631 features and 19 accepted in-memory repairs; the quarantined index footprint is not silently treated as an observation.

No derived AVI payload is present in the controlled evidence set. The audit therefore keeps both rows blocked before ingestion, with `transformed`, `ingested`, release, production-admission, and production-eligibility claims false.

## PLVI row

The existing PLVI repair and closed-join records are validated against the exact raw checksum and derived checksum:

- 179,087 input and output features;
- 12 bounded geometry replacements;
- zero invalid, empty, or non-polygonal output geometries;
- EPSG:3400 and 63 fields;
- the existing duplicate `POLYGON_ID` 41405 preserved; and
- no silent loss or deduplication.

This is a local output preflight only. The decision-readiness record says the owner scope decision is ready but not recorded, and the full-release record says owner admission is not authorized. Accordingly, the audit does not treat the output as an admitted transformation or ingestion input. It records `local-output-preflight-passed-not-ingested`, while release, production admission, and eligibility remain false.

## Progress impact

The exact PLVI output remains checksum-bound and passes count, geometry, duplicate-preservation, and no-loss checks. A stricter ordered-schema preflight now blocks ingestion preparation: `SUBMISSION_ID` became `SUBMISSION`, `Shape_Length` became `Shape_Leng`, and 23 `Integer` fields widened to `Integer64`. A corrected checksum-bound output or explicit field-mapping decision is required before that preflight can pass.

This historical audit added no raw-evidence credit and no formal-score points. At the time, the ledger was `14.25/31` and `38.7903226%`, with 7 immutable rows; production admission and eligibility were 0/31. The exact owner actions remain to record downstream transformation/ingestion scope for AVI; resolve the PLVI schema boundary and separately admit its transformation and ingestion; then record release and production admission separately.
