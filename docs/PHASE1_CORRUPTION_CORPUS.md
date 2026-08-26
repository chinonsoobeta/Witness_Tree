# Phase 1 corruption corpus

`npm run check:phase1-corruption-corpus` runs a deliberately corrupt, fully synthetic
production-shaped metadata corpus through existing Phase 1 boundaries. It neither opens
an archive nor reads, downloads, uploads, transforms, or ingests source data.

The corpus proves that the applicable section 15.1 checks fail closed for checksum and
archive-integrity evidence; schema drift; CRS, topology and known geometry counts; date,
area-unit and event-domain limits; duplicate identifiers and impossible overlap evidence;
attribution and licence evidence; and `Unknown` rendered as numeric zero. A valid synthetic
staging record runs first, so each case reaches its named boundary rather than failing from
missing required metadata.

It deliberately reuses `check-staged-acquisitions`, `lib/ingestion`,
`lib/transformation`, and `lib/pipeline/matching`; the corpus contains no second validator.
This is a corruption drill for contracts, not evidence that a source is admitted to
ingestion or production.
