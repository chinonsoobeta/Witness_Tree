# Fire-impact summary contract

This module is an illustrative fixture and pure validation contract. It does not ingest, fetch, display, or make claims about a live wildfire feed.

A reported fire perimeter is not a damage or mortality map. The only area it derives is the supplied geometry result for the intersection between that perimeter and mapped mature forest. It is a `derived-estimate`; it is never an assertion that fire destroyed that area.

Every valid example carries both perimeter and mapped-forest provenance (including licence), observed and source dates, a forested-hectare denominator, the registered forest-definition version, boundary edition, data, and method versions, coverage, confidence, and English/French limitation text. The validator rejects a whole-perimeter substitution, missing lineage, invalid geometry-area bounds, and numeric Unknown values.

A supplied geometry result of zero hectares is a valid computed `Figure` with value `0`; it means no mapped mature-forest intersection was supplied by that result. It is not `Unknown`. `Unknown` has no numeric fire-impact value.
