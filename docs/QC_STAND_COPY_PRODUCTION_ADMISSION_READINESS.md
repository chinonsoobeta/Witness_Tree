# Québec stand-copy readback and admission readiness

`scripts/check-qc-stand-copy-production-admission-readiness.mjs` covers only
the two named Phase 1 stand-copy scopes:

* `qc-current-ecoforest-stand-copy-v1`
* `qc-original-current-inventory-stand-copy-v1`

## Default mode

The default command is presence-only and read-only:

```sh
npm run check:qc-stand-copy-production-admission-readiness
```

It checks only whether each canonical GeoPackage and its
`run-qc-stand-copy.mjs` sidecar are regular, non-symlink files. It does not
hash or parse them, invoke GDAL, transform data, write a record, contact an
external service, or claim ingestion, release, deployment, production
admission, or eligibility. Its JSON result has
`mode: "readback-presence-only"` and false admission claims.

## Independent post-publication readback

[`scripts/verify-qc-stand-copy-readback.mjs`](../scripts/verify-qc-stand-copy-readback.mjs)
is a separate verifier from the stand-copy runner. Its default invocation is
also a cheap presence preflight and makes no GDAL or SQLite read. Use
`--verify` for a completed scope:

```sh
npm run verify:qc-stand-copy-readback -- \
  --scope qc-current-ecoforest --verify --data-root /controlled/Witness_Tree-data
npm run verify:qc-stand-copy-readback -- \
  --scope qc-original-current-inventory --verify --data-root /controlled/Witness_Tree-data
```

The explicit readback performs only read-only `ogrinfo`/SQLite work against
the published GeoPackage and its bound source: it hashes both output files,
checks the canonical layer/schema/CRS/feature count, checks missing/empty/
invalid geometries and lineage, recomputes source/output row fingerprints,
and verifies the exact canonical runner sidecar. It returns a readback result
with `admissionClaim: false`, `productionAdmission: false`, and
`productionEligible: false`; it is not an admission or release action.

To create the evidence file, opt in explicitly. The destination is created
with exclusive creation and an existing file is never replaced:

```sh
npm run verify:qc-stand-copy-readback -- \
  --scope qc-current-ecoforest --write-evidence \
  --data-root /controlled/Witness_Tree-data \
  --evidence-path data/qc-current-ecoforest-stand-copy-readback-evidence.json
```

The evidence binds the exact output and sidecar hashes, source/output
fingerprints, specification SHA-256, verifier path/SHA-256/method version,
and all non-admission claims. Do not use `--write-evidence` for a preflight.

## Full record validation

A future owner admission record can be checked without changing the ledger:

```sh
node scripts/check-qc-stand-copy-production-admission-readiness.mjs \
  --record data/<owner-qc-stand-copy-production-admission.json>
```

The record must bind, for both rows, the exact packet, scope-only owner
approval, transformation specification, execution approval, and source-rights
evidence, plus the exact per-scope independent readback evidence and the
SHA-256 of `verify-qc-stand-copy-readback.mjs`. The validator verifies the
recorded SHA-256 values against local evidence files and checks the raw archive
and extracted GeoPackage hash/byte-count bindings recorded in the exact
specification and source-rights evidence, and
requires the canonical output paths from `run-qc-stand-copy.mjs`.

It then checks the output and sidecar byte lengths and SHA-256 values. The
sidecar must be canonical UTF-8 JSON and must report the exact input layer,
`MultiPolygon` geometry, `EPSG:32198`, feature count, published attribute
schema, output layer/schema, lossless row fingerprints, geometry byte-copy
result, and all no-join/no-reprojection/no-repair QA flags. The sidecar's
execution-approval hash, source hashes, specification hashes, and prohibited
claims must all match the bound approvals and specifications.

The rights record is restricted to CC BY 4.0 with the Données Québec licence
URL, publisher attribution in English and French, and a bilingual notice that
the source values are preserved and the derived output is a modification. Each
row carries bilingual plain-language limits and correction routes at
`/en/corrections` and `/fr/corrections`, plus the publisher listing. The owner
decision must explicitly set ingestion, release, production admission,
production eligibility, and deployment to `true`; the execution approval and
runner sidecar remain non-admitting evidence and are required to bind those
later decisions. Each row also carries the complete 22-field `ledgerFields`
object; factual publisher, URL, retrieval, checksum, schema, attribution,
coverage, cadence, edition/refresh unknowns, and correction-route values are
checked against the existing Québec source/specification evidence and the
independent readback output.

This validator deliberately does not edit `data/phase1-production-source-ledger.json`,
any exit-status record, or the output directory.

## Production-admission preparer

[`scripts/prepare-qc-stand-copy-production-admission.mjs`](../scripts/prepare-qc-stand-copy-production-admission.mjs)
is the write-once preparer for the same two scopes. With no arguments it runs
readiness-only: it reports canonical output, sidecar, and per-scope readback
evidence presence and never writes a record. Both current and original scopes
must have complete evidence before a record can be constructed.

To construct and validate a candidate in memory, provide an explicit fixed,
whole-second UTC decision instant. The command still does not write:

```sh
npm run prepare:qc-stand-copy-production-admission -- \
  --decided-at YYYY-MM-DDTHH:MM:SSZ
```

The preparer builds only from the canonical packet, scope approval, execution
approvals, specifications, source-rights evidence, runner sidecars, and
independent readback evidence. It then calls the existing QC admission checker
against the in-memory record and the canonical artifacts. Add `--write` only
after the owner has supplied the decision instant:

```sh
npm run prepare:qc-stand-copy-production-admission -- \
  --decided-at YYYY-MM-DDTHH:MM:SSZ --write
```

This creates
`data/phase1-qc-stand-copy-production-admission.json` with exclusive-create
semantics and refuses to replace an existing record. It does not run the
transformation, alter either source archive, edit the production source
ledger, update a gate or exit-status record, or perform ingestion, release,
deployment, or another external mutation.

Focused preparer coverage is in
[`tests/prepare-qc-stand-copy-production-admission.test.mjs`](../tests/prepare-qc-stand-copy-production-admission.test.mjs).
