# Local-profiled immutable-promotion preparation

This dry-run-only preparation covers the four `local-verified-profiled` production rows in the canonical ledger: `ntems-forest-harvest`, `ntems-canopy-height`, `fed-2023-ridings`, and `elections-canada-45th-files`. The two federal rows intentionally share the same 45th-election ZIP, so there are **three** physical artifacts and no duplicate upload.

Run `npm run prepare:phase1-local-profiled-immutable-promotion` to validate each exact staged local path, byte length, SHA-256, profile, and deterministic payload/sidecar keys. It does not contain AWS code or credentials and cannot upload, create a bucket, set Object Lock, alter retention, transform, ingest, or release data.

Before any remote action, obtain fresh explicit owner approval naming all three exact artifacts, the exact Canadian bucket and region, the COMPLIANCE retain-until timestamp, and the uploader/read-back procedure. The existing generic archive-staging contract derives append-only payload and `manifest.json` keys; this preparation does not create a historical scratchpad or a second archive framework.
