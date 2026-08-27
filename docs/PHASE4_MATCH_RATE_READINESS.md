# Phase 4 match-rate readiness

Discovery only. Nothing in this document was computed, admitted, or published.
No file under `data/`, no methods page, and no check was changed to produce it.
Where a fact could not be established from repository files it is written as
"not determined" with the thing that would determine it.

## 1. What the criterion demands, exactly

`data/phase4-exit-status.json:51-72` holds the failing criterion. Its text:

> `"id": "published-match-and-non-match-rates"`,
> `"title": "Match rate, non-match rate, and non-match-reason distribution are published on the methods page"`,
> `"status": "fail"`,
> `"reason": "The methods page explicitly reports these results as unavailable; no admitted, versioned provincial processing run exists from which numeric rates or a reason distribution can be published."`

Its bound evidence is `components/transparency/MethodologyPage.tsx`,
`docs/PHASE4_OPTIONAL_ENHANCEMENT_GATE.md`, and `docs/PLAN_GAP_MATRIX.md`.

The plan wording it implements is `docs/CONTROLLING_IMPLEMENTATION_PLAN.md:1473`:
"Match rate, non-match rate and the distribution of non-match reasons are
published on the methods page." The reason distribution is defined at
`docs/CONTROLLING_IMPLEMENTATION_PLAN.md:398`, which names the causes to
record: the change sits outside a provincial reporting boundary, the record
exists but is not published, the change is natural, the change is on private
land with no reporting obligation, or the match failed on a date or geometry
tolerance.

### The machine definition

The prose is not the operative definition. `scripts/check-phase4-exit-status.mjs`
derives the criterion status from the evidence bytes and refuses any status the
evidence does not support (`scripts/check-phase4-exit-status.mjs:299-300`). For
this criterion it calls `validReportingBundle`
(`scripts/check-phase4-exit-status.mjs:269-270, 235-237`), which is
`inspectReportingBundle` at `scripts/check-phase4-exit-status.mjs:198-232`.

A passing bundle is five checksum-bound JSON records plus the two methods-page
files, all listed as criterion evidence:

| Schema constant | Value | Declared at |
| --- | --- | --- |
| `REPORT_SCHEMA` | `witness-tree/phase4-provincial-matching-report/1` | `scripts/check-phase4-exit-status.mjs:13` |
| `ADMISSION_SCHEMA` | `witness-tree/phase4-provincial-matching-admission/1` | `scripts/check-phase4-exit-status.mjs:14` |
| `PUBLICATION_SCHEMA` | `witness-tree/phase4-provincial-matching-publication/1` | `scripts/check-phase4-exit-status.mjs:15` |
| `RELEASE_SCHEMA` | `witness-tree/phase4-provincial-matching-release/1` | `scripts/check-phase4-exit-status.mjs:16` |
| `REVIEW_SCHEMA` | `witness-tree/phase4-provincial-matching-outside-review/1` | `scripts/check-phase4-exit-status.mjs:17` |

What each must contain, in the checker's own terms:

* **Report** (`validNumericReport`, `scripts/check-phase4-exit-status.mjs:179-196`).
  `status` exactly `"admitted-production"`, `productionEligible` true, `claims`
  exactly `{comparisonResultsExist: true, productionEligible: true, released: false}`,
  and a `readiness` object with all five flags true, including
  `changeGeometryMaterialized`. `counts.assessedChanges` must be a positive
  integer and `matchedChanges + unmatchedChanges` must equal it. `matchRate` and
  `nonMatchRate` must each be a finite number in `[0,1]`, must sum to 1 within
  `1e-12`, and must each equal their count ratio within `1e-12`. The reason
  counts must sum exactly to `counts.unmatchedChanges`. This is the arithmetic
  that makes a fabricated or rounded rate fail.
* **Granularity.** One run, not per province and not per year. `scope` must be
  exactly the object `{provinces: ["BC", "QC"]}` in that order
  (`scripts/check-phase4-exit-status.mjs:120-122`), and the same object must
  appear identically in the report, the admission, and the outside review
  (`scripts/check-phase4-exit-status.mjs:217, 222`). A Québec-only run does not
  satisfy this criterion. The rates are whole-run rates over assessed changes.
