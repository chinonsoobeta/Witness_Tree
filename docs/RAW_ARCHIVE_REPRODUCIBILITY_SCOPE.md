# Raw-archive reproducibility scope

Discovery only. Nothing in this document was executed. No AWS call was made, no
evidence record was created or edited, and the external data volume was not
read. Every factual claim below cites a repository file.

## 1. What the two criteria demand, and where the boundary sits

### Phase 1, `raw-file-archive-recovery`

[`data/phase1-exit-status.json`](../data/phase1-exit-status.json) carries this
gate inside `formalExit.gates`, not inside an `exitCriteria` array. Its
requirement is one sentence:

> Every raw file has a checksum and can be re-fetched or restored from the archive.

Its recorded reason is:

> The federal raw payload/manifest, four current-wildfire raw payload/manifest pairs, and the Québec 62-object archive have checksum-bound exact-version evidence, but the requirement is universal: other raw files still lack all required archive-control proofs.

The gate is scored by `formalExit.method` = `unweighted-four-gate-count`, and
`formalExit.ratio` is `2/4`. `complete-production-ledger` and
`raw-file-archive-recovery` fail; `coverage-geometry` and
`corruption-validation-suite` pass.

### Phase 8, `raw-archive-reproducibility`

[`data/phase8-launch-readiness-exit-status.json`](../data/phase8-launch-readiness-exit-status.json)
carries this as `exitCriteria[4]`:

> Reproducibility from the raw archive is demonstrated

with the reason:

> A read-only, version-pinned restoration of three immutable raw snapshots recorded byte length, SHA-256, ZIP integrity, and temporary-copy removal, but no complete admitted output has been reproduced from its raw archived inputs. The drill is restoration evidence only.

The underlying plan language is in
[`docs/CONTROLLING_IMPLEMENTATION_PLAN.md`](CONTROLLING_IMPLEMENTATION_PLAN.md):
line 655, "Every published number is reproducible from the raw archive plus the
recorded method version"; line 1619, "A published figure is reproduced from the
raw archive and matches"; and line 1771, "A random published figure is
recomputed from the raw archive and the recorded method version, and matches."

### The boundary

The two gates test different halves of one chain.

| | Phase 1 `raw-file-archive-recovery` | Phase 8 `raw-archive-reproducibility` |
| --- | --- | --- |
| Direction | Archive to bytes | Archive to a finished result |
| Question | Can the exact raw bytes come back? | Do the recorded method versions, fed those bytes, produce the recorded output again? |
| Scope | Universal across every raw file in the ledger | One complete admitted output is enough |
| Passing artifact | Checksum- and version-bound readback of every raw object | A regenerated output whose SHA-256 equals the admitted output's SHA-256 |

Phase 1 is a breadth gate over inputs. Phase 8 is a depth gate over one chain.
Phase 8 does not require Phase 1 to pass first: it requires only that the
particular inputs of the chosen output are recoverable. Reproducing a single
output cannot close Phase 1, because Phase 1's requirement is explicitly
universal. Conversely, restoring every raw object would still not close Phase 8,
because restoration is not recomputation. That is precisely the sentence the
Phase 8 reason ends on: "The drill is restoration evidence only."

## 2. What the existing restoration drill did

The drill is recorded at
[`data/immutable-restore-drill.json`](../data/immutable-restore-drill.json) and
validated by
[`scripts/check-immutable-restore-drill.mjs`](../scripts/check-immutable-restore-drill.mjs).
It ran from `2026-08-14T16:00:36Z` to `2026-08-14T16:17:37Z`, that is 17 minutes
and 1 second, with `operation` = `read-only-version-pinned-restore`.

The three restored snapshots, all from
`witness-tree-raw-archive-ca-central-1` in `ca-central-1`:

