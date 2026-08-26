# Phase 1 NTEMS independent transformation readback

[`scripts/verify-phase1-ntems-transform.mjs`](../scripts/verify-phase1-ntems-transform.mjs) independently verifies canonical NTEMS outputs and sidecars produced by the transformation runner. It does not import or execute the runner and does not modify source, output, ledger, authorization, specification, or admission records.

The verifier binds the exact owner execution authorization, current runner SHA-256, specification SHA-256 values, every local input archive SHA-256/byte length/member, canonical output path, output SHA-256/byte length, GDAL structural metadata, and source/output pixel checksums. It checks sidecar canonical JSON bytes, deterministic command/tool/timestamp bindings, no-overwrite claims, and non-production claim boundaries. Output pairs are read-only and must be regular non-symlink files.

Partial/resumable work is supported: missing output pairs are reported as `missing`, while any output without its sidecar (or sidecar without its output) fails closed. Use `--require-complete` when all inputs for the selected authorization must be present.

Each resumable scope uses its matching per-scope execution authorization. With `--spec-id`, the verifier selects that authorization automatically; an aggregate authorization is never selected by default.

```sh
npm run check:phase1-ntems-transform-readback
node scripts/verify-phase1-ntems-transform.mjs --spec-id ntems-forest-harvest-v1 --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data
node scripts/verify-phase1-ntems-transform.mjs --authorization data/phase1-ntems-annual-land-cover-execution-authorization.json --spec-id ntems-annual-land-cover-v1 --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data
```

An explicit `--authorization` may name a composite record for a deliberately composite readback. The selected specification is still checked against its exact per-scope input bindings; composite evidence should be written only after every selected input has been verified.

Repository evidence is opt-in and write-once:

```sh
node scripts/verify-phase1-ntems-transform.mjs --spec-id ntems-forest-harvest-v1 --data-root /controlled/Witness_Tree-data --write-evidence --evidence-path data/ntems-forest-harvest-v1-readback-evidence-2026-08-26.json
```

No evidence file is written without `--write-evidence`, and an existing evidence path is never replaced.