* **Admission** (`scripts/check-phase4-exit-status.mjs:217-218`). Status
  `"recorded-production-admission"`, claims exactly
  `{admitted: true, released: false, productionEligible: true}`, binding the
  report's SHA-256 and `runId`, the same input bindings, and a human owner
  decision: `decision: "approve"`, `isHuman: true`, a name, a role, a UTC
  `decidedAt`, and a rationale of at least 32 characters
  (`scripts/check-phase4-exit-status.mjs:126-134`). Placeholder identities such
  as "test", "example", or "unknown" are rejected outside the test fixture
  directory (`scripts/check-phase4-exit-status.mjs:104-112`).
* **Publication** (`scripts/check-phase4-exit-status.mjs:219-220`). Status
  `"published-bilingual-production"`, `released` and `productionEligible` true,
  binding the report and admission hashes, and exactly two `methodsPagePaths`,
  each of which must itself be criterion evidence. Its `matchRate` and
  `nonMatchRate` must equal the report's values exactly and its reason
  distribution must be identical as a set of pairs.
* **Release** (`scripts/check-phase4-exit-status.mjs:221`). Status
  `"released-production"`, a non-empty `version`, and the report, admission,
  publication, and outside-review hashes.
* **Outside review** (`scripts/check-phase4-exit-status.mjs:222-227`). Status
  `"approved"`, exactly two provinces `BC` and `QC`, and exactly two reviewers,
  one per province, each `isHuman: true`, `independent: true`,
  `noConflict: true`, `decision: "approved"`, with substantive name, role,
  qualification, affiliation, findings, notes, and a UTC `reviewedAt`
  (`scripts/check-phase4-exit-status.mjs:136-154`).
* **Methods pages** (`scripts/check-phase4-exit-status.mjs:228-231`). For each of
  the two paths, the file text must **not** match `/not available|unavailable|not
  admitted/i`, and must match all three of `/match rate|taux d[’']appariement/i`,
  `/non-match rate|taux de non-appariement/i`, and
  `/non-match-reason distribution|répartition des motifs de non-appariement/i`.

The same bundle also drives both blocked checkpoints
(`scripts/check-phase4-exit-status.mjs:239-245`): `rights-and-admission` passes
only when the admission's four source flags are true, and
`outside-provincial-review` passes only when the review status is `"approved"`.
So one valid bundle would flip the criterion and both checkpoints at once, which
is what takes Phase 4 to `complete` (`scripts/check-phase4-exit-status.mjs:321`).

The exact intended shape of a passing bundle is modelled in
`tests/phase4-exit-status.test.mjs:23-105` (`writePositiveBundle`), which is the
closest thing in the repository to a specification of the target artifacts.

## 2. What the matching process actually is

### The policy

`lib/pipeline/matching.ts` is the whole matching policy. It compares a
**detected change** against **official record candidates**.

* `DetectedChange` (`lib/pipeline/matching.ts:10-14`) is `{id, observationYear,
  geometryHectares}`. It is a satellite-derived change patch.
* `OfficialRecordCandidate` (`lib/pipeline/matching.ts:17-22`) is `{id,
  eventYear, geometryHectares, intersectionHectares}`. It is an official event
  record already paired with the change, with the intersection area precomputed
  by the caller. The comment at `lib/pipeline/matching.ts:82-85` states the
  reason: the policy stays independent of any particular spatial database, so
  the intersection is supplied, not computed here.
* Parameters (`lib/pipeline/matching.ts:3-8`): minimum overlap 0.5 of the
  smaller geometry; temporal tolerance 2 years, widened to 3 years for
  observation years before 1995 (`lib/pipeline/matching.ts:54-58`).
* Overlap is intersection divided by the smaller of the two areas, or `null` for
  any non-finite, non-positive, or impossible input
  (`lib/pipeline/matching.ts:61-80`).