| `sourceId` | Payload object | `versionId` | Bytes |
| --- | --- | --- | --- |
| `qc-historic-wildfire-detailed` | `feux_prov_gpkg.zip` | `DjOdtfn5DPWW77s4.kNOHMfaytNdiEzT` | 414,244,435 |
| `alberta-avi-crown` | `albertavegetationinventorycrown.zip` | `GBUA_D9Q3nC2Cr3vTEAUypOSA.7cqAU1` | 557,041,258 |
| `nrcan-forest-canopy-cover-2022` | `ca_canopy_cover_2022.zip` | `djna4u6GBKFJrhNjLh8VnhDfpaaG.hiI` | 9,954,395,939 |

Total restored: 10,925,681,632 bytes.

For each entry the drill recorded `remoteByteLength`, `downloadedByteLength`
(equal to it), `downloadedSha256`, `zipIntegrity` = `passed`, download start and
completion timestamps, and `temporaryCopyRemoved` = `true`. Tools are pinned in
`drill.tools`: `aws-cli/2.36.21`, `shasum 6.02` with OpenSSL SHA2-256 for the
9.95 GB confirmation, and Info-ZIP `UnZip 6.00`.

**What version pinning means here.** Every entry names an AWS S3 object
`versionId` and the restore used that exact version, not the current version of
the key. `scripts/check-immutable-restore-drill.mjs` enforces this: it asserts
`entry.payloadKey === promotion.payloadKey` and
`entry.versionId === promotion.payloadVersionId` against
[`data/immutable-promotions.json`](../data/immutable-promotions.json), and it
asserts `entry.downloadedSha256 === staged.sha256` against
[`data/staged-acquisitions.json`](../data/staged-acquisitions.json). The
promotion record shows those same payload versions locked under Object Lock
`COMPLIANCE` retention until `2033-08-12T00:00:00Z`, so the pinned version cannot
be replaced or deleted for the retention window.

**Non-mutation.** `drill.nonMutationStatement` reads: "This drill did not upload,
delete, lock, or alter retention on S3." The checker asserts that string matches
`/did not upload, delete, lock, or alter retention/i`, and its own header comment
says it "intentionally has no AWS command or write path."

**Exactly where it stopped short.** The drill's last verified fact per entry is
`zipIntegrity: "passed"` followed by `temporaryCopyRemoved: true`. The ZIP was
never opened past the integrity test, no member was extracted, no transform ran,
and no output SHA-256 was compared to an admitted artifact. It also does not
help that these three particular snapshots feed no admitted output: none of
`qc-historic-wildfire-detailed`, `alberta-avi-crown`, or
`nrcan-forest-canopy-cover-2022` appears as an input to any admitted artifact in
[`data/phase2-admission-record-2026-08-26.json`](../data/phase2-admission-record-2026-08-26.json)
or
[`data/phase1-federal-electoral-production-admission.json`](../data/phase1-federal-electoral-production-admission.json).
So even extending the same drill to extraction would not have reached an
admitted output. A different object has to be restored.

## 3. What "a complete admitted output" means, and the candidates

An admitted output is an artifact bound by an owner admission record whose
`ownerDecision.decision` is `approve` and whose exact bytes are checksum-bound in
that record. Two such records exist.

- [`data/phase2-admission-record-2026-08-26.json`](../data/phase2-admission-record-2026-08-26.json),
  `claims.admitted` = `true`, `claims.released` = `false`. It binds 42
  artifacts: 11 `forest-mask-snapshot` rasters plus 11 sidecars, and 10
  `whole-interval-loss` rasters plus 10 sidecars, totalling 6,778,801,959 bytes.
  It also binds a 13-feature province zonal aggregate under
  `evidenceBindings.zonalAggregate`.
- [`data/phase1-federal-electoral-production-admission.json`](../data/phase1-federal-electoral-production-admission.json),
  `status` = `owner-approved-admitted-and-release-approved`, with the owner
  statement "I explicitly authorize ingestion, release, production admission,
  and deployment." It binds one artifact, a 20,525,056-byte GeoPackage with
  SHA-256 `ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05`.

### Candidate A: the federal electoral districts 2023 GeoPackage

