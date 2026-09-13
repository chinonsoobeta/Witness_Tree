# VLCE2 forest-mask decision record

**Status:** Decision required. No mask may be implemented from this record.

This is a documentation-only decision template for the national-baseline forest
mask. It records the evidence and decisions required before implementation; it
does not select any VLCE2 class, assert that a class satisfies the Canada
National Forest Inventory (NFI) definition, calculate forest area, or approve a
release.

The implementation plan calls for the Canada NFI definition as the common
denominator and says to derive a yearly mask from NTEMS VLCE2. Those are two
different things: VLCE2 is a land-cover classification, while the plan's NFI
definition is land of at least 1 hectare, with at least 10% crown closure, and
trees able to reach 5 metres at maturity. A class-name match alone does not
prove the area, crown-closure, maturity-height, connectivity, or land-use
conditions. The mapping below is deliberately unresolved.

## Project rule versus current NFI source

The project-plan wording is not a substitute for a current, versioned NFI
source. Record and review the discrepancy before selecting a class: the project
requires a single Canada NFI denominator across provinces and a yearly VLCE2
mask, while the current NFI source and any interpretive guidance used to decide
whether that categorical mask meets the NFI conditions have not been recorded
in this template. Do not describe the project rule as a current NFI finding
until the exact source, edition, and review evidence are entered below.

| Comparison | Evidence required | Current state |
| --- | --- | --- |
| Project-plan forest rule | Exact plan section and version; intended denominator wording | Plan wording is recorded; method approval is not recorded |
| Current NFI definition | Issuer, edition/date, immutable citation or checksum-bound copy, exact definition text | Not recorded |
| NFI guidance affecting class treatment | Versioned guidance for area, canopy/crown closure, mature-tree capability, land use, and temporary unstocked treatment | Not recorded |
| Resulting discrepancy and resolution | Written analysis of every difference, affected class, and rule; signed approval | Not recorded |

## Non-implementation gate

Do **not** implement, execute, store, publish, or use a VLCE2 forest mask until
all required inputs, the class treatment table, each crosswalk decision, and the
sign-off block are complete. Until then, any forest-mask output is **Unknown**;
it is not zero and is not a provisional national-baseline figure.

## Immutable input and version evidence

Complete one row for every annual raster and every method/source document used
to make or validate the decision. A URL, filename, or catalogue title is not an
immutable version identifier by itself.

| Input | Required immutable/version evidence | Recorded value | Reviewer verification |
| --- | --- | --- | --- |
| VLCE2 raster, each year used | Publisher, dataset title, year, retrieval UTC timestamp, source URL, archive SHA-256, byte length, immutable object key and version ID, retention evidence | Not recorded | Not verified |
| Bundled VLCE2 README and class documentation, each version relied on | Exact member name, archive SHA-256 binding, extracted-document SHA-256, language, publication/version date if supplied | Not recorded | Not verified |
| NFI definition source | Issuer, exact edition/publication date, stable citation or archived copy checksum, retrieval UTC timestamp | Not recorded | Not verified |
| NFI interpretive guidance used for any condition | Issuer, exact edition/publication date, stable citation or archived copy checksum, retrieval UTC timestamp | Not recorded | Not verified |
| Connectivity/area/land-use/height ancillary inputs, if chosen | Dataset/version, licence, spatial and temporal scope, checksum, immutable object key/version ID, retention evidence | Not recorded | Not verified |
| Boundary edition and intersection method | Issuer, edition/effective dates, source checksum, method version, grid/CRS evidence | Not recorded | Not verified |
| NRCan FAO forest 2022, staged locally | Publisher, retrieval and verification UTC timestamps, archive SHA-256, byte length, immutable object key and version ID, retention evidence | `CA_FAO_forest_2022.zip`, 831,994,643 bytes, SHA-256 `1ed253ea…1dfc0e`, retrieved 2026-09-09T16:30:39Z, verified 2026-09-09T17:52:46Z; recorded in `data/staged-acquisitions.json`. No immutable object key, no version ID, no retention evidence. | Not verified |
| NRCan treed area 1984 to 2022, staged locally | As above | `CA_treed_area_1984-2022.zip`, 1,183,942,534 bytes, SHA-256 `06458f5b…f17821`, retrieved 2026-09-09T16:32:31Z, verified 2026-09-09T17:52:58Z. No immutable object key, no version ID, no retention evidence. | Not verified |
| NRCan forest age 2022, staged locally | As above | `CA_forest_age_2022.zip`, 5,922,298,842 bytes, SHA-256 `3e2771e4…ea4158`, retrieved 2026-09-09T16:45:46Z, verified 2026-09-09T17:55:03Z. No immutable object key, no version ID, no retention evidence. | Not verified |
| NRCan Satellite-Based Forest Inventory 2020, staged locally | As above | `CA_Forest_Satellite_Based_Inventory_2020.zip`, 7,234,719,296 bytes, SHA-256 `b71dd76a…72ef3e`, retrieved 2026-09-09T16:49:19Z, verified 2026-09-09T17:57:28Z. No immutable object key, no version ID, no retention evidence. | Not verified |

