# Staged transformation decision contract

This is a pure TypeScript decision boundary for the two verified local staging archives. It does not read files, change geometries, fetch data, write object storage, ingest records, or create a production release.

Each decision is bound to the source ID, exact SHA-256 archive checksum, profiling decision, attribution state, and an explicit invalid-geometry count. An unknown count is rejected; it can never be silently converted to zero.

The Québec wildfire archive can be marked `ready-for-transformation-design` only when its profiled geometry count is zero and its attribution metadata is verified. That status permits design work only: ingestion and production eligibility remain `false`.

The Alberta AVI archive remains `blocked` because its current profile identifies 608 invalid geometries and its attribution is pending review. A deterministic repair-or-quarantine policy and attributed evidence must be reflected in a newly verified profile before a later decision can change this. Supplying a policy object to this current profile does not override the block.

This contract deliberately makes no claim that a transformation has happened or that either data source is ready for public use.