`matchDetectedChange` (`lib/pipeline/matching.ts:86-135`) classifies each
candidate, sorts the qualifying ones by descending overlap, selects the highest,
and demotes the rest. A matched change gets `evidenceClass:
"official-record"`; an unmatched change gets `"satellite-observation"` and a
`nonMatchReason` string defaulting to "No official record met the date and
geometry matching tolerances." (`lib/pipeline/matching.ts:133`).

### The candidate rejection reason codes, enumerated

`CandidateRejectionReason` at `lib/pipeline/matching.ts:24-27`:

* `outside-temporal-tolerance` (assigned at `lib/pipeline/matching.ts:105`)
* `below-spatial-tolerance` (`lib/pipeline/matching.ts:107`)
* `invalid-geometry` (`lib/pipeline/matching.ts:103`)

plus one more that `RejectedCandidate.reason` admits
(`lib/pipeline/matching.ts:32`) and that only ever applies to a change that did
match:

* `lower-overlap-than-selected` (`lib/pipeline/matching.ts:119`)

### The reason distribution keys

`lib/phase4/provincial-matching.ts:64-66` builds the distribution keys. They are
not the four codes above directly. For each unmatched change:

* if the change had no candidates at all, the key is the literal
  `no-official-record-candidates`;
* otherwise the key is every rejected candidate's reason, sorted
  alphabetically and joined with commas, so a change rejected on both grounds
  produces the composite key `below-spatial-tolerance,outside-temporal-tolerance`;
* if that join is empty, the key is the literal `no-qualifying-official-record`.

So the publishable key space is: `no-official-record-candidates`,
`no-qualifying-official-record`, and every non-empty sorted combination of
`below-spatial-tolerance`, `invalid-geometry`, and `outside-temporal-tolerance`.
Note that this is a mechanical taxonomy of tolerance failures. It does not carry
the plan's causal categories from
`docs/CONTROLLING_IMPLEMENTATION_PLAN.md:398` ("outside a provincial reporting
boundary", "record exists but is not published", "the change is natural",
"private land"). Whether the owner considers the mechanical taxonomy sufficient
for the plan's exit criterion is **not determined**; the exit checker accepts
any non-empty reason keys whose counts sum correctly
(`scripts/check-phase4-exit-status.mjs:190-195`), so the checker would pass on
the mechanical keys alone.

### Where the outputs land

Nowhere yet. `reportProvincialMatching`
(`lib/phase4/provincial-matching.ts:37-78`) returns a value; it writes no file.
Its five readiness flags (`lib/phase4/provincial-matching.ts:41-47`) each
produce a blocker string, and a blocked report returns all-null values with
`counts: null`, never zeroes (`lib/phase4/provincial-matching.ts:48-53`). Even a
computed report is hard-coded `productionEligible: false` and
`status: "computed-nonproduction"` (`lib/phase4/provincial-matching.ts:23, 72`),
so this function alone cannot produce the `"admitted-production"` report the
exit checker requires.

The only current on-disk artifact is `data/phase4-provincial-matching-preflight.json`,
whose `result` block is all null with `productionEligible: false`, and whose
validator `scripts/check-phase4-provincial-matching-preflight.mjs:24` actively
throws if any numeric value or production eligibility ever appears in it.

### There is no caller

Grepping the whole repository, `matchDetectedChange` and
`reportProvincialMatching` are referenced only by `lib/phase4/provincial-matching.ts`
itself and by four test files (`tests/matching-precedence.test.ts`,
`tests/phase1-corruption-gate.test.ts`, `tests/phase4-optional-enhancement.test.ts`,
`tests/phase4-provincial-matching.test.ts`). No script, no route, and no pipeline
stage feeds either function. Nothing in the repository constructs an
`OfficialRecordCandidate` from real data.

Two further code-level obstacles sit between real data and these functions:

* `lib/events/normalize.ts:24` throws unless `input.status === "example"`, and
  `NormalizedForestEvent.status` is the literal type `"example"`
  (`lib/events/types.ts:30`). The event normalizer is fixture-only by contract.
  Real Québec or BC events cannot pass through it without a type-contract change.
