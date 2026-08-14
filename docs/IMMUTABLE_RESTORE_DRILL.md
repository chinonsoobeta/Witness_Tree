# Immutable restore drill

On 2026-08-14, the project performed a read-only restore drill for every payload recorded in [`data/immutable-promotions.json`](../data/immutable-promotions.json): Québec historic wildfire, Alberta AVI Crown, and NRCan 2022 canopy cover. The exact S3 payload key and VersionId for each object were supplied to `HeadObject` and `GetObject`; no mutable key or current-version alias was used.

The non-secret result is recorded in [`data/immutable-restore-drill.json`](../data/immutable-restore-drill.json). The report binds each restored file’s byte count and SHA-256 to the staged record, records successful `unzip -tqq` integrity verification, and confirms the temporary drill copy was removed. It also records the AWS CLI, hashing, and ZIP-tool versions and timestamps. It contains no AWS credentials, signed URLs, or local temporary paths.

The drill does not prove production readiness, source completeness, transformation, or ingestion. It proves only that the three named, version-pinned immutable payloads could be read back and matched to their recorded staged bytes at this point in time.

Run the repository-only gate with:

```sh
npm run check:immutable-restore-drill
```

The gate has no AWS client or write path. It fails if any payload lacks its exact promoted VersionId or key, does not match the staged byte length and SHA-256, lacks a passed archive test, or claims a retained temporary copy.
