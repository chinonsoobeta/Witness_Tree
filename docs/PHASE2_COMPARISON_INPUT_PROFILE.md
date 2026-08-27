# Phase 2 comparison input profile

This is a discovery record for the open Phase 2 formal exit criterion
`published-independent-comparisons` in
[`data/phase2-formal-exit-status.json`](../data/phase2-formal-exit-status.json).
Its recorded reason is that every required comparison value and difference is
published null pending like-for-like inputs, and its evidence file is
[`data/phase2-real-comparison-availability.json`](../data/phase2-real-comparison-availability.json).

Nothing here computes a comparison, acquires a source, edits an evidence
record, or changes Phase 2 status. It states what the criterion requires, what
"like-for-like" would have to mean for each required row, which real external
sources could supply the reference figures, what the repository already holds,
and what work remains. Where a fact could not be established from the
repository or from a public publisher page, it is recorded as not determined,
with the specific thing that would determine it.

## 1. What the criterion actually requires

The two records named by the criterion describe availability, not the
completion contract. The operative specification is the fail-closed validator
[`scripts/check-phase2-independent-comparison-evidence.mts`](../scripts/check-phase2-independent-comparison-evidence.mts),
which `scripts/check-phase2-formal-exit-status.mjs` executes through
`validateComparisonCompletion` before it will credit the criterion. Read
against that validator, the requirement is exact.

### 1.1 The comparison rows

| Row family | Quantity on our side | Reference quantity | Reference input id | Geography | Period | Row count |
| --- | --- | --- | --- | --- | --- | ---: |
| Provincial harvest | `witnessTreeHectares` | `provincialPublishedHectares` | `provincial-harvest-statistics` | BC, AB, ON, QC | every year 1984 through 2022 | 156 |
| Burned area | `witnessTreeHectares` | `nbacHectares` | `nbac-1972-2025` | not constrained by the validator | 2022 only | 1 |
| Hansen cross-check | bounded sample result | Hansen Global Forest Change | `hansen-global-forest-change` | not constrained by the validator | not constrained by the validator | 1 |

The province list `["BC","AB","ON","QC"]` and the 39-year span come from
`requiredProvinces` and `baselineYears` in the validator. The NBAC row is
pinned to year 2022 and to the single key `NBAC:2022`. The Hansen row is
pinned to the single key `Hansen:cross-check`, must carry
`fixtureStatus: "real-source-cross-check"`, `role:
"independent-cross-check-not-source"`, `resultClaims: "cross-check-only"`, and
a positive `sampleSize`.

The 156-row requirement can be narrowed to 4 rows (BC, AB, ON, QC for 2022
only) by a separately checksum-bound prompt amendment whose document states
`originalRequirement: "per-province-per-year"`, `amendedRequirement:
"four-province-2022"`, and `targetRows: {provinces: [...], years: [2022]}`. No
such amendment is checked in. `docs/PHASE2_REAL_COMPARISON_AVAILABILITY.md`
already records this and calls the four-row illustrative contract in
[`data/phase2-validation-comparison-contract.json`](../data/phase2-validation-comparison-contract.json)
a scope mismatch rather than a redefinition.

### 1.2 There is no tolerance and no agreement threshold

This matters and is easy to get wrong. Neither the validator nor
[`lib/phase2/validation-comparison.ts`](../lib/phase2/validation-comparison.ts)
contains any tolerance, threshold, or acceptance band. `assertDifferenceRow`
only requires that both areas be finite and non-negative, that
`absoluteDifferenceHectares` equal `Math.abs(ours - reference)`, and that
`relativeDifference` equal `(ours - reference) / reference` (or zero when the
reference is zero). The criterion is satisfied by publishing the difference,
whatever it is, not by the difference being small.

The claim boundary reinforces this. The completion envelope must assert
`likeForLikeClaim: false`, `causalAttributionClaim: false`, and
`productAccuracyClaim: false` while asserting `comparisonResultsExist: true`
and `comparisonResultsPublished: true`. In other words the schema anticipates
a published difference between two quantities that are not the same thing, and
forbids describing it as agreement. The criterion's recorded reason ("pending
like-for-like inputs") is therefore stricter than the machine contract. Which
of the two governs is a decision for the owner, not for an implementer, and it
is the single largest fork in the work below.