* A `NormalizedForestEvent` (`lib/events/types.ts:29-39`) carries `hectares` but
  no geometry and no record identifier usable for a spatial join, so it is not
  an `OfficialRecordCandidate`. The `intersectionHectares` value has to come from
  a spatial operation that does not exist anywhere in this repository.

## 3. What "an admitted, versioned provincial processing run" means here

### One complete example, end to end: federal electoral districts

This is the only chain in the repository that reaches production admission.

1. **Scope approval.** `data/phase1-transformation-scope-owner-approval-2026-08-25.json`
   is the owner's scope-only approval covering all seven Phase 1 transformation
   scopes. It authorizes nothing beyond scope.
2. **Specification.** `data/phase1-production-transformation-specifications-v1.json`,
   documented in `docs/PHASE1_PRODUCTION_TRANSFORMATION_SPECIFICATIONS_V1.md`,
   defines the deterministic operation.
3. **Execution approval.** `data/phase1-federal-electoral-execution-approval.json`,
   schema `witness-tree/phase1-federal-electoral-execution-approval/1`, status
   `owner-authorized-execution`. It binds the packet SHA-256, the owner scope
   approval SHA-256, the spec SHA-256, the runner path plus SHA-256 plus version,
   and the exact source archive SHA-256 and byte length. This is the file that
   authorizes.
4. **Runner.** `scripts/run-phase1-federal-electoral-transformation.mjs`, bound
   by SHA-256 inside the execution approval. This is what executes.
5. **Sidecar.** The runner writes a canonical JSON sidecar beside the output
   GeoPackage in the data root, recorded in
   `data/phase1-federal-electoral-output-verification-evidence.json` as
   `output.sidecarPath` and `output.sidecarByteLength`.
6. **Readback / verification evidence.**
   `data/phase1-federal-electoral-output-verification-evidence.json` records the
   output path, SHA-256, byte length, layer, feature count, and a deterministic
   regeneration with `exactByteMatch: true`. Its `claims` block asserts
   `transformationVerified: true` with `ingested`, `released`,
   `productionAdmission`, `productionEligible`, and `deployment` all `false`.
   Verification is explicitly not admission.
7. **Admission.** `data/phase1-federal-electoral-production-admission.json`,
   schema `witness-tree/phase1-production-admission/1`, status
   `owner-approved-admitted-and-release-approved`, with the owner statement "I
   explicitly authorize ingestion, release, production admission, and
   deployment." It names the ledger rows it admits (`fed-2023-ridings`,
   `elections-canada-45th-files`), the shared artifact and its hashes, and an
   `evidenceBindings` list binding every prior link in the chain by SHA-256.
8. **Ledger.** `data/phase1-production-source-ledger.json` then carries those two
   rows as `evidenceState: "production-admitted"` with
   `proof.productionAdmission: true` and `productionEligible: true`. They are the
   only two such rows in the ledger.

The Québec equivalent of the same chain is documented in
`docs/QC_STAND_COPY_RUNNER.md` and `docs/QC_STAND_COPY_PRODUCTION_ADMISSION_READINESS.md`,
with the readback verifier `scripts/verify-qc-stand-copy-readback.mjs` and the
write-once admission preparer `scripts/prepare-qc-stand-copy-production-admission.mjs`.

### Which of those artifacts exist for a provincial matching run today

Two separate chains matter. Neither is complete.

**Chain A, the Québec stand-copy transformation** (an input to matching, not
matching itself):

| Artifact | State |
| --- | --- |
| Scope approval | Exists: `data/phase1-transformation-scope-owner-approval-2026-08-25.json` |
| Specifications | Exist: `data/transformation-specs/qc-current-ecoforest-stand-copy-v1.json` and `data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json`, both `"status": "specified-not-approved-not-executed"` |
| Execution approvals | Exist and are bound: `data/phase1-qc-current-ecoforest-execution-approval.json` and `data/phase1-qc-original-current-inventory-execution-approval.json`, both `executionAuthorized: true`, all downstream flags false |
| Runner | Exists: `scripts/run-qc-stand-copy.mjs`, SHA-256 bound by both approvals |
| Runner sidecars | Do not exist. No file matching the approvals' `outputBinding.sidecarRelativePath` is recorded anywhere in `data/` |
| Readback evidence | Does not exist. No `data/qc-*-stand-copy-readback-evidence.json` is present |
| Admission record | Does not exist. No `data/phase1-qc-stand-copy-production-admission.json` is present |
| Ledger state | `qc-current-ecoforest` and `qc-original-current-inventory` are both `remote-verified-archived-profiled`, `productionAdmission: false`, `productionEligible: false` |

