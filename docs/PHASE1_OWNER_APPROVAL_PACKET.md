# Phase 1 owner-approval packet

The copy/paste blocks below are historical input templates. Their federal, Québec current/original, Québec fourth, and current-wildfire archive decisions were later recorded in `data/phase1-phase3-owner-approvals-2026-08-21.json`. Québec current/original execution and immutable evidence are now complete; the other recorded approvals do not by themselves prove execution or readback completion.

[`data/phase1-owner-approval-packet.json`](../data/phase1-owner-approval-packet.json) is a machine-checked, copy/paste owner-input packet for the 16 unique `local-verified-profiled` or `remote-verified-archived-profiled` rows in [`data/phase1-owner-decision-queue.json`](../data/phase1-owner-decision-queue.json). Its copy/paste templates are historical inputs; the current execution order is reconciled through the captured Québec immutable evidence integrated at `7708f33`. Five rows have supplied non-admitting scope decisions: source-ledger-only acceptance for two national rows and two Québec current/original rows, plus the exact Alberta PLVI raw/derived scope. Unresolved decisions remain `template-not-approved`.

The packet separates every dependency step into three independent decisions:

1. reversible source or scope decision;
2. irreversible archive and COMPLIANCE-retention approval; and
3. release and production-admission decision.

An owner may copy a block below as an input template, but no placeholder is an approval. The packet carries no owner identity, contact, MFA code, version secret, permission grant, or downstream/production approval. It does not send email, submit a form, call AWS, write remote storage, admit transformation, ingest, release, or make a row production eligible.

Current baseline is **14.75/31 raw evidence credits**, **39.2741935% formal evidence tracking**, **9 immutable rows**, and **0/31 production-admitted or production-eligible**. Partial and access-blocked rows remain explicit exclusions: `cwfis-historical`, `provincial-electoral-boundaries`, and the 13 access-blocked rows in the machine record. They are not silently moved into this owner packet.

## Current owner execution and readback order

This order prioritizes the fewest unresolved dependencies, then the bounded percentage gain already recorded in the remaining-actions audit. It is not a probability forecast: external response rates are unknown, so no expected gain is invented. Completed Québec current/original archive work is excluded from this pending-action order.

| Rank | Exact owner decision or action | Dependency | Maximum bounded Phase 1 gain |
| ---: | --- | --- | ---: |
| 1 | Execute only the recorded federal-only command with fresh MFA after the exact live IAM gate, then integrate the primary exact-version readbacks. Do not run a recovery copy or revisit harvest/canopy-height. | The federal archive approval is recorded; one prepared physical artifact is shared by two rows. Recovery is not authorized, so primary-only evidence remains non-credit until a separate recovery authorization/proof exists. | `+0.50` raw, `+0.483871` formal points, `+2/31` immutable coverage only after every applicable recovery/evidence gate passes |
| 2 | Supply controlled paths and fresh MFA for the recorded Québec fourth-inventory execute template, then integrate exact readbacks. | All four approvals are recorded; 61 prepared files plus one deterministic manifest remain unexecuted. | `+0.25` raw, `+0.2419355` formal points, `+1/31` immutable coverage |
| 3 | Perform the approved owner-local wildfire proof/readback workflow and preserve concrete version, checksum, retention and recovery proof for all six exact objects. | The approval is recorded, but the gate remains `0/6` machine-verifiable and `6/6` attested-only. | `+1.00` raw, `+0.9677419` formal points, `+4/31` immutable coverage |
| 4 | Complete the recorded channel-specific NBAC, Alberta and Québec request prerequisites, then retain complete publisher replies and exact artifacts. | External agreement, consent, signature/declaration, permission and artifact delivery remain pending; this packet sends nothing. | Each partial row: at most `+0.75` raw and `+0.7258065` formal points |
| 5 | Continue only the recorded, deduplicated publisher/rightsholder engagements for the 13 access-blocked rows, then require lawful exact artifacts, rights, checksum, profile and archive proof. | External responses and lawful artifacts remain pending; no local substitute or inferred permission. | Combined ceiling: `+13.00` raw and `+12.5806452` formal points |
| 6 | After each row's prerequisites pass, separately decide its named transformation, ingestion, release and production admission. This includes harvest, canopy-height, and Québec current/original despite their recorded source decisions and immutable evidence. | Complete immutable/evidence chain and row-specific downstream output proof. | Immediate current gain `0`; each later admitted row would change admission coverage by `1/31` (`3.2258065` percentage points) |

