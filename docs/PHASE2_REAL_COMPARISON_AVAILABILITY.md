# Phase 2 real comparison availability

`data/phase2-real-comparison-availability.json` records the local source state for the required independent comparisons. It binds the available CA Forest Harvest and NFDB polygon archive bytes, while publishing null Witness Tree, reference, absolute-difference and relative-difference values for every comparison that cannot yet be performed. Those nulls are the honest current availability state; they are not valid values in a future `completed` evidence envelope.

The missing provincial published-statistics series and NBAC artifact/authorization are explicit. Four public CC BY 4.0 Hansen GFC v1.12 `lossyear` sample tiles are now locally checksum-bound as cross-check input, but are not a complete or like-for-like comparison; their profile is at [`data/phase2-hansen-gfc-v1.12-sample-profile.json`](../data/phase2-hansen-gfc-v1.12-sample-profile.json). NFDB polygons cannot be compared to V2.1 observed loss as wildfire: the V2.1 raster does not establish causal attribution. This availability evidence creates no comparison result or accuracy claim. Phase 2 is 2/4 because its separate baseline and aggregate admissions pass; the comparison gate remains open.

## Completion-ready evidence check

`tsx scripts/check-phase2-independent-comparison-evidence.mts` is the fail-closed checker for a future owner-supplied comparison evidence envelope. With no `--evidence` argument it reads the current availability record and reports the missing checksum-bound inputs and null comparison results; it does not acquire data, create rows, or change Phase 2 status. Run it with `npm run check:phase2-independent-comparison-evidence` for the focused checker and tests.

The completion envelope remains `witness-tree/phase2-independent-comparison-evidence/1` (the formal-status checker already names that schema), but its validator is now hardened and must bind:

- real source profiles plus the exact raw source files, bytes, formats, lengths and SHA-256 checksums for provincial statistics, NBAC and Hansen. A profile or admission JSON without the payload bytes is metadata-only and fails. Synthetic, illustrative, fixture and arbitrary buffer paths/bytes fail;
- a separately bound owner-approved source admission for each input, with the admission record repeating the exact profile and artifact bindings and keeping source release and production eligibility false;
- the exact admitted Witness Tree output artifacts and output records, the V2.1 readback record, and the recorded Witness Tree admission. A row may reference only an output ID present in those admitted records;
- a completion-specific `witness-tree/phase2-comparison-aggregate/1` readback bound by both the Witness Tree admission and the output readback. Every aggregate key (`PROVINCE:YEAR`, `NBAC:2022`, or `Hansen:cross-check`) must bind the row's reference input and output ID, so an admitted output ID alone is insufficient lineage;
- distinct, checksum-bound method, forest-mask, boundary, resampling/grid, area/denominator and uncertainty contracts. The checker requires each contract to carry a version and state its relevant semantics;
- the method/mask/boundary/area lineage on every result row, an explicit uncertainty treatment (quantified or documented as not quantified), exact finite row arithmetic, and no null in a completed envelope;
- a completed Hansen record labelled `real-source-cross-check` with role `independent-cross-check-not-source`, `cross-check-only` claims and `productionEligible: false`; and
- checksum-bound English and French publication pages plus a checksum-bound publication metadata record for `/en/methods` and `/fr/methodes` with a fixed UTC publication timestamp. The metadata repeats both page bindings and every result row key, and the checker scans both pages to require every key.

Raw/source/output bytes are hashed in fixed-size chunks. Only bounded prefixes are retained for format markers, and JSON control records are capped at 4 MiB before parsing. Repository control-record bindings must use durable `data/...` paths; generated tests use explicitly `test-only` metadata paths and do not stand in for claimed real source payloads. Source and output paths reject symlink parents and traversal segments (apart from the explicit canonical `../../Witness_Tree-data/...` source-root form).

## Scope is still annual by province and year

The implementation plan's validation requirement is to compare annual harvest area against provincial published harvest statistics **per province, per year**. The checked-in illustrative contract currently contains only four pending 2022 rows (one per province). That is a scope mismatch, not permission to silently redefine the requirement. Until a separately checksum-bound prompt amendment explicitly changes the requirement, a completion envelope must contain the full 1984–2022 annual matrix: 39 years × 4 provinces = 156 computed provincial rows. The validator records the four-2022 exception only when a binding amendment says `originalRequirement: "per-province-per-year"`, `amendedRequirement: "four-province-2022"`, and names the four provinces and year 2022.

No such amendment is checked in here. Therefore the current four-row contract remains illustrative and cannot be used as completed comparison evidence. The current availability record remains incomplete, with comparison values null and the formal Phase 2 comparison gate false.

The envelope’s claim boundary keeps causal attribution, product accuracy, like-for-like interpretation, source-input release, and production eligibility false while requiring the comparison results themselves to be published. No real completion envelope or comparison rows are checked in here; validating a future envelope does not itself admit inputs, publish the site, or complete the formal Phase 2 gate.