Note the stale sentence in `docs/QC_STAND_COPY_RUNNER.md`: "No such record is
present in this repository. The runner will refuse execution until one exists
and matches exactly." Both execution approvals now exist, so that line is out of
date with respect to `data/phase1-qc-current-ecoforest-execution-approval.json`.
Whether the runner would actually accept them is not verified here, because
verifying it means running the runner against the data root.

**Chain B, the Phase 4 provincial matching run itself:**

| Artifact | State |
| --- | --- |
| Execution approval for a matching run | Does not exist. No file uses a Phase 4 matching execution-approval schema |
| Runner | Does not exist. `lib/phase4/provincial-matching.ts` is a library function with no caller outside tests |
| Report (`.../phase4-provincial-matching-report/1`) | Does not exist. The string appears only in `scripts/check-phase4-exit-status.mjs` and `tests/phase4-exit-status.test.mjs` |
| Admission, publication, release, outside review | None exist. Same finding for all four schema strings |
| Preflight | Exists and is deliberately null-valued: `data/phase4-provincial-matching-preflight.json` |

## 4. Which provinces are in scope, and the state of each

Scope is British Columbia and Québec, and only those two. Three independent
places agree: the plan heading `docs/CONTROLLING_IMPLEMENTATION_PLAN.md:1440`
("Phase 4. Provincial enhancement: British Columbia and Quebec"); the type
`ProvincialEnhancementProvince = "BC" | "QC"` with the guard at
`lib/phase4/optional-enhancement.ts:45, 60`; and the exit checker's exact scope
`["BC", "QC"]` at `scripts/check-phase4-exit-status.mjs:120-122`.

`lib/phase4/provincial-matching.ts:7` types `ProvincialChange` with the same two
provinces. `lib/events/types.ts:14` allows a wider `Province` set of BC, AB, ON,
QC, but that is the event contract, not the Phase 4 scope.

### British Columbia: nothing held

Every BC forest row in `data/phase1-production-source-ledger.json` is
`evidenceState: "access-blocked"`, `productionAdmission: false`,
`productionEligible: false`. Not acquired, not merely un-transformed.

| Ledger row | Blocker, as recorded | Detail file |
| --- | --- | --- |
| `bc-fta-cutblocks` | Needs a coherent publisher export with declared edition, checksum and profile | `data/bc-fta-operational-sources.json`, status `blocked-publisher-export-required` |
| `bc-harvesting-authorities` | Needs a publisher-authorized snapshot and normal source evidence | `data/bc-harvesting-authority-access-block.json`, status `snapshot-access-blocked` |
| `bc-vri` | Needs an authorized raw snapshot, terms, coverage, checksum and profile | `data/bc-vri-access-block.json`, status `blocked` |
| `bc-consolidated-cutblocks` | Access Only terms require a redistributable licence or publisher authorization | `data/bc-consolidated-cutblocks-access.json`, status `blocked-access-only-licence` |
| `bc-old-growth-bec` | Official BEC route requires email, terms acceptance, and an eligible authorized account | `data/bc-bec-snapshot-block.json` |
| `bc-forest-operations-map` | Access Only rights block acquisition through production eligibility | `data/bc-forest-operations-map-access.json`, status `blocked-access-only-licence` |

The one BC row that is not blocked is `bc-wildfire`
(`remote-verified-archived-profiled`), which is fire perimeters, not harvest
records, and is still not admitted.

So: **British Columbia holds zero admitted, zero transformed, and zero acquired
forest-event data.** Every BC harvest source is stopped at rights or access.

### Québec: acquired and profiled, not transformed, not admitted