If a source cannot be pinned to an immutable object/version and checksum, record
that limitation and do not use it to close this gate.

The four staged products above carry verified local checksums and nothing more.
The publisher declares no dataset version, and the archives sit on local storage
with no immutable object key, no version ID, and no retention evidence. They are
sufficient to reproduce a measurement on this machine and insufficient to close
any row of this table. Each is recorded in `data/staged-acquisitions.json` with
`productionEligible: false`.

## Complete VLCE2 class-treatment register

All 13 known VLCE2 class codes require an explicit disposition. “Include” is not
pre-filled for any class. Each row needs a documented rationale tied to the
recorded NFI evidence and, where needed, to additional evidence for the listed
conditions.

| Code | VLCE2 class | Proposed treatment | Required decision and evidence | Owner review | Independent review |
| ---: | --- | --- | --- | --- | --- |
| 0 | Unclassified | Unresolved | Decide treatment; show whether missing/unclassified cells can ever enter a denominator. | Pending | Pending |
| 20 | Water | Unresolved | Decide treatment; document any edge or mixed-pixel handling. | Pending | Pending |
| 31 | Snow and ice | Unresolved | Decide treatment; document seasonal and persistent-cover implications. | Pending | Pending |
| 32 | Rock and rubble | Unresolved | Decide treatment; record any exception rule and evidence. | Pending | Pending |
| 33 | Exposed and barren land | Unresolved | Decide treatment; record disturbance/recovery and land-use implications. | Pending | Pending |
| 40 | Bryoids | Unresolved | Decide treatment; record whether any NFI condition can be evidenced. | Pending | Pending |
| 50 | Shrubs | Unresolved | Decide treatment; resolve maturity-height, area, connectivity, and land-use conditions. | Pending | Pending |
| 80 | Wetland | Unresolved | Decide treatment; resolve tree presence, crown closure, area, connectivity, and land-use conditions. | Pending | Pending |
| 81 | Wetland – treed | Unresolved | Decide treatment; resolve crown closure, maturity-height, area, connectivity, and land-use conditions. | Pending | Pending |
| 100 | Herbs | Unresolved | Decide treatment; record disturbance/recovery and land-use implications. | Pending | Pending |
| 210 | Coniferous | Unresolved | Decide treatment; do not infer NFI compliance from the label; resolve every NFI condition. | Pending | Pending |
| 220 | Broadleaf | Unresolved | Decide treatment; do not infer NFI compliance from the label; resolve every NFI condition. | Pending | Pending |
| 230 | Mixedwood | Unresolved | Decide treatment; do not infer NFI compliance from the label; resolve every NFI condition. | Pending | Pending |

## Required crosswalk decisions

The signatories must resolve each item below for every class treatment that
could contribute to the forest denominator. A decision may exclude a class. It
may not treat missing evidence as a positive result.

The conditions are listed in the order the 2026-09-09 British Columbia
measurements put them, largest effect first, not in the order they appear in the
definition. Land use dominates everything else. The `Measured input now held`
column records what a condition can now be computed from; it decides nothing,
and every state below remains Unresolved.