### 1.3 The structural evidence the envelope must carry

Beyond the rows themselves, `validateIndependentComparisonEvidence` requires
exactly the keys `claims`, `comparisonScope`, `contract`, `contracts`,
`harvestComparisons`, `inputs`, `nbacComparisons`, `ntemsHansenCrossCheck`,
`publication`, `schemaVersion`, `status`, `witnessTree`, no null anywhere, and:

- Three admitted inputs, no more and no fewer, with the exact ids above. Each
  binds a real publisher profile JSON under repository `data/`, the exact raw
  source bytes under the canonical `../../Witness_Tree-data/raw/` root with
  matching SHA-256 and byte length, a format marker check (ZIP magic, GeoTIFF
  byte order, SQLite header, or valid text), and a separate owner admission
  record carrying the literal statement "I explicitly authorize ingestion,
  release, production admission, and deployment." from `Chinonso Obeta` with
  `decision: "approve"`.
- Six distinct checksum-bound contract documents keyed `method`, `mask`,
  `boundary`, `resampling`, `area`, `uncertainty`, each versioned, each
  matching a required semantic pattern, each a different file.
- An owner-approved real comparison contract at schema
  `witness-tree/phase2-independent-comparison-contract/2` whose scope repeats
  the bound scope.
- The admitted Witness Tree side: the recorded admission record, the V2.1
  raster readback record, every output artifact plus its output record, and a
  new `witness-tree/phase2-comparison-aggregate/1` lineage record that must be
  bound by **both** `admission.evidenceBindings.comparisonAggregate` and
  `readback.comparisonAggregate`. The aggregate carries lineage only (key,
  kind, `referenceInputId`, `witnessTreeOutputId`); the hectare values live on
  the comparison rows.
- Every row must carry a `lineage` block naming its comparison key, reference
  input and Witness Tree output id, and an `uncertainty` block with
  `contractId: "uncertainty"` and a status of `quantified` or `not-quantified`
  plus a written basis. "Not quantified" is permitted if it is stated.
- Bilingual publication: checksum-bound English and French page files, a
  `witness-tree/phase2-comparison-publication/1` metadata record, routes fixed
  at `/en/methods` and `/fr/methodes`, a whole-second UTC timestamp, and both
  page files must literally contain every one of the row keys. The validator
  scans the page bytes for each key string.

## 2. What "like-for-like" would have to mean, row by row

Our figure is not a harvest figure and not a burned-area figure. It is the
area of cells that the V2.1 pipeline observed as forest loss, inside a forest
mask, inside a province boundary. Every property below is fixed by records in
this repository, so the burden falls entirely on the reference side.

Our side's fixed properties, from
[`data/phase2-method-parameters.json`](../data/phase2-method-parameters.json),
[`data/phase2-v21-raster-contract.json`](../data/phase2-v21-raster-contract.json)
and
[`data/phase2-v21-province-zonal-pilot-evidence.json`](../data/phase2-v21-province-zonal-pilot-evidence.json):

- **Forest definition.** The mask is VLCE2 classes 210 (coniferous), 220
  (broadleaf) and 230 (mixedwood). Wetland-treed (81), shrubs (50) and bryoids
  (40) are excluded. This is a land-cover class selection, not an inventory
  definition.
  [`docs/VLCE2_FOREST_MASK_DECISION.md`](VLCE2_FOREST_MASK_DECISION.md)
  is explicit that no class has been shown to satisfy the National Forest
  Inventory conditions, that all 13 class dispositions are unresolved, and that
  mask implementation is not permitted by that gate. The mask that produced the
  admitted rasters therefore exists ahead of the decision record that is meant
  to authorise it.
- **Minimum mapping unit.** `vectorization.minimumPatchPixels` is 1 with
  4-connectivity and no dissolve, so the effective MMU is a single 30 m cell,
  0.09 ha. There is no 0.5 ha or 1 ha area threshold and no crown-closure or
  height condition.
- **Projection and grid.** `gridId: "vlce2-lcc-nad83"`, exact grid match
  required, `rasterReprojection: "forbidden"` in the raster contract and
  `implicitReprojection: "forbidden"` in the mask parameters. Boundaries are
  reprojected to the raster grid, never the reverse.
