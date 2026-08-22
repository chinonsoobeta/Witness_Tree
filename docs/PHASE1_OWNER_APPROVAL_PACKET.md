# Phase 1 owner-approval packet

The copy/paste blocks below are historical input templates. Their federal, Québec current/original, Québec fourth, and current-wildfire archive decisions were later recorded in `data/phase1-phase3-owner-approvals-2026-08-21.json`. That later approval does not prove execution or readback completion.

[`data/phase1-owner-approval-packet.json`](../data/phase1-owner-approval-packet.json) is a machine-checked, copy/paste owner-input packet for the 16 `local-verified-profiled` or `remote-verified-archived-profiled` rows in [`data/phase1-owner-decision-queue.json`](../data/phase1-owner-decision-queue.json). It is derived from parent `4466a14` and remains `template-not-approved` for unresolved decisions, while recording two supplied non-admitting decisions: national source-ledger-only acceptance and the exact PLVI raw/derived scope.

The packet separates every dependency step into three independent decisions:

1. reversible source or scope decision;
2. irreversible archive and COMPLIANCE-retention approval; and
3. release and production-admission decision.

An owner may copy a block below as an input template, but no placeholder is an approval. The packet carries no owner identity, contact, MFA code, version secret, permission grant, or downstream/production approval. It does not send email, submit a form, call AWS, write remote storage, admit transformation, ingest, release, or make a row production eligible.

Current baseline remains **14.25/31 raw evidence credits**, **38.7903226% formal evidence tracking**, **7 immutable rows**, and **0/31 production-admitted or production-eligible**. Partial and access-blocked rows remain explicit exclusions: `cwfis-historical`, `provincial-electoral-boundaries`, and the 13 access-blocked rows in the machine record. They are not silently moved into this owner packet.

## Current owner execution and readback order

This order prioritizes the fewest unresolved dependencies, then the bounded percentage gain already recorded in the remaining-actions audit. It is not a probability forecast: external response rates are unknown, so no expected gain is invented. Every action remains unexecuted.

| Rank | Exact owner decision or action | Dependency | Maximum bounded Phase 1 gain |
| ---: | --- | --- | ---: |
| 1 | After the active Québec current/original run succeeds, capture and validate its private/redacted exact-version attestation pair. | The archive approval is recorded; execution/readback evidence is pending. | `+0.50` raw, `+0.483871` formal points, `+2/31` immutable coverage |
| 2 | Execute only the recorded federal-only command with fresh MFA, then integrate exact immutable and recovery readbacks. Do not revisit harvest or canopy-height. | The federal archive approval is recorded; one prepared physical artifact is shared by two rows. | `+0.50` raw, `+0.483871` formal points, `+2/31` immutable coverage |
| 3 | Supply controlled paths and fresh MFA for the recorded Québec fourth-inventory execute template, then integrate exact readbacks. | All four approvals are recorded; 61 prepared files plus one deterministic manifest remain unexecuted. | `+0.25` raw, `+0.2419355` formal points, `+1/31` immutable coverage |
| 4 | Perform the approved owner-local wildfire proof/readback workflow and preserve concrete version, checksum, retention and recovery proof for all six exact objects. | The approval is recorded, but the gate remains `0/6` machine-verifiable and `6/6` attested-only. | `+1.00` raw, `+0.9677419` formal points, `+4/31` immutable coverage |
| 5 | Complete the recorded channel-specific NBAC, Alberta and Québec request prerequisites, then retain complete publisher replies and exact artifacts. | External agreement, consent, signature/declaration, permission and artifact delivery remain pending; this packet sends nothing. | Each partial row: at most `+0.75` raw and `+0.7258065` formal points |
| 6 | Continue only the recorded, deduplicated publisher/rightsholder engagements for the 13 access-blocked rows, then require lawful exact artifacts, rights, checksum, profile and archive proof. | External responses and lawful artifacts remain pending; no local substitute or inferred permission. | Combined ceiling: `+13.00` raw and `+12.5806452` formal points |
| 7 | After each row's prerequisites pass, separately decide its named transformation, ingestion, release and production admission. This includes harvest and canopy-height despite their recorded source decisions. | Complete immutable/evidence chain and row-specific downstream output proof. | Immediate current gain `0`; each later admitted row would change admission coverage by `1/31` (`3.2258065` percentage points) |

The normal archive-control exercise approval is also recorded. Its owner-local legal-hold, retention, delete-denial and recovery exercise must still be run and evidenced. It is a global exit dependency, not row credit or production admission.

Exact artifact names, local paths, byte lengths, SHA-256 values, payload and manifest keys, bucket and region, retention dates, proposed role scopes, transformation policies, quarantines, and exclusion decisions are bound in the packet's `exactBindings` and checked against their authoritative records. Shared physical artifacts are listed once and mapped to every applicable row.

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

### 2. Québec current/original archive

```text
PHASE1 OWNER INPUT — QUÉBEC CURRENT/ORIGINAL ARCHIVE
status=template-not-approved
rows=qc-current-ecoforest,qc-original-current-inventory
source_scope_decision=<OWNER: accept|reject|defer each row>
archive_approval=<OWNER: exact two artifacts, four keys, MFA-gated multipart path, bucket, region, and COMPLIANCE date>
retention_until=2033-08-12T00:00:00Z
release_and_production_admission=<OWNER: not requested at this stage>
DO_NOT_RUN=zsh scripts/run-qc-approved-multipart-promotion.sh --run
```

The packet binds both exact ZIP names, paths, bytes, SHA-256 values, payload keys, manifest keys, the 128 MiB part size, allow list, deny-by-omission list, and exact retention keys. No archive approval is inferred from the local preflight.

### 3. Québec fourth-inventory archive

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

### 4. Archived national source ledger

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

### 5. Alberta PLVI scope

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

### 6. Current wildfire archive gate

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

### 7. Archived remote downstream

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

### 8. Current wildfire downstream

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

### 9. Local-row downstream

```text
PHASE1 OWNER INPUT — LOCAL ROW DOWNSTREAM
status=template-not-approved
rows=fed-2023-ridings,elections-canada-45th-files,qc-current-ecoforest,qc-original-current-inventory,qc-fourth-inventory
source_decisions=<OWNER: record each row after exact readbacks>
archive_readbacks=<version|byte length|provider checksum|COMPLIANCE retention|recovery>
transformation_ingestion_release_production=<OWNER: record separately for each row; no local preparation implies admission>
```

### 10. Final queue admission

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