| Condition | Decision to record | Minimum acceptance evidence | Measured input now held | State |
| --- | --- | --- | --- | --- |
| Land use | How agricultural, urban, plantation, orchard, wetland, and other land-use distinctions are treated when relevant | Written rule, authoritative source, and exceptions | Measured for British Columbia: including NRCan's temporally-informed FAO code moves the extent from 59,066,796 ha to 64,162,145 ha, about twenty times every threshold condition combined. The rule itself is not written. | Unresolved |
| Temporarily unstocked land | Whether a temporarily unstocked area remains in the denominator, for how long, and what source evidence establishes that status | Written rule, time-window, evidence source, and counterexamples | Measured for British Columbia: 5,095,349 ha carries the temporally-informed code, mostly Shrubs, Exposed and barren land, and Herbs. No time-window and no rule are recorded. | Unresolved |
| Minimum width | How the at-least-20-metres condition is measured, or why it is not measured; the condition was previously absent from this record | Reproducible method version, resolution analysis, and independent review | Not expressible at 30 m; the narrowest representable feature already exceeds 20 m. Bracketed from above: opening at 60 m removes 1,070,599 ha, 1.67 percent, more than four times the area condition. Recorded in `lib/domain/forest.ts` at version `nfi-2`. | Unresolved |
| NFI area threshold | How the at-least-1-hectare condition is measured from categorical 30-m cells, including aggregation and boundary-edge rules | Reproducible method version; sensitivity/edge-case results; independent review | Measured for British Columbia: the 1 ha rule removes 0.3775 percent 8-connected, 0.6603 percent 4-connected. Method reproducible; no independent review. | Unresolved |
| Connectivity | Whether and how cells must be contiguous for area qualification, including adjacency, holes, and diagonal-touch rules | Written rule, test geometries, and independent validation | Measured for British Columbia: the 4- versus 8-connected choice is worth 181,429 ha, 0.2828 percent, three quarters the size of the area rule. No rule chosen and no validation. | Unresolved |
| Crown closure | How the at-least-10% condition is demonstrated, or why a class is excluded when VLCE2 cannot demonstrate it | Versioned authoritative source and class-to-condition evidence | Attempted and refused. NRCan's canopy product measures lidar returns above 2 m and is masked by the VLCE2 classification under test, so its zeros outside the treed classes are the mask, not a measurement. Per-stand results exist from the SBFI: 0.80 percent of the FAO-forest portion fails the cover condition. | Unresolved |
| Mature-tree height | How “able to reach 5 metres at maturity” is demonstrated; a current canopy-height raster is not automatically a maturity-capability measure | Versioned authoritative source and documented applicability by class/year | No admissible input. Forest age covers 98.97 percent of the FAO extent, but four fifths of it is modelled by inverting allometric equations against structure maps, so it cannot evidence a structure-based maturity condition. | Unresolved |
| Temporal alignment | Which mask year applies to every requested time range and how the method handles unavailable years | Versioned rule and tests for start/end-year cases | Unmeasured, and now demonstrated to bite: the FAO extent is 2022 and the only stand-based product is a 2020 inventory. No rule. | Unresolved |
| Boundary intersection | How boundary edition, CRS/grid alignment, partial cells, and water/edge treatment affect denominator area | Reproducible method, boundary version, and validation cases | Partially measured. Every product shares one national 30 m grid, so the province is a fixed pixel window and no reprojection is used. The boundary edition and partial-cell rule remain unrecorded. | Unresolved |

## Measured evidence, British Columbia, added 2026-09-09

Nothing in this section decides anything. It exists because the register above
was unresolved for two different reasons that were not being told apart: some
conditions had no evidence because nobody had computed them, and others had no
evidence because they cannot be computed from the inputs held. Eight
reproducible jobs, listed at the end of this section, separate those two cases
for British Columbia. Every number below is a measurement over the province's 91,750,725
hectares on the shared 30 m NTEMS grid.

**These measurements cannot open the gate, and the reason is structural.** Every
product used here descends from the same Landsat best-available-pixel composites
and the same VLCE2 classification the validation boundary excludes as
independent truth. What they recover is the publisher's own crosswalk made
explicit. That is a different and lesser thing than validation, and no class may
be moved to Include on this basis.

### What the publisher itself treats as treed

The class-treatment question was answered empirically rather than from class
names, which the register above requires. NRCan publishes a treed-area product
derived from the same annual land cover. For 1984 it reports 56,845,993 ha of
treed area in British Columbia. Deriving the same quantity independently from
VLCE2 classes 81, 210, 220 and 230 alone gives 56,849,136 ha. The difference is
3,143 ha, or 0.0055 percent.

That is the publisher's own class treatment, recovered without inferring
anything from a label. It says which classes NRCan counts as treed. It does not
say which classes satisfy the NFI conditions, and those are different questions.

### The per-class measurements

FAO current is the share of each class carrying code 1 in NRCan's FAO forest
product, its cover-based forest. FAO temporally informed is the share carrying
code 2, land that is forest by land use because tree cover was removed by a
stand-replacing disturbance and is expected to return. Canopy is NRCan's 2022
canopy cover product, which the publisher defines as the percentage of lidar
first returns above 2 m, imputed by nearest neighbour.