| Ledger row | State | Blocker, as recorded |
| --- | --- | --- |
| `qc-current-ecoforest` | `remote-verified-archived-profiled` | "Separate owner decisions and evidence for transformation, ingestion, release, and production admission remain required." |
| `qc-original-current-inventory` | `remote-verified-archived-profiled` | Same wording |
| `qc-fourth-inventory` | `remote-verified-archived-profiled` | "Recovery-replica evidence, semantic transformation and join selection, ingestion approval, release approval, and production admission remain separate." |
| `sopfeu` | `access-blocked` | "Written reusable terms are unresolved." |

Supporting evidence exists and is checksum-bound:
`data/qc-original-current-inventory-profile.json`,
`data/qc-fourth-inventory-evidence.json` (status `local-verified-profiled`, whose
own notice says it is "not immutable object storage, a transformation,
ingestion, production admission, or production eligibility"), and the Québec
layer in `data/coverage-geometry-admission.json`.

Two important qualifications on the Québec data:

* The current-ecoforest source is **not an event chronology**. Its own
  specification says so at
  `data/transformation-specs/qc-current-ecoforest-stand-copy-v1.json`,
  `interpretation.temporal`: "It is not an event chronology, a dated harvest
  record, or a substitute for the fixed fourth-inventory product." And
  `interpretation.semantic`: "origine, perturb, an_origine and an_perturb remain
  source-coded attributes; this specification does not map them to Witness Tree
  disturbance classes, event dates, harvest types, or causal claims."
* Coverage geometry for Québec is graded local context only, not enhanced. The
  notice in `data/coverage-geometry-admission.json` says the Québec
  current-ecoforest footprint "remain[s] local context only" and that neither
  baseline nor context is "enhanced-record coverage".

### Alberta and Ontario

Out of Phase 4 scope. Alberta rows (`ab-avi-crown`, `ab-avi-post-harvest`,
`ab-primary-land-vegetation`) are profiled but not admitted; Ontario forest rows
(`on-fri`, `on-fri-term-2`) are access-blocked. Neither can substitute for BC in
the required `["BC", "QC"]` scope.

## 5. The gap, stated as work

Ordered. Each item is tagged **[E]** pure engineering, **[X]** requires a real
data execution against the external drive, **[O]** requires an owner admission,
or **[R]** requires an outside party beyond the owner.

1. **[R] Obtain British Columbia forest-event data at all.** Every BC source is
   stopped at licence or publisher authorization, not at engineering. Because
   `scripts/check-phase4-exit-status.mjs:120-122` requires the scope to be
   exactly `["BC", "QC"]` and `:223-226` requires a BC reviewer, no Québec-only
   run can satisfy this criterion. This is the single largest gap and no amount
   of Québec work reduces it. Blocked externally per
   `docs/EXTERNAL_GATES.md:21`, the source rights and attribution row.
2. **[X] Run the two approved Québec stand-copy executions.**
   `scripts/run-qc-stand-copy.mjs --execute` with each of the two existing
   execution approvals. Produces the GeoPackages and sidecars at the paths bound
   in `outputBinding`. Caveat: `docs/OWNER_BLOCKED_ENGINEERING.md:31` records an
   open "existence means refuse" defect in this runner, and its SHA-256 is bound
   by both execution approvals, so a fix would need **[O]** a fresh execution
   approval. The defect only bites on a resume over an existing artifact.
3. **[X] Run the independent readback.**
   `scripts/verify-qc-stand-copy-readback.mjs --verify --write-evidence` per
   scope, producing the two missing readback evidence files.
4. **[O] Admit the Québec stand-copy rows to production.** Prepare with
   `scripts/prepare-qc-stand-copy-production-admission.mjs --decided-at ... --write`,
   then the owner supplies the explicit ingestion, release, production-admission,
   and deployment decision. This closes preflight blocker 1 in
   `data/phase4-provincial-matching-preflight.json`.
5. **[E] then [O] Write and approve a semantic event transformation.** The
   stand-copy is a byte copy that explicitly refuses semantics. Something has to
   map `origine`, `perturb`, `an_origine`, `an_perturb` to dated Witness Tree
   event records with geometry. This spec does not exist. It also requires
   relaxing the fixture-only contract at `lib/events/normalize.ts:24` and
   `lib/events/types.ts:30`, and giving normalized events geometry they currently
   lack. This closes preflight blocker 2.
6. **[E] then [X] Materialize Phase 2 change geometry.** Preflight blocker 3, and
   the flag `changeGeometryMaterialized` that both the report
   (`scripts/check-phase4-exit-status.mjs:184`) and the admission
   (`:218`) must set true.
   `data/phase2-real-national-execution-evidence.json` lists as its first
   limitation "No patch vectorization or normalized events.", and
   `data/phase2-v21-province-zonal-pilot-evidence.json` records
   `nationalPerCellGeometryMaterialized: false`. The Phase 2 run produced 79
   rasters and no vectors. Patch vectorization does not exist as code; grepping
   for `vectoriz` finds only the strings asserting its absence.
7. **[E] Build the spatial join that produces `OfficialRecordCandidate`.**
   `lib/pipeline/matching.ts:82-85` deliberately leaves `intersectionHectares` to
   the caller. There is no caller. This is the missing pipeline stage between
   items 5, 6 and the matching policy.
8. **[E] Build a Phase 4 matching runner.** A script that consumes the above,
   calls `reportProvincialMatching`, and writes a
   `witness-tree/phase4-provincial-matching-report/1` record. Note that
   `lib/phase4/provincial-matching.ts:23, 72` hard-codes
   `status: "computed-nonproduction"` and `productionEligible: false`, so the
   library as written cannot emit the `"admitted-production"` report the checker
   demands. Either the runner writes the admitted record separately or the
   library gains an admitted path.
9. **[X] Execute that runner, under [O] an execution approval** binding packet,
   spec, runner SHA-256, and input hashes, following the pattern of
   `data/phase1-federal-electoral-execution-approval.json`.
10. **[O] Owner admission of the matching run.** The
    `witness-tree/phase4-provincial-matching-admission/1` record with a human
    `ownerDecision` block per `scripts/check-phase4-exit-status.mjs:126-134`.
11. **[R] Outside provincial review, one reviewer for BC and one for QC.** The
    `witness-tree/phase4-provincial-matching-outside-review/1` record. Named,
    independent, no-conflict, with findings and notes.
    `docs/EXTERNAL_GATES.md:25` records this as not started.
12. **[E] Change the methods page** to publish the numbers, and split the copy so
    two distinct files each carry the wording (see section 6).
13. **[O] Publication and release records.** The
    `.../publication/1` and `.../release/1` records, the latter with a version
    string and the four bound hashes.
14. **[E] Update `data/phase4-exit-status.json`** to list the eight evidence
    files with their SHA-256 values and set the criterion and both checkpoints,
    then re-run `scripts/check-phase4-exit-status.mjs`. It will refuse any status
    the bytes do not support.

### Are the Québec stand-copy executions the missing input?

No, not by themselves. They are items 2 and 3 of fourteen, and they are
necessary but far from sufficient. Three things are strictly larger:

* **BC data does not exist in any form** (item 1) and the criterion cannot pass
  without it. This is the binding constraint.
* **Phase 2 change geometry is not materialized** (item 6). Without a vectorized
  change patch there is no `DetectedChange` to assess, so there is no
  denominator. This is independent of Québec entirely.
* **No semantic event transformation is approved** (item 5). The stand-copy
  output is stand polygons with source-coded attributes, explicitly not events.
  Running it produces an input that still cannot be matched against.

Running the stand-copy today would close exactly one of the four blockers listed
in `data/phase4-provincial-matching-preflight.json`, and only after the separate
owner admission in item 4.

## 6. The methods page

### Where the wording lives

The copy is in one shared bilingual component,
`components/transparency/MethodologyPage.tsx`, rendered by two route files:
`app/en/methods/page.tsx:7` and `app/fr/methodes/page.tsx:7`. Neither route file
contains any copy.

`components/transparency/MethodologyPage.tsx:16-17`, English:

> `provincialMatching: "Provincial matching results"`,
> `provincialMatchingText: "Match rate, non-match rate, and the non-match-reason distribution are not available. No provincial enhancement dataset has been admitted for processing, so publishing numeric rates would be misleading. This page will publish those results only for an admitted, versioned provincial processing run."`

`components/transparency/MethodologyPage.tsx:33-34`, French:

> `provincialMatching: "Résultats de l’appariement provincial"`,
> `provincialMatchingText: "Le taux d’appariement, le taux de non-appariement et la répartition des motifs de non-appariement ne sont pas disponibles. Aucun jeu de données d’amélioration provinciale n’a été admis au traitement; publier des taux numériques serait donc trompeur. Cette page publiera ces résultats seulement pour une exécution provinciale admise et versionnée."`

The section is wired into the page at
`components/transparency/MethodologyPage.tsx:48`. The matching parameters
themselves are already published one section above, at
`components/transparency/MethodologyPage.tsx:15` and `:32`, and they match
`lib/pipeline/matching.ts:3-8`.

### What must change there

Per `scripts/check-phase4-exit-status.mjs:228-231`, for each of the two
`methodsPagePaths`:

1. The strings "not available", "unavailable", and "not admitted" must all be
   gone from that file, case-insensitively. The current English text contains
   "not available" and "not been admitted"; the French text is not caught by the
   English regex but the file is shared, so the current single file fails the
   test on the English string alone.
2. The file must contain a match-rate phrase, a non-match-rate phrase, and a
   reason-distribution phrase. English phrasings satisfy all three; French
   phrasings satisfy the first two and the third only via the exact string
   "répartition des motifs de non-appariement".
3. The published numbers must equal the report's `matchRate` and `nonMatchRate`
   exactly, and the reason distribution must be identical pair for pair
   (`scripts/check-phase4-exit-status.mjs:220`).

There is a structural mismatch worth flagging. The publication record requires
**exactly two** methods-page paths, each individually present as criterion
evidence and each individually passing the text tests
(`scripts/check-phase4-exit-status.mjs:219, 228`). Today there is one shared
component holding both locales and two route files holding none. Listing
`app/en/methods/page.tsx` and `app/fr/methodes/page.tsx` would fail, because
neither contains the required phrases. Listing
`components/transparency/MethodologyPage.tsx` twice would fail the uniqueness
check at `scripts/check-phase4-exit-status.mjs:60-63`. The copy therefore has to
be split into two per-locale files before a publication record can bind it. How
the owner wants that split done is **not determined**; the test fixture at
`tests/phase4-exit-status.test.mjs:66-67` models it as two separate files,
`methods-en.txt` and `methods-fr.txt`.

One more constraint on the wording. The section 4.6 rule at
`docs/CONTROLLING_IMPLEMENTATION_PLAN.md:1783` names "the non-match reason
distribution published on the methods page" as one of the mitigations against
readers interpreting detected change as logging, alongside "a lint rule on the
banned words". The replacement copy must not say unexplained, unreported,
undocumented, or illegal.

## What this report did not establish

* Whether `scripts/run-qc-stand-copy.mjs` actually accepts the two existing
  execution approvals. Determining it means running the runner against the data
  root, which was out of bounds here. `docs/QC_STAND_COPY_RUNNER.md` still says
  no such approval exists, which contradicts the presence of
  `data/phase1-qc-current-ecoforest-execution-approval.json`; one of the two is
  stale and only an execution resolves it.
* Whether any stand-copy output or sidecar already sits on the external drive.
  No repository file records one. Determining it means an `lstat` under the data
  root.
* Whether the mechanical reason keys in `lib/phase4/provincial-matching.ts:64-66`
  satisfy the owner's reading of the plan's causal reason categories at
  `docs/CONTROLLING_IMPLEMENTATION_PLAN.md:398`. Only the owner determines that.
* How long a Québec stand-copy execution takes. The current-ecoforest input is
  9,827,536 features across a 36 GB extracted GeoPackage per
  `data/phase1-qc-current-ecoforest-execution-approval.json`, but no observed
  elapsed time is recorded anywhere.