The normal archive-control exercise approval is also recorded. Its owner-local legal-hold, retention, delete-denial and recovery exercise must still be run and evidenced. It is a global exit dependency, not row credit or production admission.

Exact artifact names, local paths, byte lengths, SHA-256 values, payload and manifest keys, bucket and region, retention dates, proposed role scopes, transformation policies, quarantines, and exclusion decisions are bound in the packet's `exactBindings` and checked against their authoritative records. Shared physical artifacts are listed once and mapped to every applicable row.

The checked-in federal runner is now local-only. It acquires one exclusive owner-only lock file, verifies the exact source through one `O_NOFOLLOW` descriptor, validates the canonical inputs, and refuses `--run` while canonical archive readiness remains blocked. Release writes a durable released state only to the opened lock inode and leaves the single bounded marker for explicit owner cleanup; the runner never renames, replaces, or deletes a lock path. A future separately reviewed execution implementation would require the committed owner-readiness package to bind every exact evidence file by recomputed SHA-256 and twelve unmodified raw IAM responses: caller identity; role, role inline policy, complete role inline/attached lists; user inline policy, complete user inline/attached lists; two Access Analyzer results; and two simulation results. Per-file and bundle digests bind those raw files, while the manifest's policy/simulation summary is explicitly derived. Self-asserted readiness or live-IAM summaries are not accepted. No MFA, provider action, primary evidence, recovery evidence, source-ledger credit, transformation, ingestion, release, or production admission is implemented or claimed here.

Run the checker with:

```text
npm run check:phase1-owner-approval-packet
```

## Dependency-order copy/paste blocks

### 1. Federal electoral archive

```text
PHASE1 OWNER INPUT — FEDERAL ELECTORAL ARCHIVE
status=template-not-approved
rows=fed-2023-ridings,elections-canada-45th-files
source_scope_decision=<OWNER: accept|reject|defer>
archive_approval=<OWNER: pending; exact artifact, bucket, region, retention, and read-back procedure must be reviewed>
release_and_production_admission=<OWNER: not requested at this stage>
DO_NOT_RUN=zsh scripts/run-phase1-approved-promotion.sh --run-federal
```

Exact artifact: `FederalElectoralDistricts_2025_SHP.zip`, `10301648` bytes, SHA-256 `4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93`; exact payload and manifest keys are machine-bound under `exactBindings.federal-electoral-archive`.

The recovery operation is deliberately unapproved. Before any recovery bucket call can be considered, the owner must provide this complete separate authorization and exact proof packet; a partial block is not authorization:

```text
PHASE1 OWNER AUTHORIZATION — FEDERAL RECOVERY COPY (NOT CURRENTLY APPROVED)
status=<OWNER: approve|reject|defer>
source_primary_bucket=witness-tree-raw-archive-ca-central-1
source_primary_payload_key=<exact key from the federal preparation record>
source_primary_version_id=<exact provider version>
source_primary_checksum={algorithm,type,value}
source_primary_byte_length=<exact integer>
recovery_bucket=<exact named Canadian bucket>
recovery_region=<exact Canadian region>
recovery_payload_key=<exact deterministic key>
recovery_manifest_key=<exact deterministic key>
recovery_role_arn=<exact least-privilege role ARN>
recovery_role_policy_sha256=<64 lowercase hex digest>
recovery_trust_policy_sha256=<64 lowercase hex digest>
recovery_live_iam_attestation=<owner/admin readback with zero findings and exact allow/deny simulations>
recovery_version_id=<exact provider version>
recovery_checksum={algorithm,type,value}
recovery_byte_length=<exact integer>
recovery_retention={mode:COMPLIANCE,retainUntil:<exact UTC instant>}
recovery_retention_readback=<raw-response digest and exact readback>
recovery_copy_readback=<raw-response digest, exact version, checksum, bytes, and no delete marker>
recovery_exercise=<owner-approved restore/readback result preserving primary retention>
source_ledger_credit=<separate decision; never implied by primary-only proof>
DO_NOT_RUN=<exact recovery command only after every field is completed and machine-checked>
```