| VLCE2 class | 2022 extent (ha) | FAO current (%) | FAO temporally informed (ha) | Temporally informed (%) | Canopy at least 10% (%) | Mean canopy (%) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unclassified (0) | 2,949 | 0.000 | 0 | 0.00 | 0.0 | 0.0 |
| Water (20) | 2,100,194 | 0.021 | 9 | 0.00 | 0.02 | 0.02 |
| Snow and ice (31) | 3,037,558 | 0.001 | 125 | 0.00 | 0.0 | 0.0 |
| Rock and rubble (32) | 1,913,343 | 0.005 | 684 | 0.04 | 0.0 | 0.0 |
| Exposed and barren land (33) | 10,028,923 | 0.013 | 1,191,831 | 11.88 | 0.0 | 0.0 |
| Bryoids (40) | 5,973 | 0.000 | 167 | 2.80 | 0.0 | 0.0 |
| Shrubs (50) | 9,145,346 | 0.049 | 2,610,336 | 28.54 | 0.0 | 0.0 |
| Wetland (80) | 2,318,208 | 0.135 | 204,804 | 8.83 | 0.0 | 0.0 |
| Wetland, treed (81) | 1,552,349 | 100.000 | 0 | 0.00 | 94.87 | 53.80 |
| Herbs (100) | 4,140,313 | 0.018 | 1,087,391 | 26.26 | 0.0 | 0.0 |
| Coniferous (210) | 51,805,338 | 99.997 | 0 | 0.00 | 96.93 | 66.36 |
| Broadleaf (220) | 5,185,395 | 100.000 | 0 | 0.00 | 98.96 | 77.90 |
| Mixedwood (230) | 514,836 | 99.999 | 0 | 0.00 | 99.47 | 78.27 |

Two readings of that table are load-bearing.

First, the split is almost perfectly clean. FAO current forest is the four treed
classes and essentially nothing else: 99.983 percent of it falls inside them,
and the residual 10,229 ha is spread across the other nine. Every non-treed
class enters the FAO extent only through the temporally informed code, never
through cover.

Second, the canopy column cannot answer the crown-closure question, and the
zeros are what prove it. The publisher defines the cover product's zero as areas
with no tree cover according to the 2022 land cover map, so it was masked using
the classification under test. Nine million hectares of Shrubs reading exactly
0.0 percent is not an empirical finding about shrubs; it is the mask showing
through. The column describes cover within the classes VLCE2 already calls
treed, and it can do nothing else. It cannot test whether a non-treed class
should be admitted.

### Land use is the dominant term, by roughly twenty to one

Adding the temporally informed code to the extent moves British Columbia from
59,066,796 ha to 64,162,145 ha, a difference of 5,095,349 ha. Four classes
supply nearly all of it: Shrubs 2,610,336 ha, Exposed and barren land
1,191,831 ha, Herbs 1,087,391 ha, and Wetland 204,804 ha.

Set that against every threshold condition measured below, which together move
the extent by well under half a million hectares. The temporarily unstocked
question is worth about twenty times all of the threshold conditions combined.
Any route that treats forest as cover lands near 59 Mha; any route that includes
land use lands near 64 Mha. This is why the crosswalk table above now lists land
use and temporarily unstocked land first, ahead of the threshold conditions the
definition states first.

### The threshold conditions, now measured

The FAO forest product's README states that no filtering to a minimum mappable
unit has been applied, so the published layer implements the land-use half of
the FAO definition and no area threshold at all. That filtering was applied
here instead, to the FAO extent for British Columbia.

| Rule applied to the 2022 FAO forest extent | Result (ha) | Removed from raw (%) |
| --- | ---: | ---: |
| Raw, as published | 64,162,145 | 0.0000 |
| Minimum 0.5 ha, 8-connected | 64,010,468 | 0.2364 |
| Minimum 1 ha, 8-connected | 63,919,940 | 0.3775 |
| Minimum 0.5 ha, 4-connected | 63,871,734 | 0.4526 |
| Minimum 1 ha, 4-connected | 63,738,511 | 0.6603 |

The NFI area condition therefore costs 0.3775 percent of the published extent,
and the choice between 4- and 8-connectivity is worth 181,429 ha, or 0.2828
percent. Connectivity is not a detail: it is three quarters the size of the area
rule it qualifies.

