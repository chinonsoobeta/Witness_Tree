# Phase 1 federal-electoral transformation runner

`federal-electoral-districts-2023-v1` has a local, fail-closed runner at
`scripts/run-phase1-federal-electoral-transformation.mjs`.

The default command is read-only:

```sh
npm run check:phase1-federal-electoral-transformation
```

That preflight binds the unchanged specification and downstream packet,
profile, source ledger, and raw archive/recovery evidence. It hashes the local
ZIP exactly (`4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93`,
10,301,648 bytes), reads `SHP/FED_CA_2025_EN.shp` with GDAL, applies the exact
`REPORDER = '2023'` selection, and checks 352 Polygon features, 343 distinct
`FED_NUM` values, the NAD83 Lambert CRS, required fields, and zero missing,
empty, or invalid geometries. It also refuses to proceed if the derived output
or sidecar already exists.

The runner never treats the existing scope approval as execution permission.
`--execute` requires the exact canonical file
`data/phase1-federal-electoral-execution-approval.json`. That future record
must have this schema and must bind every value shown:

```json
{
  "schemaVersion": "witness-tree/phase1-federal-electoral-execution-approval/1",
  "status": "owner-authorized-execution",
  "decision": "approve",
  "approvedAt": "2026-08-25T00:00:00.000Z",
  "spec": {"id":"federal-electoral-districts-2023-v1","methodVersion":"phase1-federal-electoral-districts-2023-v1","path":"data/phase1-production-transformation-specifications-v1.json","sha256":"258ca3f94e30d484b53cc12e29c83beaf57998993edaea05e44f5a4924979efc"},
  "packet": {"path":"data/phase1-downstream-admission-packet.json","sha256":"4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a"},
  "ownerScope": {"path":"data/phase1-transformation-scope-owner-approval-2026-08-25.json","sha256":"<exact-current-file-sha256>","specId":"federal-electoral-districts-2023-v1"},
  "runner": {"path":"scripts/run-phase1-federal-electoral-transformation.mjs","sha256":"<sha256-of-final-runner>","version":"phase1-federal-electoral-transformation-runner-v1"},
  "source": {"path":"../Witness_Tree-data/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip","sha256":"4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93","byteLength":10301648,"profilePath":"data/elections-canada-fed-2025-profile.json","profileSha256":"a742f27e879126ded6cd37dc66f4595b488afd467a4523d8b9defcaa16379301","ledgerPath":"data/elections-canada-fed-2025-source-ledger.json","ledgerSha256":"b1d28895c43c843a6072ef9adca661c26c3a27fbdda27650ea216abe56c707fb","archiveEvidencePath":"data/federal-electoral-archive-recovery-evidence.json","archiveEvidenceSha256":"18b9fbfa5e3eecdc33ad0098f5ffa55f7bfebb1a47d2e33b7f01a94e05a6ed32"},
  "output": {"path":"../Witness_Tree-data/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg","sidecarPath":"../Witness_Tree-data/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg.sidecar.json","layer":"federal_electoral_districts_2023"},
  "authorization": {"executionAuthorized": true}
}
```

The runner creates a temporary GeoPackage, uses `ogr2ogr` without dissolve,
simplification, repair, clipping, or reprojection, adds deterministic lineage
fields, fixes the GeoPackage metadata timestamp, validates exact feature and
geometry readback, then atomically renames the output and creates the required
sidecar. No source, packet, approval, ingestion, public release, or production
record is modified by this runner.