Raw input: one object,
`federalelectoraldistricts_2025_shp.zip`, 10,301,648 bytes, SHA-256
`4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93`, plus its
572-byte `manifest.json`. Both are recorded at exact versions
(`GzBU7MRKmIE6hXbx3weS4eX.1rMUiYUK` and `0Zon9n8dRbw.JmQ_E2pKhQe14J785duH`) under
`COMPLIANCE` retention to `2033-08-12T00:00:00Z` in
[`data/federal-electoral-archive-recovery-evidence.json`](../data/federal-electoral-archive-recovery-evidence.json),
whose `claims.rawArchiveRefetch` is `true` and whose
`payload.exactVersionDownload` records `byteLengthMatches` and `sha256Matches`
both `true`.

Fully archived: **yes**, and it is the whole input set. The transformation
summary in the admission record confirms there is no second input: "Selected
REPORDER 2023, retained FED_NUM, ED_NAMEE, ED_NAMEF and REPORDER, appended
checksum-bound lineage fields, and retained every source polygon without
dissolve, simplify, repair, clipping or reprojection."

Data movement: 10,302,220 bytes down, 20,525,056 bytes written locally.

Wall clock: the download is a few seconds. The drill's aggregate observed
throughput was 10,925,681,632 bytes in 987 seconds, about 11 MB/s, and its
slowest single stream was 414,244,435 bytes in 149 seconds, about 2.8 MB/s. At
the slower of the two, 10,301,648 bytes takes under 4 seconds. The transform's
elapsed time is **not determined**; no elapsed field appears in
[`data/phase1-federal-electoral-output-verification-evidence.json`](../data/phase1-federal-electoral-output-verification-evidence.json).
It would be determined by timing
`node scripts/run-phase1-federal-electoral-transformation.mjs --preflight` against
a temporary data root. The work is 352 polygons through `ogr2ogr` plus a
`ogrinfo` feature readback, so minutes rather than hours is the expectation, but
that is an expectation and not a recorded finding.

### Candidate B: one `forest-mask-snapshot` raster from the Phase 2 batch

The cheapest member is `forest-mask-snapshot-1984.tif`, 482,708,957 bytes,
SHA-256 `f14fe5188f12b7fb200fa3c3e1f22432645ee2cdcaa1bdd5d7c47d7fd63237f9`, with
`inputCount: 1` and `telemetry.elapsedSeconds: 76.14861095800006` in
[`data/phase2-v21-raster-readback-evidence.json`](../data/phase2-v21-raster-readback-evidence.json).

Its input chain is two stages, not one.
[`scripts/run-phase2-v21-raster-first.mjs`](../scripts/run-phase2-v21-raster-first.mjs)
consumes `masks/forest-mask-1984.tif` from the earlier batch
`phase2-real-national-1984-2022-v1`, not a raw archive object.
[`scripts/run-phase2-real-national-rasters.mjs`](../scripts/run-phase2-real-national-rasters.mjs)
produces that mask by unzipping member `CA_forest_VLCE2_1984.tif` from
`CA_forest_VLCE2_1984.zip` and running `phase2_raster_window.py mask`. For 1984
only, the first loop iteration takes the `mask` branch with a single raster; for
every later year the loop takes the `pair` branch and consumes the previous year
as well, so 1984 is the only single-input snapshot.

Raw input: one object, `ca_forest_vlce2_1984.zip`, 1,520,973,970 bytes, version
`qV_FqbG9DGbKtvkcgQVUTVKiYu5CUAlZ`, plus a 1,716-byte sidecar, per
[`data/vlce2-remote-promotion-evidence.json`](../data/vlce2-remote-promotion-evidence.json).