### The minimum-width condition cannot be evaluated at 30 m

The NFI and FAO definitions both carry a minimum width of 20 m alongside the
minimum area, and this record did not previously list it as a condition at all.
A small-area sieve cannot express it, because area and width are independent: a
one-cell ribbon twenty cells long covers 1.8 ha and passes a 1 ha test while
being as narrow as the grid can represent.

At 30 m the condition is not merely hard to evaluate, it is inexpressible. The
narrowest feature a 30 m raster can represent is one cell, 30 m across, already
wider than the threshold, so a 20 m test can never fail. A zero reported from
such a test would describe the grid, not British Columbia, and recording it as
compliance would be exactly the move this record forbids.

What the grid can do is bracket the condition from above, by opening the extent
at the two smallest widths it can resolve.

| Extent, 2022 | Opened at 60 m: removed (ha) | Removed (%) | Opened at 90 m: removed (ha) | Removed (%) |
| --- | ---: | ---: | ---: | ---: |
| FAO forest, all codes | 1,070,599 | 1.6686 | 2,339,720 | 3.6466 |
| FAO current forest | 1,253,049 | 2.1214 | 2,736,048 | 4.6321 |
| VLCE2 treed classes | 1,253,845 | 2.1231 | 2,737,350 | 4.6350 |

This is the section's most consequential result. The width condition is not
small. At the narrowest width the grid can resolve, it removes 1,070,599 ha,
more than four times what the 1 ha area condition removes, and it has never been
applied by anyone here or by the publisher. It is unresolved, it is
unmeasurable at the current resolution, and it is larger than the conditions
that are measurable. The definition record in `lib/domain/forest.ts` now carries
the condition explicitly, at version `nfi-2`, so that a mask built later must
confront the gap rather than inherit a three-condition rule that silently omits
the fourth.

### The stand-based test the NFI actually describes

The NFI defines forest in terms of stands, not cells. NRCan's Satellite-Based
Forest Inventory is the only stand-based product held, so the 1 ha and 10
percent conditions can be applied where they were written to apply. For British
Columbia it holds 4,097,706 stands covering 91,213,710 ha, of which
63,805,488 ha falls in the FAO forest extent.

Applying both conditions per stand, scoped to each stand's FAO-forest portion:

| Outcome of the per-stand NFI test | Area (ha) | Share of the FAO-forest portion (%) |
| --- | ---: | ---: |
| Passes both the 1 ha and 10 percent conditions | 63,177,248 | 99.02 |
| Fails on crown closure only | 482,472 | 0.76 |
| Fails on area only | 118,875 | 0.19 |
| Fails on both | 26,893 | 0.04 |

Two limits belong with that result. The SBFI segmentation used a minimum map
unit of 0.45 ha, below the NFI threshold, so the area condition genuinely had to
be applied rather than assumed. And the product is a 2020 inventory while the
extent is 2022, which is itself an instance of the temporal-alignment condition
below.

### Forest age is descriptively useful and evidentially circular

63,655,484 ha of British Columbia carries a modelled stand age, 69.38 percent of
the province. 98.97 percent of the FAO forest extent is aged, as is 99.99
percent of the VLCE2 treed classes, so age availability does not discriminate
between the two definitions.

The composition is the reason age cannot serve the maturity condition:

| Approach used to estimate age | Area (ha) | Share of aged area (%) |
| --- | ---: | ---: |
| Allometric, inverted against structure and productivity maps | 51,487,744 | 80.89 |
| Observed disturbance, 1985 to 2022 | 7,663,097 | 12.04 |
| Observed recovery, extending to 1965 | 4,504,643 | 7.08 |

Four fifths of the aged area is modelled by inverting allometric equations
against maps of forest structure. Using it to evidence a structure-based
maturity condition would corroborate a structure claim with a number derived
from that same structure. It is recorded here as descriptive context and is not
admissible for the mature-tree-height row.

### Endpoint extents, for reference

Derived from VLCE2 classes directly, the province's treed extent at the two
endpoints, before and after the 1 ha rule:

| Class set and rule | 1984 (ha) | 2022 (ha) |
| --- | ---: | ---: |
| Upland treed, raw | 55,313,629 | 57,505,569 |
| Upland treed, 1 ha 8-connected | 54,942,030 | 57,149,443 |
| Upland treed, 1 ha 4-connected | 54,684,471 | 56,909,323 |
| Upland plus wetland-treed, raw | 56,849,136 | 59,057,918 |
| Upland plus wetland-treed, 1 ha 8-connected | 56,500,402 | 58,733,287 |
| Upland plus wetland-treed, 1 ha 4-connected | 56,249,909 | 58,509,247 |