Until this block is completed and independently checked, `recoveryBoundary.replicaAuthorized`, `recoveryBoundary.replicaCreated`, and `recoveryBoundary.recoveryCreditEligible` remain `false`.

### 2. Québec fourth-inventory archive

```text
PHASE1 OWNER INPUT — QUÉBEC FOURTH INVENTORY
status=template-not-approved
rows=qc-fourth-inventory
source_scope_decision=<OWNER: accept|reject|defer>
archive_approvals=<OWNER: exact-artifact-set|IAM|MFA-session|irreversible-COMPLIANCE-retention>
archive_set=count 56; digest 394f05f984b164b7524e77b00fc73246a791d6c4112f7cc080c43fb3d8a2c0e0
retention_until=2033-08-12T00:00:00Z
transformation_and_join_scope=<OWNER: pending after archive>
DO_NOT_RUN=the --execute template in exactBindings.quebec-fourth-inventory-archive
```

The 56 publisher-defined sheet payload names, hashes, and object keys remain bound by the authoritative `archiveSet.payloads` manifest reference. The map-only component `CARTE_ECO_ORI_4_PROV_gpkg.zip` remains excluded as the exact recorded redundant component; it is not substituted for the 56-sheet product.

### 3. Archived national source ledger

```text
PHASE1 OWNER INPUT — ARCHIVED NATIONAL SOURCE LEDGER
status=recorded-nonadmitting
rows=ntems-forest-harvest,ntems-canopy-height
source_ledger_decision=OWNER: accepted existing named source-ledger evidence for each row only
archive_readback=<existing evidence only; no new archive approval is inferred>
transformation_and_ingestion=<OWNER: separate decision required>
release_and_production_admission=<OWNER: separate decision required>
```

The packet binds the exact harvest and canopy-height paths, bytes, SHA-256 values, payload keys, manifest keys, and `COMPLIANCE` retain-until `2033-08-12T00:00:00Z`. The supplied source-ledger decisions are limited to those existing records; they do not authorize downstream work.

### 4. Alberta PLVI scope

```text
PHASE1 OWNER INPUT — ALBERTA PLVI SCOPE
status=recorded-nonadmitting
row=ab-primary-land-vegetation
raw_scope=OWNER: admit unchanged raw ZIP
derived_scope=OWNER: admit exact 179087-feature closed-join artifact
repair_policy=alberta-plvi-geometry-repair-v1; 12 bounded repairs; preserve duplicate POLYGON_ID 41405; no loss or deduplication
scope_bound_preparation=OWNER: allowed for validation and ingestion preparation only
transformation_ingestion_release_production=<OWNER: separate decisions required>
```

The raw ZIP, 12-feature repair patch, 179087-feature derived output, exact keys, checksums, CRS, `ST_MakeValid` rule, tolerance, duplicate-preservation rule, retention date, and explicit scope exclusions are machine-bound. The supplied PLVI decision admits only this exact raw/derived scope for validation and ingestion preparation; transformation admission and ingestion remain separate.

### 5. Current wildfire archive gate

