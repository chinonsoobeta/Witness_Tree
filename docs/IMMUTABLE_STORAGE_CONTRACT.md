# Immutable storage promotion contract

`lib/archive-staging` is the provider-neutral, pure validation boundary for a future immutable raw archive. It does not upload data, create a bucket, set a retention policy, or claim that a production archive exists.

It accepts only a verified local-staging record with immutable and production flags explicitly set to `false`. A deterministic snapshot prefix is derived from source ID, source version, retrieval timestamp, and the lower-case SHA-256 of the exact compressed bytes:

```
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/payload/{lower-case-original-filename}
raw/{source-id}/{source-version}/{retrieved-at-utc}/{sha256}/manifest.json
```

The validator rejects unsafe path components, aliases such as `current` and `latest`, checksum/key drift, unqualified attribution, non-HTTPS provenance links, and duplicate payload keys. `validatePromotionHistory` additionally requires every later snapshot for a source to name the immediately preceding payload key. A first snapshot cannot invent a predecessor.

`remote-verified` is deliberately strict. It requires Canadian-region evidence, matching remote byte length, a checksum link back to staging, separate provider version IDs for payload and sidecar, compliance retention, a retention-until timestamp later than review, and a reviewer/time. An `uploaded` or `rejected` record can carry incomplete remote evidence, but cannot be represented as remotely verified.

The checksum link is satisfied in one of two ways, because a whole-object SHA-256 is not available from S3 above 5 GB. A single-PUT object can carry a full-object SHA-256; at any size, a full-object CRC64NVME compared against the locally staged CRC64NVME serves the same purpose. Otherwise a multipart object carries a composite digest, a hash over the concatenated per-part digests suffixed with the part count, which is never equal to the whole-object digest. A composite is accepted only when it equals a locally recomputed composite at the same part size and part count, and those parts must account for exactly the staged byte length. A composite whose part size or part count is absent leaves integrity Unknown and never satisfies the gate. The types make the two kinds distinct, so comparing a composite to a whole-object digest is a compile error.

Digest encoding is single-valued and explicit. Every whole-object digest in this contract, staged or remote, is recorded as lower-case hex. S3 reports checksums base64-encoded, so a base64 value is normalised with `hexDigestFromProviderBase64` before it is recorded, and the provider's original base64 string is kept beside the record as evidence rather than in the digest field. A base64 digest left in a `FullObjectChecksum` fails the shape gate and the promotion is rejected, because base64 of a SHA-256 or CRC64NVME can never satisfy the hex shape for its algorithm. The one exception is the composite multipart digest, which stays in the provider's `base64-{partCount}` form because it is opaque and is only ever compared to a local recomputation in that identical form.

No provider field is hard-coded beyond an operator-supplied bucket identifier, Canadian location evidence, provider version IDs, and retention evidence. Credentials, signed URLs, and personal information are rejected by process: they have no field in this contract and must never be committed.
