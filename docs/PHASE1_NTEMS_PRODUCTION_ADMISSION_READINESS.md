# Phase 1 NTEMS production-admission readiness

[`scripts/check-phase1-ntems-production-admission-readiness.mjs`](../scripts/check-phase1-ntems-production-admission-readiness.mjs) is an isolated, read-only validator for a future combined four-scope NTEMS production-admission record. It does not create that record and does not update the source ledger, field audit, or exit status.

The no-argument check is deliberately non-admitting. It reports whether a readback evidence file exists for each of the four exact pairs:

```sh
npm run check:phase1-ntems-production-admission-readiness
```

The reported presence count follows the exact checked-in readback files at invocation time. It is informational only: `admissionClaim` always remains `false` in this mode.

A future record can be checked explicitly with:

```sh
node scripts/check-phase1-ntems-production-admission-readiness.mjs --record data/<future-record>.json
```

The candidate record must bind, for every exact row/specification pair, the seven-scope owner approval, owner-local execution authorization, readback-verifier implementation, source-rights JSON pointers and values, every specification input profile, transformation specification, complete readback evidence, and every output and `.sidecar.json` hash and byte length. Authorization inputs are re-derived from the canonical profiles and annual preparation evidence. Output paths are derived from the exact specification, method version, source binding and year; parent traversal and arbitrary `.tif` substitutes are rejected. Sidecars must carry the complete deterministic command, tool versions, input binding, QA and conservative non-production claims.

Official publisher, dataset title, source-resource URL, update cadence and correction-listing URL are taken from the checksum-bound rights record rather than accepted as free-form candidate text. The validator also requires the OGL Canada licence/link and attribution, retained licence exclusions, bilingual modification notices and plain-language explanations, explicit unknown-with-reason edition and next-refresh fields, `/en/corrections` and `/fr/corrections` internal routes, and explicit ingestion, release, production-admission, production-eligibility, and deployment decisions. An admission decision may not predate its rights verification or execution authorization. The validator hashes files but never executes GDAL or mutates them.

The candidate status and decisions describe the record being validated; validation itself is not an admission or release action. Focused tamper tests are in [`tests/phase1-ntems-production-admission-readiness.test.mjs`](../tests/phase1-ntems-production-admission-readiness.test.mjs).

Once all four exact readbacks exist, the owner-authorized record is prepared with a fixed decision instant:

```sh
node scripts/prepare-phase1-ntems-production-admission.mjs \
  --decided-at YYYY-MM-DDTHH:MM:SSZ
```

That command builds and validates in memory but does not write. Adding `--write` creates `data/phase1-ntems-production-admission.json` with write-once semantics after the full validator passes. The preparer derives official source metadata from the bound rights record, reads exact retrieval evidence, and copies output hashes from completed independent readbacks; the validator then independently hashes every canonical artifact before accepting the record.
