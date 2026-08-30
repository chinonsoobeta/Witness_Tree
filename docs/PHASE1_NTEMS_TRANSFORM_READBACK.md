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

## The 2026-08-30 re-verification

Two sets of readback evidence are committed, dated 2026-08-26 and 2026-08-30.
Both are real, and the older set is kept rather than replaced.

Pull request #84 changed this repository's NTEMS transform runner and, in the
same commit, rewrote the four owner-bound execution authorizations so their
`runner.sha256` named the new file. It did not touch the readback evidence, which
still named the pre-#84 runner. The checker re-verifies against the files as they
are today, so it began reporting a contradiction: the committed record and a
fresh verification disagreed.

The disagreement was entirely in two fields. For every scope the fresh
verification differs from the 2026-08-26 record in `runner.sha256` and
`authorization.sha256` and in nothing else: output SHA-256, output byte length,
sidecar bytes, GDAL structural metadata and source and output pixel checksums all
match exactly, across all 42 outputs. The bytes on disk were never in question.

That is what #84's runner change predicts. Its whole diff is one added import and
`DEFAULT_DATA_ROOT` moving from a hardcoded path to `resolveDataRoot()`, which
changes only the default value of `--data-root`. Nothing in the transform path
moved, so the same inputs still produce the same bytes.

The repair is therefore a re-verification, not a re-transform. Re-running the
transform would have destroyed and rebuilt 78 GB of correct output to arrive at
identical bytes. The 2026-08-30 records state what was actually established: on
that date, the committed outputs were verified byte for byte and pixel checksum
for pixel checksum against the runner and authorizations as they now stand.

The 2026-08-26 records remain committed. They were true when written, and the
outputs they describe were produced under the runner they name. Deleting them
would erase the history that explains why two dates exist.

Staleness of this kind is no longer invisible: the guarded set of
`tests/phase1-ntems-readback-bytes.test.mjs` now includes the runner and all four
authorizations, so a change to any of them fails
`npm run check:data-root-test-currency` in CI until the data-root-bound suite is
re-run. See [DATA_ROOT_TEST_CURRENCY.md](DATA_ROOT_TEST_CURRENCY.md).