- **Area basis.** `aggregation.areaUnit` is hectares to 6 decimal places,
  `boundary.cellIntersection` is fractional-area with exact grid alignment and
  a zero snap tolerance, and `denominatorReference` is the first year of the
  range.
- **Non-forest land.** `mask.nodataPolicy: "preserve"` and interval nodata 255
  must never collapse to 0. Non-forest and unobserved are distinct from zero
  loss.
- **Temporal semantics.** The admitted product is not annual. It is eleven
  forest-mask snapshots (1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016,
  2020, 2022) and ten whole-interval loss rasters, the last being 2020 to 2022.
  Per [`lib/phase2/interval-raster.ts`](../lib/phase2/interval-raster.ts) an
  interval cell is 1 if loss was observed in **any** annual pair inside the
  interval, and stays 1 even when other pairs are Unknown. It carries no year
  of loss and no per-year area.
- **Attribution.** None. The precedence list in the method parameters (fire,
  recorded-harvest, insect-disease, other-intervention, unmatched-detected
  change) describes a matching stage that has not been executed against the
  V2.1 outputs. `data/phase2-real-comparison-availability.json` states this
  directly for NFDB: "V2.1 observed loss is not wildfire attribution."

### 2.1 Provincial harvest rows

For a harvest row to be like-for-like rather than merely arithmetically valid,
the reference figure would have to match on all of:

1. **Same calendar year.** Provincial harvest statistics are frequently
   reported on a fiscal or licence year rather than a calendar year. A row
   labelled 2022 that compares a calendar-year detection to an April-to-March
   reporting year is a year mismatch hidden inside a difference.
2. **Same event.** Ours is stand-replacing spectral loss of any cause;
   provincial statistics count harvested area of any spectral signature. Fire,
   blowdown, insect mortality and flooding enter our number and not theirs;
   selection cutting and commercial thinning enter theirs and largely not ours,
   because partial canopy removal frequently does not trigger a 30 m
   stand-replacement detection.
3. **Same detection lag.** A block cut late in year Y is often only separable
   in the Y to Y+1 annual pair or later. Without an agreed lag convention, an
   annual series will be systematically shifted rather than randomly noisy.
4. **Same forest definition and MMU.** Ours admits a single 0.09 ha cell and
   requires VLCE2 class 210/220/230 in the reference snapshot year.
   Administrative harvest area is a surveyed or GIS block area with no land
   cover condition and typically a much larger practical minimum.
5. **Same area basis and boundary.** Ours is fractional-cell area in the
   `vlce2-lcc-nad83` grid, clipped to the 2021 Census cartographic province
   boundary (edition `statcan-2021-provinces-territories-cbf`, PRUID). A
   provincial statistic is a jurisdictional total whose spatial extent is the
   province's own administrative boundary, and which may be scoped to Crown
   land, or to tenured land, or to a management unit subset.
6. **Same treatment of non-forest and unobserved land.** Ours can only report
   loss where the mask says forest and the annual pair is observed. There is
   no equivalent of an unobserved cell in an administrative total, so cloud or
   gap years bias us downward with no counterpart on their side.
7. **Same ownership scope.** If the provincial series covers Crown land only,
   private-land harvest is in our number and not theirs.

The honest summary: no published provincial harvest statistic can be made
like-for-like with an unattributed loss layer. Either an attribution step is
introduced so that our side is "loss attributed to harvest", or the row is
published as a difference between two acknowledged different quantities under
`likeForLikeClaim: false`. That choice is a definitional decision.

### 2.2 The NBAC row

The same structure applies, with one difference in our favour and two against.

- In our favour: burned area is usually stand-replacing at 30 m, so the event
  types overlap far better than harvest does.
- Against, first: NBAC delivers fire **perimeters**. Area inside a perimeter
  includes water, rock, non-forest vegetation and unburned islands. Our number
  is forest-mask-restricted loss. Comparing a perimeter area to a masked loss
  area guarantees a large positive reference bias that is a definitional
  artefact, not an error. Making it like-for-like requires either intersecting
  NBAC perimeters with the same VLCE2 forest mask and the same grid, or using
  an NBAC attribute that already reports burned area rather than gross
  perimeter area. Which attributes the 1972 to 2025 release carries is **not
  determined** here, because the artifact has not been acquired; the shipped
  metadata PDF at
  `https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp_metadata.pdf`
  would determine it.
