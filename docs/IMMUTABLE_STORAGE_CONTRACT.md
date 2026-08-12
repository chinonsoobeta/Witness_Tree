# Immutable storage promotion contract

`lib/archive-staging` is the provider-neutral, pure validation boundary for a future immutable raw archive. It does not upload data, create a bucket, set a retention policy, or claim that a production archive exists.

It accepts only a verified local-staging record with immutable and production flags explicitly set to `false`. A deterministic snapshot prefix is derived from source ID, source version, retrieval timestamp, and the lower-case SHA-256 of the exact compressed bytes:

```
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/payload/{lower-case-original-filename}
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/manifest.json
```

The validator rejects unsafe path components, aliases such as `current` and `latest`, checksum/key drift, unqualified attribution, non-HTTPS provenance links, and duplicate payload keys. `validatePromotionHistory` additionally requires every later snapshot for a source to name the immediately preceding payload key. A first snapshot cannot invent a predecessor.

`remote-verified` is deliberately strict. It requires Canadian-region evidence, matching remote byte length and SHA-256, separate provider version IDs for payload and sidecar, compliance retention, a retention-until timestamp later than review, and a reviewer/time. An `uploaded` or `rejected` record can carry incomplete remote evidence, but cannot be represented as remotely verified.

No provider field is hard-coded beyond an operator-supplied bucket identifier, Canadian location evidence, provider version IDs, and retention evidence. Credentials, signed URLs, and personal information are rejected by process: they have no field in this contract and must never be committed.