Fully archived: **yes**. All 39 annual VLCE2 payloads are archived under
`raw/nrcan-annual-land-cover-v2/version-2/` with `COMPLIANCE` retention to
`2033-08-12T00:00:00Z`, confirmed live in
[`data/phase1-archive-live-readback-2026-08-20.json`](../data/phase1-archive-live-readback-2026-08-20.json)
(`payloadObjectCount: 39`, `manifestObjectCount: 39`, `deleteMarkerCount: 0`).
The owner admitted all 39 as source inputs in
[`data/phase2-source-input-admission-vlce2-1984-2022.json`](../data/phase2-source-input-admission-vlce2-1984-2022.json).

Data movement: 1,520,975,686 bytes down, plus roughly 24.9 GB of intermediate
and output storage. The output grid in
[`data/raster-grid.json`](../data/raster-grid.json) is 193,936 by 128,340 Byte
cells, `cellCount: 24889746240`, so an uncompressed full-grid pass is that size.
The extracted `.tif`'s on-disk size is **not determined** in the repository; it
would be determined by `unzip -l` on the restored archive or by reading the
archived `manifest.json` sidecar.

Wall clock: 76.1 seconds for the recorded V2.1 snapshot stage. The upstream V1
mask stage is **not determined** per year; the whole V1 batch of 79 rasters took
`observedRasterTransformElapsedSeconds: 10355` per
[`data/phase2-real-national-execution-evidence.json`](../data/phase2-real-national-execution-evidence.json),
about 131 seconds per output on average.

Runner obstacle. Neither existing runner can be pointed at one year.
`preflightV21RasterFirst` asserts the presence of all 11 snapshot masks and all
38 annual loss rasters from the V1 batch, and
`sourceBackedPhase2RealNationalPreflight` in
[`scripts/preflight-phase2-real-national-run.mjs`](../scripts/preflight-phase2-real-national-run.mjs)
verifies all 39 VLCE2 archives plus the harvest and wildfire archives byte for
byte before it will report `ready-for-bounded-nonproduction-execution`. A
single-year reproduction therefore needs new code, not just a flag.

### Candidate C: one `whole-interval-loss` raster

The cheapest is `whole-interval-loss-2020-2022.tif`, 119,265,158 bytes,
`inputCount: 2`, `telemetry.elapsedSeconds: 104.50178899999992`. Its two inputs
are the V1 annual loss rasters for 2020-2021 and 2021-2022, each produced by the
`pair` branch from adjacent years, so the raw inputs are the 2020, 2021 and 2022
VLCE2 archives: 4,607,364,168 bytes. Fully archived: yes. It carries the same
runner obstacle as Candidate B, plus a longer chain.

### Candidate D: the 13-feature province zonal aggregate

[`data/phase2-v21-province-zonal-pilot-evidence.json`](../data/phase2-v21-province-zonal-pilot-evidence.json)
records a 3,131-byte output `province-2020-2022.json` with SHA-256
`ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d`. Its
`inputBindings` name three things: the V2.1 snapshot mask for 2020, the V2.1
interval raster for 2020-2022, and a boundary artifact with SHA-256
`d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b`.

**Flag: this candidate's inputs are only partly archived.** The boundary is the
StatCan 2021 Census Province/Territory Cartographic Boundary File,
`lpr_000b21a_e.zip`, 133,730,024 bytes, recorded in
[`data/boundary-editions.json`](../data/boundary-editions.json) with a
`fileUrl`, a `retrievedAt` of `2026-08-12T16:26:00Z` and a SHA-256, but with no
bucket, no payload key and no `versionId` anywhere in `data/`. It does not appear
in `staged-acquisitions.json`'s entry list. So the boundary input has a local
checksum but no immutable archive binding, and the aggregate cannot be
reproduced from the raw archive today. Its raster inputs also require the full
Candidate B and Candidate C chains for years 2019 through 2022. This is the
smallest output in the project and the least reproducible one, which is worth
stating plainly so nobody reaches for it because of its size.

