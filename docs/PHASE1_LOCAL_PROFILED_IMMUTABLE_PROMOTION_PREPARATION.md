# Local-profiled immutable-promotion preparation

This dry-run-only national preparation covers the remaining local-profiled rows `ntems-canopy-height`, `fed-2023-ridings`, and `elections-canada-45th-files`. The harvest payload is excluded because its immutable primary/recovery evidence is recorded separately in [`nrcan-harvest-remote-archive-evidence.json`](../data/nrcan-harvest-remote-archive-evidence.json). The two federal rows intentionally share the same 45th-election ZIP, so this group has **two** physical artifacts and no duplicate upload.

Run `npm run prepare:phase1-local-profiled-immutable-promotion` to validate each exact staged local path, byte length, SHA-256, profile, and deterministic payload/sidecar keys. It does not contain AWS code or credentials and cannot upload, create a bucket, set Object Lock, alter retention, transform, ingest, or release data.

The later federal-only approval names the exact shared federal artifact, Canadian bucket and region, COMPLIANCE retain-until timestamp, and uploader/read-back procedure. It does not authorize revisiting the already archived harvest or canopy objects. Owner-local execution and exact readback evidence remain pending. The existing generic archive-staging contract derives append-only payload and `manifest.json` keys; this preparation does not create a historical scratchpad or a second archive framework.
