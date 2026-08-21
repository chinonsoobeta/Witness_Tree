# Phase 3 synthetic registry and page generator

This Phase 3 batch is explicitly **example**, **unapproved**, **nonproduction**, and `productionEligible: false`. It contains no real source data and makes no Phase 1, Phase 2, release, deployment, or production claim.

## One registry spine

`lib/places` deterministically builds the complete synthetic cross-product of eight place types and four provinces: 32 place records and 32 paired location records. Each registry entry also owns one search, source, citation, and download record. The generator emits both English and French forms for all six record kinds.

The page-count manifest is `witness-tree/phase3-page-manifest/1`:

- 32 entities;
- 384 localized generated records;
- 192 exact English/French record pairs;
- 128 localized static place/location pages;
- an exact generated MDX byte length for both members of every pair.

Every place and location route uses the registry for `generateStaticParams`, opts out of ungenerated dynamic parameters, and obtains both hreflang paths from the exact generated pair. The build classifies all four localized parameterized route families as static.

## Numeric and provenance boundary

Every public numeric field in this spine—including forest denominators, coverage shares, annual years and hectares, event years, citation years, latitude, longitude, and claimed accuracy—is a `PublicFigure` or `PublicUnknown`. A Figure requires evidence, confidence, coverage, and provenance. An Unknown has no numeric member and requires a bilingual reason, coverage, and provenance. Negative compile-time tests reject bare denominators, annual values, coordinates, accuracy, missing coverage, missing provenance, and unlocalized Unknown reasons.

The chart uses numeric values only for non-verbal bar geometry. All values exposed to a reader are rendered through the same typed value component, with an accessible table, evidence, confidence where applicable, coverage, and provenance.

## Phase 2 synthetic adapter

`witness-tree/phase3-phase2-synthetic-adapter/1` is the canonical versioned input boundary for the Phase 2 `synthetic-integrated-aggregates.json` schema. It accepts only schema version 1 records labelled `status: example`, `reviewStatus: unapproved`, and `productionEligible: false`. It validates geography identity, finite numeric inputs, the denominator and year range, coverage, method/data versions, and a lowercase lineage SHA-256 before constructing typed Phase 3 public values. Tests reject production, approval, schema, checksum, and non-finite-value drift.

## Bounded typography correction

BC Sans remains the global UI family. Generated record prose and headings use the declared serif record family, while controls, links, labels, table headings, and numeric output retain BC Sans. This resolves the record-prose/heading contradiction without changing unrelated application surfaces.

## Fixed-rubric self-assessment

The audited baseline is 47/100: dependencies 4/15, foundation/policy 13/20, public surfaces/generation 15/30, bilingual/performance/accessibility/CI 11/20, and checkpoint/exit evidence 4/15.

The conservative implementation self-assessment is **+6 points, 47% → 53%**, subject to independent audit:

- dependencies `+1`: one fail-closed, versioned adapter for the canonical synthetic Phase 2 output;
- foundation/policy `+2`: typed no-bare-number public model and bounded record typography correction;
- public surfaces/generation `+0`: synthetic generation is already at the 50% fixture-maturity cap for this category;
- bilingual/performance/accessibility/CI `+2`: exact record pairs/hreflang/static generation plus MDX byte and completeness validation;
- checkpoint/exit evidence `+1`: deterministic page-count/byte manifest and this explicit nonproduction boundary record.

No additional point is claimed for fixture volume, real-data readiness, production quality, external review, deployment, or Phase 3 exit completion.