Note also that the pilot record's own `claims.admitted` is `false`, while
`data/phase2-admission-record-2026-08-26.json` binds the same aggregate and sets
`claims.admitted` to `true` at the record level. The two are consistent only if
the record-level admission is read as superseding the pilot's self-description.
Which reading the owner intends is **not determined**; it would be determined by
an owner statement or by a reconciliation entry in
[`docs/RECORD_CONTRADICTION_LEDGER.md`](RECORD_CONTRADICTION_LEDGER.md).

## 4. The cheapest honest candidate

**Candidate A, the federal electoral districts 2023 GeoPackage.** It moves
10,302,220 bytes out of the archive and writes 20,525,056 bytes.

It is sufficient rather than a token gesture, for five reasons, each with a
citation.

1. **It is a complete output, not a slice.** All 352 source polygons and all 343
   distinct districts are carried through. The transformation summary in
   `data/phase1-federal-electoral-production-admission.json` says every source
   polygon is retained "without dissolve, simplify, repair, clipping or
   reprojection." There is no subsetting to hide behind.

2. **It is the most strongly admitted output in the project.** Its admission
   record is the only one whose owner statement authorizes ingestion, release,
   production admission and deployment. The Phase 2 artifacts are admitted with
   `released: false` and `productionEligible: false`. If any single output
   deserves the reproducibility proof, it is this one.

3. **Its entire input set is one archived object at a pinned version.** No
   partly-archived second input exists, which is exactly the flaw that
   disqualifies Candidate D.

4. **The transform is already proven byte-deterministic**, so a mismatch would
   be a real signal rather than noise.
   `data/phase1-federal-electoral-output-verification-evidence.json` records
   `deterministicRegeneration` with `exactByteMatch: true`,
   `fixedGpkgTimestamp: "2000-01-01T00:00:00.000Z"`, and the same SHA-256 as the
   admitted artifact. That regeneration was driven from the local raw copy under
   the data root, not from a restored archived object. Swapping the input for a
   version-pinned restore is precisely the missing link, and nothing else about
   the comparison has to be invented.

5. **The output identity is bound into the record ids.** `expectedOutputRecordId`
   in
   [`scripts/run-phase1-federal-electoral-transformation.mjs`](../scripts/run-phase1-federal-electoral-transformation.mjs)
   hashes `INPUT_SHA256` into every per-feature `output_record_id`. A different
   input archive would change 352 record ids and therefore the output SHA-256.
   The byte comparison is not a weak test.

The one honest caveat: Candidate A is a Phase 1 vector transformation, while the
Phase 8 criterion sits next to Phase 2 raster work. If the owner reads
"reproducibility from the raw archive" as needing to exercise the raster
pipeline specifically, Candidate B is the smallest raster answer at 1.52 GB
down, with the added cost of writing a single-year runner. That is an owner
scope question, not an engineering one. The criterion's own words say "a
complete admitted output", singular and unqualified, and Candidate A is one.

## 5. The runbook

Steps marked **AWS** are security-sensitive. They authenticate with a direct
MFA-assumed role and read from the production archive bucket. They must be run
by the main agent, never by a discovery agent.

### Preconditions, all already satisfied in the repository

- Execution authorization exists at
  `data/phase1-federal-electoral-execution-approval.json`, bound as evidence in
  the admission record. `validateExecutionApproval` in the runner requires it and
  requires `authorization.overwriteExisting: false`.
- The archive evidence the runner binds,
  `data/federal-electoral-archive-recovery-evidence.json`, is pinned by SHA-256
  `18b9fbfa5e3eecdc33ad0098f5ffa55f7bfebb1a47d2e33b7f01a94e05a6ed32` inside the
  runner constants.
- `ogrinfo` and `ogr2ogr` must be on `PATH`. The runner calls both directly.

### Ordered steps

1. Create a fresh, empty temporary data root and the one input directory the
   runner expects. This deliberately avoids the external volume entirely.

   ```
   WT_REPRO_ROOT="$(mktemp -d)/Witness_Tree-data"
   mkdir -p "$WT_REPRO_ROOT/raw/elections-canada-federal-electoral-districts/2026-08-14"
   ```

   Note the path. `INPUT_RELATIVE_PATH` in the runner is
   `raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip`,
   with that exact capitalization, while the S3 key ends in the lowercased
   `federalelectoraldistricts_2025_shp.zip`. The restored file has to be written
   under the runner's spelling.