- Against, second: our side has no year 2022. The finest admitted temporal
  unit containing 2022 is the 2020 to 2022 whole-interval raster, which unions
  three annual pairs. NBAC 2022 is a single fire season. Comparing them is a
  period mismatch, and it is not fixable by an amendment because the amendment
  only narrows the province and year list, it does not redefine what our 2022
  number is.
- Also against, though smaller: NBAC's minimum mapping threshold is not 0.09
  ha. Published methodology describes 200 ha as the candidate threshold for
  the Landsat MSS extension of the series, and NBAC composites agency polygons
  of varying provenance, roughly 10 percent from imagery finer than 5 m and 9
  percent from aerial survey, per the CWFIS methodology literature.
  Small burns below the agency reporting threshold are in our loss layer and
  not in NBAC.

### 2.3 The Hansen cross-check

The validator asks less of this row: a bounded sample, labelled a cross-check,
never a source, with an explicit uncertainty treatment. That is achievable.
Genuine like-for-like is not, and the profile already says so.
[`data/phase2-hansen-gfc-v1.12-sample-profile.json`](../data/phase2-hansen-gfc-v1.12-sample-profile.json)
records the limitations. Adding to them, from the publisher's own page:

- Hansen tree cover is canopy closure for all vegetation taller than 5 m, and
  loss is stand-replacement disturbance or a change from forest to non-forest.
  It is not a land-cover class set and it is not restricted to VLCE2 210/220/230.
  It includes plantations and non-forest tree cover.
- Tiles are 1 arc-second in EPSG:4326. Our grid is a 30 m Lambert conformal
  conic in NAD83 and reprojection is forbidden by contract. Any comparison
  therefore has to resample one product onto the other, and the `resampling`
  contract has to state which direction, which kernel, and what that does to
  the area total. This is a direct tension with `implicitReprojection:
  "forbidden"`, and it is why a `resampling` contract is one of the six
  required documents rather than an implementation detail.
- A 1 arc-second cell is not a constant ground area; it narrows with latitude.
  A hectare figure requires a latitude-weighted area computation, not a pixel
  count times 0.09 ha. The publisher explicitly discourages area estimation
  from pixel counts.
- The lossyear series was reprocessed from 2011 onward, and Landsat 8 from
  2013 onward changes detection sensitivity. The publisher recommends a
  temporal filter for interannual comparison. Our baseline ends in 2022, so
  the comparison must be restricted to codes 1 through 22, as the profile
  already notes.
- Coverage: four 10 by 10 degree tiles are staged, one keyed to each province.
  British Columbia alone spans roughly 48 to 60 N and 114 to 139 W, which is
  several tiles. Full provincial coverage is not staged, so the sample must be
  drawn from within the staged tile extents and the sampling frame must say so.

## 3. Candidate independent sources

### 3.1 Provincial published harvest statistics

**National Forestry Database, Canadian Council of Forest Ministers.** This is
the strongest and probably the only realistic candidate for the reference
figure. It is the CCFM compilation of what the provinces and territories
themselves report. Table 5.2 is area harvested by ownership, management and
harvesting method, covering provincial and territorial Crown and private
forest land under clearcutting, selection cutting and commercial thinning
(`https://cfs.cloud.nrcan.gc.ca/statsprofile/management/harvesting.html`,
`http://nfdp.ccfm.org/en/data/harvest.php`). Licence is Open Government
Licence - Canada and the whole database is machine-retrievable as a Zenodo
archive, mirrored on the federal open data portal
(`https://open.canada.ca/data/en/dataset/011ff922-fb26-4edc-9474-f10acf410dbc`,
`https://zenodo.org/record/3690045`). Update frequency is annual. The
`nfdp.ccfm.org` host serves plain HTTP and refused an HTTPS connection during
this profiling, so the Zenodo or open.canada.ca route is the retrievable one.

Like-for-like assessment: partially. It is the right quantity name, the right
geography, and the right annual cadence back well before 1984. It is not the
same measurement as ours for the reasons in section 2.1. Two specific
properties are **not determined** here and must be read off the table notes
before any row is computed: whether the year label is a calendar or fiscal
year, and whether coverage is complete for private land in each of BC, AB, ON
and QC across the full 1984 to 2022 span. Downloading and reading the table
notes determines both.

