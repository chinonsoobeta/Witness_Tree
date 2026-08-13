# VLCE2 forest-mask decision record

**Status:** Decision required — no mask may be implemented from this record.

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

If a source cannot be pinned to an immutable object/version and checksum, record
that limitation and do not use it to close this gate.

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

| Condition | Decision to record | Minimum acceptance evidence | State |
| --- | --- | --- | --- |
| NFI area threshold | How the at-least-1-hectare condition is measured from categorical 30-m cells, including aggregation and boundary-edge rules | Reproducible method version; sensitivity/edge-case results; independent review | Unresolved |
| Connectivity | Whether and how cells must be contiguous for area qualification, including adjacency, holes, and diagonal-touch rules | Written rule, test geometries, and independent validation | Unresolved |
| Crown closure | How the at-least-10% condition is demonstrated, or why a class is excluded when VLCE2 cannot demonstrate it | Versioned authoritative source and class-to-condition evidence | Unresolved |
| Mature-tree height | How “able to reach 5 metres at maturity” is demonstrated; a current canopy-height raster is not automatically a maturity-capability measure | Versioned authoritative source and documented applicability by class/year | Unresolved |
| Land use | How agricultural, urban, plantation, orchard, wetland, and other land-use distinctions are treated when relevant | Written rule, authoritative source, and exceptions | Unresolved |
| Temporarily unstocked land | Whether a temporarily unstocked area remains in the denominator, for how long, and what source evidence establishes that status | Written rule, time-window, evidence source, and counterexamples | Unresolved |
| Temporal alignment | Which mask year applies to every requested time range and how the method handles unavailable years | Versioned rule and tests for start/end-year cases | Unresolved |
| Boundary intersection | How boundary edition, CRS/grid alignment, partial cells, and water/edge treatment affect denominator area | Reproducible method, boundary version, and validation cases | Unresolved |

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