2. **AWS.** Obtain one direct MFA role session by sourcing
   [`scripts/aws-direct-mfa-role-session.sh`](../scripts/aws-direct-mfa-role-session.sh)
   from an owner-local runner. It verifies the caller is
   `arn:aws:iam::<account>:user/WitnessTreeArchiveOperator`, reads a six-digit
   TOTP without storing it, and assumes the role for 43,200 seconds.
   [`scripts/check-archive-direct-mfa-runners.mjs`](../scripts/check-archive-direct-mfa-runners.mjs)
   enforces that shape on every archive shell runner, so a new runner must follow
   it. The TOTP must never be echoed or recorded.

   **Which role.** The restore runner defaults to the least-privilege read-only
   `WitnessTreeArchiveVerifier`, and that default currently fails: the six-probe
   diagnosis of 2026-08-26 found it returns 403 on this prefix even on an
   unpinned head. Until the owner grants that role `s3:GetObject` here, the
   reproduction has to run under a role that can read the prefix, which today
   means one that also holds write permission:

   ```
   WT_REPRO_ROLE=WitnessTreeArchivePromotionUploader \
     ./scripts/restore-federal-electoral-archive-reproduction-inputs.sh --restore
   ```

   Record the consequence rather than glossing it. Under a write-capable role
   the runner still makes no mutating call, but the non-mutation guarantee for
   that run rests on the runner's source rather than on the credential being
   incapable of writing. The drill of 2026-08-26 carries exactly this caveat in
   its `assumedRoleNote`, and any new drill record must carry it too for as long
   as the read-only role is refused.

3. **AWS.** Head the exact version, read-only, and confirm it before downloading.

   ```
   aws s3api head-object \
     --bucket witness-tree-raw-archive-ca-central-1 \
     --region ca-central-1 \
     --key 'raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip' \
     --version-id 'GzBU7MRKmIE6hXbx3weS4eX.1rMUiYUK' \
     --checksum-mode ENABLED --output json
   ```

   Expect `ContentLength` 10301648, `ChecksumType` `FULL_OBJECT`, and
   `ChecksumCRC64NVME` `Tjb8SOmhdSU=`. The helpers
   `wt_archive_head_current_or_absent` and `wt_archive_verify_existing_payload`
   in
   [`scripts/archive-existing-key-recovery.sh`](../scripts/archive-existing-key-recovery.sh)
   are the existing shape for this and should be reused rather than re-written.

4. **AWS.** Download that exact version to the temporary root under the runner's
   filename, using `s3api get-object --version-id`, never `s3 cp` on the key.
   Then verify locally that the SHA-256 equals
   `4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93` and the
   byte length equals 10301648. Also fetch the 572-byte `manifest.json` at
   version `0Zon9n8dRbw.JmQ_E2pKhQe14J785duH` and confirm its SHA-256 is
   `84646377203dccaee1e770899d77b2261f77eb7367462c0bf6be90e0317c00ea`, matching
   `data/federal-electoral-archive-recovery-evidence.json`.

5. Local only. Preflight against the temporary root.

   ```
   node scripts/run-phase1-federal-electoral-transformation.mjs --preflight --data-root "$WT_REPRO_ROOT"
   ```

   `completionOutcome` should return `produce`, since the temporary root holds no
   output or sidecar. `validateSourceGeometryAndFeatures` will re-read all 352
   polygons from `/vsizip/.../SHP/FED_CA_2025_EN.shp` and check the feature count,
   the 343 distinct `FED_NUM`, `REPORDER = '2023'` on every feature, and the NAD83
   Lambert CRS.

   Risk to watch: `ensureNoSymlink` walks every ancestor of the resolved path and
   refuses any symlink component. On macOS `/tmp` is a symlink to `/private/tmp`,
   which `resolveDataRoot`'s `realpathSync` should absorb, but if it refuses,
   place the temporary root somewhere with no symlink in its ancestry.

