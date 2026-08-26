# Current-wildfire exact raw archive capture — 2026-08-25

[`current-wildfire-exact-raw-archive-capture-2026-08-25.json`](../data/current-wildfire-exact-raw-archive-capture-2026-08-25.json) is a read-only capture of the four approved raw current-wildfire payloads and their four deterministic sidecars in `witness-tree-raw-archive-ca-central-1`, `ca-central-1`, Canada.

The offline checker binds every capture entry to the promotion preparation and staged source bytes. It requires a concrete unique version ID, exact key, byte length and SHA-256, `FULL_OBJECT` `CRC64NVME` provider value, and `COMPLIANCE` retention through `2033-08-12T00:00:00Z` for all eight objects. Run it with:

```sh
npm run check:current-wildfire-exact-raw-archive-capture
```

This proves raw archive evidence only. It does not admit any source or close the six-object production gate: the two derived payloads and all recovery-replication evidence remain unverified, and transformation, ingestion, release, and production eligibility remain false.