```text
PHASE1 OWNER INPUT — CURRENT WILDFIRE ARCHIVE GATE
status=template-not-approved
rows=cwfis-current,bc-wildfire,ab-wildfire,on-fire-disturbance
source_scope=<existing conditional record; no new approval inferred>
archive_approval=<OWNER: exact four payloads, four sidecars, bucket, region, MFA path, payload-only retention>
preflight=zsh scripts/run-wildfire-derived-readback.sh --preflight <mode-600-owner-approval-file>
gate=0/6 machine-verifiable, 6/6 placeholder-attested; concrete version/checksum bindings and downstream admission remain blocked
release_and_production_admission=<OWNER: blocked until recovery/provenance and separate downstream decisions>
```

The packet binds all eight exact object keys, all four raw SHA-256 values and bytes, BC's 216-feature derived release with permanently quarantined `V10755`, Ontario's 188-feature closed join with zero exclusions, exact transformation strings, `ca-central-1`, recovery bucket, and payload-only `COMPLIANCE` retention through `2033-08-12T00:00:00Z`.

### 6. Archived remote downstream

```text
PHASE1 OWNER INPUT — ARCHIVED REMOTE DOWNSTREAM
status=template-not-approved
rows=ntems-annual-land-cover,ntems-canopy-cover,ab-avi-crown,ab-avi-post-harvest
source_scope=<OWNER: confirm named row scope only>
transformation_scope=<OWNER: exact named policy/specification required>
ingestion=<OWNER: separate validation and decision required>
release_and_production_admission=<OWNER: separate decisions required; remain false>
avi_exclusion=AVI_PostInventoryHarvestIndex FID 1 only; zero AVI_Crown observation and denominator impact; no derived geometry written
```

The annual-cover block remains bound to 39 payloads/39 sidecars and the exact no-resampling, vector-to-raster-grid prerequisites. Canopy-cover binds the exact 2022 ZIP, bytes, SHA-256, multipart archive key, manifest key, and retention. AVI binds the shared raw archive once, its exact repair policy, the one quarantined index FID, quarantine hash, and no-derived-dataset-written boundary. No target transformation or ingestion specification is invented.

### 7. Current wildfire downstream

```text
PHASE1 OWNER INPUT — CURRENT WILDFIRE DOWNSTREAM
status=template-not-approved
rows=cwfis-current,bc-wildfire,ab-wildfire,on-fire-disturbance
depends_on=current-wildfire-archive-gate
transformation_ingestion=<OWNER: validate only after all six exact objects and readbacks pass>
release_and_production_admission=<OWNER: separate decisions required; remain false>
prohibited=real-time claim, complete-perimeter claim, source substitution, or geometry quarantine removal
```

This block cannot bypass the six-object archive gate or broaden the existing snapshot, authority, geometry, quarantine, or completeness boundaries.

### 8. Local-row downstream

```text
PHASE1 OWNER INPUT — LOCAL ROW DOWNSTREAM
status=template-not-approved
rows=fed-2023-ridings,elections-canada-45th-files,qc-current-ecoforest,qc-original-current-inventory,qc-fourth-inventory
source_decisions=<OWNER: record each row after exact readbacks>
archive_readbacks=<version|byte length|provider checksum|COMPLIANCE retention|recovery>
transformation_ingestion_release_production=<OWNER: record separately for each row; no local preparation implies admission>
```

### 9. Final queue admission

```text
PHASE1 OWNER INPUT — FINAL QUEUE ADMISSION
status=template-not-approved
rows=all 16 queue rows
source_scope_transformation_ingestion_release_production=<OWNER: each named decision must be recorded separately>
productionAdmission=false
productionEligible=false
DO_NOT_TREAT_THIS_BLOCK_AS_APPROVAL
```

The packet's machine claims remain `ownerApprovalsGranted=false`, `remoteMutationPerformed=false`, `transformed=false`, `ingested=false`, `released=false`, `productionAdmission=false`, `productionEligible=false`, with zero score delta.
