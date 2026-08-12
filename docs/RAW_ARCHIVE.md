# Raw archive manifest

`lib/archive` is a pure example-only contract for recording immutable raw-source snapshots. It performs no download, object-storage write, or network request, and the fixtures use only `example.local` URLs.

Each append records source-ledger and ingest IDs, requested URL, retrieval metadata, checksum, source/effective versions, licence, deterministic source/version/retrieval object key, and an optional prior snapshot key. Existing keys cannot be reused, and prior links must point to an earlier manifest entry.
