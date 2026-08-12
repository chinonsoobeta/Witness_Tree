# Example source ledger

[`data/source-ledger.json`](../data/source-ledger.json) is an illustrative, non-production fixture for the source-ledger shape. Every entry has `status: "example"` and uses the reserved `example.local` domain. It does not state that any endpoint was retrieved, that any dataset was ingested, or that any checksum describes a real snapshot.

The fixture has one entry for each supported public evidence class in this unit:

- `official-record`
- `satellite-observation`
- `derived-estimate`

Each example includes bilingual explanatory text, publisher and custodian, an HTTPS catalogue URL, temporal and spatial coverage, update frequency, an illustrative retrieval time and snapshot checksum, licence ID and URL, and transform version. Production ingestion must replace this fixture with verified source metadata and a checksum of an immutable raw archive snapshot.