6. Local only. Execute.

   ```
   node scripts/run-phase1-federal-electoral-transformation.mjs --execute --data-root "$WT_REPRO_ROOT"
   ```

7. Local only. Compare and verify independently.

   ```
   shasum -a 256 "$WT_REPRO_ROOT/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg"
   node scripts/check-phase1-federal-electoral-output.mjs --data-root "$WT_REPRO_ROOT"
   ```

   The pass condition is a byte length of 20525056 and a SHA-256 of
   `ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05`, identical
   to the admitted artifact in
   `data/phase1-federal-electoral-production-admission.json`.

   Correction, found when this step was first executed on 2026-08-26. The byte
   comparison above is the pass condition and it held. The
   `check-phase1-federal-electoral-output.mjs` invocation does **not** belong in
   this step: it compares the whole recorded evidence record against a live
   recomputation, and that record includes `output.sidecarSha256`, which embeds
   `toolVersions.node`. A reproduction on any other toolchain therefore fails it
   with "recorded federal output evidence drifted from live verification" even
   when the artifact reproduces exactly. On the first real run the canonical
   sidecar recorded `v26.5.0` and the reproduction ran on `v22.23.0`; GDAL was
   identical and the only differing byte was that version string. That checker
   remains correct against the canonical data root, where the sidecar is the
   original one. It is simply not a reproduction test.

   The incidental finding is worth keeping: the transform produced identical
   bytes across two major Node versions, so its determinism does not rest on a
   pinned interpreter.

8. Local only. Remove the temporary root and record its removal, mirroring the
   drill's `temporaryCopyRemoved` field.

### The evidence artifact

Follow the pattern of the existing drill: one JSON record plus one checker, both
listed as `evidence` on the Phase 8 criterion, since
[`scripts/check-phase8-launch-readiness-exit-status.mjs`](../scripts/check-phase8-launch-readiness-exit-status.mjs)
only requires that each evidence entry be an in-repository path whose SHA-256
matches, and imposes no schema of its own.

Proposed: `data/raw-archive-reproduction-drill.json`, schema
`witness-tree/raw-archive-reproduction-drill/1`, with an explicit
`nonMutationStatement`, the pinned tool versions, the restored payload and
manifest keys with their `versionId`s and verified byte lengths and SHA-256s, the
method version `phase1-federal-electoral-districts-2023-v1`, the runner SHA-256,
the reproduced output byte length and SHA-256, an `exactByteMatch` boolean
against the admitted artifact, and `temporaryCopyRemoved`. Alongside it,
`scripts/check-raw-archive-reproduction-drill.mjs`, with no AWS call and no write
path, cross-checking the record against
`data/federal-electoral-archive-recovery-evidence.json` and
`data/phase1-federal-electoral-production-admission.json` the way
`check-immutable-restore-drill.mjs` cross-checks against
`immutable-promotions.json` and `staged-acquisitions.json`. Then a
`check:raw-archive-reproduction-drill` entry in `package.json` beside
`check:immutable-restore-drill` at line 140.

### Security-sensitive summary

Steps 2, 3 and 4 touch AWS. They require the MFA-assumed operator role and read
the production archive bucket. Steps 1 and 5 through 8 are local and touch no
credential. Every AWS call in the runbook is read-only: `head-object` and
`get-object` with an explicit `--version-id`. No `put-object`, no
`put-object-retention`, no `delete-object`, and no legal-hold change is required
or permitted by this reproduction.

## 6. Can Phase 1 `raw-file-archive-recovery` be closed by engineering?

**No.** It needs external acquisition the project does not hold, or an owner
admission that narrows the gate's universe. Engineering cannot close it.