**Individual provincial publications** (BC Harvest Billing System and forest
tenure reporting, Alberta annual timber harvest reporting, Ontario annual
report on forest management, Quebec's ministry harvest statistics). These are
the upstream inputs to NFD. Using four separate provincial series instead of
one compiled series multiplies the definitional review by four and introduces
four separate licence reviews, for no gain in independence. Not recommended
unless NFD proves to have a gap for a specific province-year.

**State of Canada's Forests annual report.** Not an independent source. It
republishes NFD figures with NRCan commentary. Using it would be double
counting the same measurement, and it reports mainly at national level.

**FAO Global Forest Resources Assessment country reports.** Not usable. FRA
country reports are compiled and submitted by Canada from the same national
sources, at national scale, on a five-year cycle, using the FAO forest
definition rather than Canada's. Wrong geography, wrong cadence, wrong
definition, and not independent. The specific content of the FRA 2020 Canada
report is **not determined** here: the FAO document server returned HTTP 403
during this profiling.

**NRCan CA Forest Harvest 1985 to 2022 raster.** This is the archive already
staged at
`../../Witness_Tree-data/raw/nrcan-ca-forest-harvest-1985-2022/2026-08-14/CA_Forest_Harvest_1985-2022.zip`
and profiled in [`data/nrcan-harvest-profile.json`](../data/nrcan-harvest-profile.json).
**It is not an independent source and it must not be used as one.** It is a
product of the same National Terrestrial Ecosystem Monitoring System, derived
from the same Landsat Best-Available-Pixel composites by the same group that
produces VLCE2 (`https://open.canada.ca/data/en/dataset/87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe`,
`https://gee-community-catalog.org/projects/ca_forest_harvest/`). A comparison
against it measures internal consistency between two siblings, not external
agreement, and publishing it as an independent comparison would be misleading.
The validator agrees: it requires the input id
`provincial-harvest-statistics`, and this archive is not that. Its useful role
is different and real: it is a plausible attribution layer, which is exactly
what our side lacks. That is a separate piece of work with a separate
definitional decision, since its own profile records that it maps only the year
of greatest mapped harvest disturbance per pixel and that an agricultural mask
was applied.

**SCANFI and the National Forest Inventory.** Neither publishes annual area
harvested by province. NFI is a photo-plot and ground-plot sample inventory on
a long remeasurement cycle; SCANFI is a spatialised NFI attribute product.
They are candidates for resolving the forest definition question in section
2, not for supplying a harvest reference. Note also that the definition is
genuinely contested: the plan wording recorded in
`docs/VLCE2_FOREST_MASK_DECISION.md` is 1 ha with at least 10 percent crown
closure and 5 m potential height, while Canada's carbon reporting systems use
1 ha with more than 25 percent crown cover and public NFI material also
describes a 0.5 ha, 10 percent, 5 m variant. Picking one is a human decision.

### 3.2 NBAC

**National Burned Area Composite, Canadian Forest Service.** The required
artifact is named exactly in
`data/phase2-real-comparison-availability.json` and in
[`data/partial-ledger-owner-review-outreach-package.json`](../data/partial-ledger-owner-review-outreach-package.json):
`https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp.zip`,
with metadata PDF alongside it and an end-user agreement at
`https://cwfis.cfs.nrcan.gc.ca/datamart/datarequest/nbac`. It publishes annual
polygon layers of best-available fire perimeters, nationally, annually, from
1972 (Landsat MSS extension) or 1984 (main series) to present.

Retrievability is not the blocker. `docs/PARTIAL_LEDGER_EVIDENCE_AUDIT.md`
records that a HEAD inspection established the exact ZIP is publicly listed
and reachable. The blocker is legal: the affirmative end-user agreement has
not been accepted and written Canadian consent for archival, transformation
and derived publication has not been obtained.
`docs/PHASE1_PHASE3_OWNER_APPROVALS_2026-08-21.md` records that the bilingual
request email was drafted, deduplicated against Sent mail, and then rejected
by the connector as an irreversible disclosure; it remains unsent.

Like-for-like assessment: the best of the three on event type, the worst on
geometry semantics, as set out in section 2.2. There is no substitute source.
The Canadian National Fire Database polygons already staged locally
(`../../Witness_Tree-data/staging/nfdb-poly-current/NFDB_poly_verified.zip`)
are recorded in the availability file as `not-like-for-like`, and that
assessment is correct for two independent reasons: NFDB is not the artifact
the criterion names, and our loss layer carries no fire attribution to compare
against it.

### 3.3 Hansen Global Forest Change

**GLAD laboratory, University of Maryland, Global Forest Change 2000 to 2024,
version 1.12.** CC BY 4.0, tiled GeoTIFF, directly downloadable per tile from
`https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/download.html`.
Four `lossyear` tiles are already staged and checksum-bound. This is the one
required input the project genuinely holds.

Like-for-like assessment: deliberately not like-for-like, and the criterion
does not ask it to be. The plan text in
`docs/CONTROLLING_IMPLEMENTATION_PLAN.md` section 15.3 says to cross check a
sample "as an independent product, labelled as a cross check and never as a
source", and the validator enforces exactly that labelling. Treat the mismatch
as documented context, not as something to be engineered away.

**Global Forest Watch** is a presentation layer over the same Hansen loss
data. It is not a second independent source and using both would double count.

## 4. What this repository already holds

Present, real, and usable as-is:

- Four Hansen v1.12 `lossyear` tiles, checksum-bound, with a real publisher
  profile at `data/phase2-hansen-gfc-v1.12-sample-profile.json`. That profile
  already satisfies the shape `validateAdmittedInput` expects of a profile
  (an `artifacts` array with `localPath`, `sha256`, `byteLength`, a `source`
  object, and claims that are all false). It has no owner admission record.
- The admitted V2.1 baseline:
  [`data/phase2-admission-record-2026-08-26.json`](../data/phase2-admission-record-2026-08-26.json)
  binds 42 artifacts, being 11 forest-mask snapshots and 10 whole-interval loss
  rasters plus their 21 sidecars, with
  [`data/phase2-v21-raster-readback-evidence.json`](../data/phase2-v21-raster-readback-evidence.json)
  as the readback.
- A real national annual loss inventory. `docs/PHASE2_REAL_LOSS_COMPONENT_INVENTORY.md`
  and [`data/phase2-real-loss-component-inventory-readback.json`](../data/phase2-real-loss-component-inventory-readback.json)
  record that all 38 adjacent annual pairs from 1984-1985 to 2021-2022 were
  computed, with a per-pair `lossCellCount` and `connectedComponentCount` for
  every year, checksum-verified. This is the closest thing the project has to
  an annual series. It is national, not provincial, and it is not admitted.
- One province-level aggregate: `data/phase2-v21-province-zonal-pilot-evidence.json`,
  13 rows, time version 2020-2022, boundary edition
  `statcan-2021-provinces-territories-cbf`, coverage grade complete. The
  hectare values themselves live in the owner-local output
  `province-2020-2022.json` on the data root, not in the repository.
- The complete completion contract, in code: the validator, its 841 lines of
  fail-closed structure, and its test suite
  [`tests/phase2-independent-comparison-evidence.test.mjs`](../tests/phase2-independent-comparison-evidence.test.mjs).
- The zonal aggregation worker `scripts/phase2_zonal_aggregate.py` and its
  contract, already proven on the 2020-2022 interval.
- Drafted but unsent outreach for NBAC, in `data/partial-ledger-owner-review-outreach-package.json`.

Described but not present:

- The four-row harvest and one-row NBAC comparison structure in
  `data/phase2-validation-comparison-contract.json`. It is labelled
  `synthetic-illustrative-framework-no-validation-results` with every value
  null. It is a shape, not an input, and the docs already say it cannot serve
  as completion evidence.
- The `provincial-harvest-statistics` input id. It appears only in the
  validator and its tests. It appears nowhere under `data/`. The availability
  record's nearest source is `ca-forest-harvest-1985-2022`, which as section
  3.1 explains is a different and non-independent thing.
- The six method contracts. `data/phase2-method-parameters.json` is a plausible
  `method` contract and is already bound by the admission record as
  `evidenceBindings.methodParameters`. The other five (`mask`, `boundary`,
  `resampling`, `area`, `uncertainty`) do not exist as distinct files. Note
  that `boundary` may be satisfiable by `data/boundary-editions.json`, but
  that is a judgement about semantics the validator checks only by regular
  expression, so a purpose-written document is safer.
- The forest-mask decision. `docs/VLCE2_FOREST_MASK_DECISION.md` is a template
  with every class disposition unresolved and the gate outcome recorded as
  "Mask implementation permitted: No".

Aspirational only:

- Any attribution of V2.1 loss to cause. The precedence order exists in the
  method parameters; no matching run against V2.1 outputs is recorded.
- Any annual provincial figure. No annual raster output exists and no annual
  zonal aggregate exists.
- The comparison aggregate record, the bilingual publication pages carrying the
  row keys, and the publication metadata record. None exist.

### 4.1 A structural conflict that will block the work

The completion validator requires `admission.evidenceBindings.comparisonAggregate`
and reads `readback.comparisonAggregate`. Neither key exists today, and neither
can simply be added:

- `scripts/check-phase2-admission-record-template.mjs` line 57 requires the
  admission record's key set to be exactly `artifactBindings`, `claims`,
  `evidenceBindings`, `ownerDecision`, `schemaVersion`,
  `sourceInputAdmissionRecords`, `status`, and line 61 requires
  `record.evidenceBindings` to deep-equal `template.requiredEvidenceBindings`,
  which that same checker hardcodes to exactly three keys: `rasterReadback`,
  `methodParameters`, `zonalAggregate`. A fourth key fails.
- `scripts/check-phase2-formal-exit-status.mjs` runs both that admission
  validator and the comparison validator in the same pass, so both must pass
  at once. Today they cannot.
- Adding `comparisonAggregate` to the readback file changes its SHA-256, which
  is bound in the admission record and in
  `data/phase2-v21-province-zonal-pilot-evidence.json` under
  `inputBindings.sourceRasterReadbackEvidence.sha256`, which in turn changes
  that file's own hash where the admission record binds it. The rebinding is
  resolvable but must be sequenced, and it lands inside an owner-signed
  admission.

This is not a data problem. It is a contract conflict between two checkers
that must be reconciled before any comparison row can be accepted, and because
it changes the admission record it needs a fresh owner decision, not just an
edit.

## 5. The gap, stated as work

Ordered. Each item names its blocking dependency and its kind.

1. **Decide whether "like-for-like" governs, or whether the machine contract
   governs.** Human decision only. The criterion's recorded reason says the
   nulls stand pending like-for-like inputs; the validator accepts published
   differences between acknowledged different quantities with
   `likeForLikeClaim: false`. Everything below assumes the machine contract
   governs. If the recorded reason governs instead, then the harvest rows are
   unsatisfiable without an attribution product and the NBAC row is
   unsatisfiable without an annual 2022 output, and the honest outcome is that
   the criterion stays open. Blocks: everything.
2. **Decide the scope: 156 rows or a bound four-province 2022 amendment.**
   Human decision only. The amendment must be a checksum-bound document with
   the exact fields in section 1.1. Note the amendment does not fix the
   temporal mismatch described in 2.2; it only reduces row count. Blocks:
   items 5, 8, 10.
3. **Resolve the forest-definition and mask gate.** Human decision, with
   subject-matter review. `docs/VLCE2_FOREST_MASK_DECISION.md` requires a
   disposition for all 13 VLCE2 classes and resolution of the area,
   connectivity, crown closure, height, land use, unstocked, temporal and
   boundary conditions. Until it is signed, the `mask` contract required by the
   validator cannot honestly claim a definition, and any published comparison
   inherits an unapproved denominator. Blocks: item 7, and the credibility of
   items 8 and 9.
4. **Reconcile the admission-record and comparison-evidence contracts.**
   Pure engineering plus a fresh owner admission. Amend
   `scripts/check-phase2-admission-record-template.mjs` to admit a
   `comparisonAggregate` binding, add the key to
   `data/phase2-admission-record.template.json`, add `comparisonAggregate` to
   the readback record, and re-record the admission with the corrected hash
   chain in the order readback, zonal pilot, template, admission. Blocked by
   nothing technical; blocked by the owner decision the admission encodes.
   Blocks: item 10.
5. **Produce the Witness Tree hectare figures the rows need.** Pure
   engineering plus compute, no external download. Under scope option 156, this
   is an annual national loss raster series for 1984 through 2022 followed by
   annual provincial zonal aggregation; the 38 annual pairs already exist as
   component lineage per `docs/PHASE2_REAL_LOSS_COMPONENT_INVENTORY.md`, so the
   inputs are in hand and the work is rasterisation plus 39 zonal runs. Under
   scope option 4, the only available figure is the 2020-2022 interval
   aggregate that already exists, and labelling it "2022" is a definitional
   decision, not an engineering one. The new outputs would need their own
   admission. Blocked by items 2 and 4.
6. **Acquire the provincial harvest reference series.** External download the
   project does not hold. Retrieve the National Forestry Database archive from
   Zenodo or open.canada.ca under Open Government Licence - Canada, place the
   exact archive under `../../Witness_Tree-data/raw/`, and write a real
   publisher profile under `data/` with matching bytes and checksum. Then read
   the Table 5.2 notes to settle the two undetermined properties in section
   3.1 (calendar versus fiscal year, private-land coverage by province and
   year) and record the answers in the `method` or `area` contract. Blocked by
   nothing; this is the single most tractable open item.
7. **Write the six method contracts.** Pure engineering, but the `mask` one is
   gated by item 3 and the `area` one needs item 6's answers. They must be six
   distinct versioned files, none production eligible, each matching its
   required semantic pattern. The `resampling` contract has to state
   explicitly how the Hansen EPSG:4326 arc-second grid is reconciled with the
   forbidden-reprojection `vlce2-lcc-nad83` grid, and how latitude-varying cell
   area is handled, since pixel counting is discouraged by Hansen's publisher.
8. **Obtain NBAC.** External, and legally blocked rather than technically
   blocked. An accountable person must review the end-user agreement at
   `https://cwfis.cfs.nrcan.gc.ca/datamart/datarequest/nbac`, decide whether to
   accept it, and obtain written Canadian consent covering archival,
   transformation and derived publication. The drafted bilingual request in
   `data/partial-ledger-owner-review-outreach-package.json` is unsent, and
   sending it is itself an owner action. Until that closes, the `NBAC:2022` row
   cannot exist, and because the validator requires exactly one NBAC row and
   exactly three inputs, the whole criterion cannot complete. **This is the
   hard external blocker on the criterion.**
9. **Compute the bounded Hansen cross-check.** Pure engineering once item 7's
   `resampling` and `area` contracts exist. Inputs are already staged. The
   sampling frame must be drawn inside the four staged tile extents and must
   restrict lossyear to codes 1 through 22. Record the uncertainty treatment
   honestly, including `not-quantified` with a written basis if that is the
   truth.
10. **Record three owner input admissions, assemble the envelope, and publish.**
    Pure engineering plus three owner signatures. Each of
    `provincial-harvest-statistics`, `nbac-1972-2025` and
    `hansen-global-forest-change` needs an admission record at schema
    `witness-tree/phase2-source-input-admission` with the literal authorization
    statement. Then build the comparison aggregate, the rows with lineage and
    uncertainty, the bilingual `/en/methods` and `/fr/methodes` pages that
    literally contain every row key, and the publication metadata. Blocked by
    every item above.

### 5.1 Compressed verdict

| Comparison | Genuinely like-for-like input available? | Next concrete step |
| --- | --- | --- |
| Provincial harvest, BC/AB/ON/QC | No. NFD Table 5.2 is the right quantity name at the right geography and cadence, but it counts a different event than an unattributed loss layer, and no published source fixes that. It is publishable as a documented difference under `likeForLikeClaim: false`. | Download the NFD archive from `https://zenodo.org/record/3690045` into the raw data root, checksum it, and read the Table 5.2 notes for calendar-versus-fiscal year and private-land coverage. |
| Burned area, NBAC 2022 | Not available at all, and not for definitional reasons. The artifact exists and is reachable; the end-user agreement is unaccepted and written consent is unresolved. Even once acquired it is perimeter area against masked loss, and our side has no 2022, only a 2020-2022 interval. | An accountable person reviews the NBAC end-user agreement and decides whether to accept it. Nothing else moves this row. |
| Hansen cross-check | Not like-for-like by design, and the criterion does not require it to be. The input is present and checksum-bound. | Write the `resampling` and `area` contracts fixing the EPSG:4326 to `vlce2-lcc-nad83` reconciliation and latitude-weighted area, then compute a bounded sample inside the four staged tiles restricted to lossyear codes 1 to 22. |

The criterion cannot complete while item 8 is open, regardless of how much of
the rest is built. That is the honest headline.
