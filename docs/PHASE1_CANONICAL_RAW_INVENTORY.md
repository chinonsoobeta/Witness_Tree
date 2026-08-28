# Phase 1 canonical raw inventory

[`scripts/check-phase1-canonical-raw-inventory.mjs`](../scripts/check-phase1-canonical-raw-inventory.mjs) is the read-only reconciliation for the 22 Phase 1 core production rows. It resolves data only under `/Volumes/Extended_SSD/Witness_Tree-data`, hashes each explicitly named local artifact as a stream, and reports existence, byte length, and SHA-256. It does not glob a directory into the source set, call AWS, upload or delete data, alter IAM, or modify the production ledger.

The inventory keeps physical artifacts distinct from logical rows. The Elections Canada 2025 ZIP is one physical artifact referenced by both federal rows; the Alberta AVI ZIP is one physical artifact referenced by both AVI rows; CWFIS historical lists its separate NFDB and NBAC components; and the Québec fourth-inventory row lists all 56 sheet payloads plus its five local supporting records. A future Québec 2026 electoral file is reported as a non-canonical candidate and cannot satisfy the current 2017 component.

Run the check and write a durable local observation with:

```sh
npm run check:phase1-canonical-raw-inventory
node scripts/check-phase1-canonical-raw-inventory.mjs \
  --write data/phase1-canonical-raw-inventory-2026-08-27.json
```

The ordinary `npm run check:phase1-canonical-raw-inventory` command validates
the durable record, its 22-row contract, source specifications, derived counts,
and fail-closed claims without re-reading the external drive. To deliberately
re-hash every recorded byte and compare the fresh observation to the durable
record, run `npm run check:phase1-canonical-raw-inventory-bytes`.

The output is local-byte evidence only. Even when every listed file matches, its claims deliberately remain false for immutable archive, recovery replica, source-ledger admission, transformation admission, ingestion, release, production admission, and production eligibility. The output file is an observation and should be regenerated, reviewed, and dated after any data-root change; the script refuses to overwrite an existing output.
