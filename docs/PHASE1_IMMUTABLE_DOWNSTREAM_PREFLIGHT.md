# Phase 1 immutable-row downstream preflight

[`data/phase1-immutable-downstream-preflight.json`](../data/phase1-immutable-downstream-preflight.json) audits all nine remotely archived Phase 1 rows without transforming or ingesting data. Eight rows remain blocked before a concrete output preflight is possible: the four NTEMS rows have no Phase 1 production-admission target method and checksum-bound output, the two Alberta AVI rows have no approved downstream scope or derived payload, and the two Québec current/original rows have immutable source evidence but no approved production transformation or checksum-bound output. The separately approved Phase 2 nonproduction method does not supply or imply these Phase 1 production gates.

Alberta PLVI is the only row with an owner-scoped, checksum-bound derived payload and a named transformation record. Its 899,551,232-byte output remains bound to SHA-256 `5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b`. Feature count, geometry, duplicate `POLYGON_ID 41405`, repair count, and closed-join checks pass.

The ordered attribute-schema gate fails closed. Compared with the raw source, `SUBMISSION_ID` became `SUBMISSION`, `Shape_Length` became `Shape_Leng`, and 23 `Integer` fields widened to `Integer64`. Therefore the output is not ingestion-ready. It needs either a newly produced checksum-bound output that preserves the approved source schema or an explicit field-mapping decision, followed by the full preflight again. Transformation admission and ingestion remain separate owner decisions.

Run the repository-only contract check with:

```sh
npm run check:phase1-immutable-downstream-preflight
```

The optional controlled-data check is read-only and verifies the exact local bytes and live ordered schemas:

```sh
node scripts/check-phase1-immutable-downstream-preflight.mjs --verify-local --data-root <controlled-absolute-Witness_Tree-data-path>
```

This work changes no Phase 1 score or completion state. The current formal evidence score is `14.75/31` and `39.2741935%`; immutable archive is 9 rows; production admission and eligibility remain 0/31. The two Québec rows are immutable source evidence only and add no downstream authorization.