[`data/phase1-production-source-ledger.json`](../data/phase1-production-source-ledger.json)
holds 31 rows and a `rawEvidenceNumerator` of 16.5. Sixteen rows carry
`proof.rawArchiveRefetch: true` with `rawCredit: 1`. Fifteen rows do not, and
every one of the fifteen is blocked by something outside the codebase.

- **Rights and licence, needing an accountable owner's signature or a rights
  holder's permission (8 rows).** `cwfis-historical` is blocked because NBAC's
  end-user agreement "limits use to the licensee's own internal use and bars
  distribution or transfer without Canada's prior written consent; the
  accountable owner has not accepted it." `bc-consolidated-cutblocks`,
  `bc-forest-operations-map`, `bc-vri` and `bc-old-growth-bec` are blocked by
  BC's Access Only terms, documented in
  [`docs/BC_VRI_ACCESS.md`](BC_VRI_ACCESS.md) and
  [`docs/BC_TAP_PRIORITY_DEFERRAL.md`](BC_TAP_PRIORITY_DEFERRAL.md), with an
  outstanding written request drafted at
  [`docs/BC_FOREST_OPERATIONS_MAP_PERMISSION_REQUEST.md`](BC_FOREST_OPERATIONS_MAP_PERMISSION_REQUEST.md).
  `sopfeu` has unresolved written reusable terms.
  `provincial-electoral-boundaries` still needs Alberta's written permission and
  Québec's written authorization. `on-fri-term-2` has unresolved request-based
  rights.
- **No stable artifact exists to fetch (3 rows).** `bc-fta-cutblocks` and
  `bc-harvesting-authorities` expose only mutable services with a 1,000-feature
  response cap and no publisher edition marker, per
  [`docs/BC_HARVESTING_AUTHORITY_ACCESS.md`](BC_HARVESTING_AUTHORITY_ACCESS.md).
  `on-fri` exposes "only mutable WEB explorer resources; no stable complete
  payload/deterministic API."
- **The publisher disclaims the artifact's fitness, so an owner decision is
  needed on whether the row belongs in the gate at all (4 rows).**
  `historic-treaties` and `modern-treaties` are blocked because the official
  federal datasets describe themselves as informational, approximate, subject to
  revision and expressly not to be relied on for consultation. `indian-reserves`
  and `first-nation-reserves` have no versioned released polygon artifact and no
  verified engagement or right-of-reply route.

None of these is a missing script, a missing IAM policy, or a missing bucket
control. Archiving a file the project is not permitted to hold, or that no
publisher issues as a stable versioned artifact, is not an engineering task.

Three routes exist, and only the owner can pick one.

1. **Acquisition.** Accept the NBAC agreement, obtain BC's written permissions,
   complete Ontario's and Québec's request routes, and obtain Alberta's written
   permission. Then the normal promotion and readback machinery already in
   `scripts/` closes those rows without new design.
2. **Owner admission narrowing the gate.** Record a decision that the four
   publisher-disclaimed Indigenous and treaty layers, and any Access Only layer,
   are out of the Phase 1 gate's universe, with the reason. The gate's
   `requirement` text would then need amending, because as written it is
   universal and cannot be satisfied by exclusion alone.
3. **Leave the gate failing** and carry the fifteen rows as named external
   blockers, which is what
   [`docs/OWNER_BLOCKED_ENGINEERING.md`](OWNER_BLOCKED_ENGINEERING.md) and
   [`docs/EXTERNAL_GATES.md`](EXTERNAL_GATES.md) already do.

By contrast, Phase 8's `raw-archive-reproducibility` appears in none of the six
`externalBlockers` entries in
`data/phase8-launch-readiness-exit-status.json`. It is closable today without any
external party, by the runbook in section 5.

That is not the same as closable without the owner. Steps 2, 3 and 4 of that
runbook need a direct MFA-assumed role session against the production archive
bucket, using the owner's own MFA device. The reads are non-mutating and no
external body has to agree to anything, but somebody has to be at the terminal
with the device in hand.