These are endpoint differences between two independent classifications. They are
not the project's cumulative disturbance figures, they are not a loss estimate,
and they are not a forest denominator. NRCan's own treed-area product reports
the same direction over the same period: 56,845,993 ha in 1984 rising to
59,365,094 ha in 2022.

### The jobs that produced this section

All are reproducible from the repository against the staged archives recorded in
`data/staged-acquisitions.json`.

- `scripts/bc_forest_window.py`, the shared grid, window, tiling and sieve
- `scripts/bc_treed_extent_baseline.py`, the endpoint extents
- `scripts/bc_canopy_cover_crosswalk.py`, canopy cover by class
- `scripts/bc_ntems_definitional_crosswalk.py`, the FAO and treed-area cross-tabulation
- `scripts/bc_ntems_mmu_filter.py`, the area and connectivity rules
- `scripts/bc_forest_width_opening.py`, the minimum-width bracket
- `scripts/bc_forest_age_profile.py`, the age and approach profile
- `scripts/bc_sbfi_stand_conditions.py`, the per-stand NFI test

## Owners and sign-off

Roles are named deliberately; no individual is implied or invented by this
template. One person may fill multiple roles only if the independent-review role
is held by someone who did not make the class decisions.

| Role | Required responsibility | Name and organisation | Signature/approval reference | Date |
| --- | --- | --- | --- | --- |
| Method owner | Owns the proposed NFI-to-VLCE2 crosswalk and reproducible method | Unassigned | Not recorded | Not recorded |
| Forestry/NFI subject-matter reviewer | Assesses NFI interpretation and applicability | Unassigned | Not recorded | Not recorded |
| Geospatial methods reviewer | Assesses raster, connectivity, area, CRS/grid, and boundary treatment | Unassigned | Not recorded | Not recorded |
| Independent validator | Repeats acceptance checks without authoring the crosswalk | Unassigned | Not recorded | Not recorded |
| Editorial decision authority | Approves the definition/method change for the product | Unassigned | Not recorded | Not recorded |
| Release owner | Confirms the signed method is the one used in a later release | Unassigned | Not recorded | Not recorded |

## Acceptance and validation record

Before the gate can change, attach or link reviewable evidence for every item:

1. Immutable, checksum-bound copies of every input listed above, with the exact
   versions used by the method.
2. A complete 13-row class-treatment register with no unresolved proposed
   treatment and no class inferred to meet an NFI condition from its label.
3. A versioned, reproducible crosswalk that resolves area, connectivity, crown
   closure, mature-tree height, land use, temporarily unstocked land, temporal
   alignment, and boundary-intersection rules.
4. Tests covering class inclusion/exclusion, missing or unclassified cells,
   threshold and connectivity edge cases, temporarily unstocked cases, and
   boundary/grid edge cases; results must identify the exact method and input
   versions.
5. A comparison against suitable independent published or authoritative
   reference statistics, with any difference explained rather than hidden.
6. Written approval by the method owner, Forestry/NFI reviewer, geospatial
   reviewer, independent validator, and editorial decision authority.
7. A dated release note and recomputation plan if this changes an existing
   published forest definition or denominator.

### Gate outcome

| Check | Result |
| --- | --- |
| All immutable input/version evidence recorded | Not complete |
| All 13 class treatments signed | Not complete |
| All NFI-condition decisions supported | Not complete |
| Independent validation accepted | Not complete |
| Editorial approval recorded | Not complete |
| **Mask implementation permitted** | **No** |

## Related records

- [Implementation status](IMPLEMENTATION_STATUS.md) records the plan-level
  dependency: the forest mask is Phase 2 work, not a completed baseline.
- [External gates](EXTERNAL_GATES.md) records that the editorial decision on the
  forest definition cannot be delegated.
- [Source verification](SOURCE_VERIFICATION.md) records current source-status
  distinctions. It is not a completed crosswalk or mask approval.
- `lib/domain/forest.ts` holds the published definition, at version `nfi-2` since
  2026-09-09, when the minimum-width condition was added. Recording a condition
  there is publication of the definition, not implementation of a mask.
- `data/staged-acquisitions.json` records the four NRCan definitional products
  staged locally on 2026-09-09, each `productionEligible: false`.
