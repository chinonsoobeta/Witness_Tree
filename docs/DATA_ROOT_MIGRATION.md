# Data root migration and `WITNESS_TREE_DATA_ROOT`

The Witness Tree data set is moving off the internal drive onto the external SSD. Jobs,
verifiers and readbacks must be able to name their data root instead of hard-coding it.

## Policy

`scripts/data-root.mjs` is the single source of truth:

- `WITNESS_TREE_DATA_ROOT` overrides the root for any run.
- `DEFAULT_DATA_ROOT` is the fallback. It is still the internal root and **flips to
  `SSD_DATA_ROOT` at cutover**, once byte identity with the internal root is proven.
- `relocateToDataRoot(recordedPath)` re-roots a path that a durable record captured against
  the internal root. The record keeps the directory the run actually wrote to; only the
  location where the bytes are checked moves.
- `approvedDataRootRealPath()` resolves the root, permitting it to be a symlink **only** when
  it points at `SSD_DATA_ROOT`. Every path below the root must still be a real, unsymlinked
  file, so callers keep their own symlink rejections.

Durable records are never rewritten by any of this. Owner-command templates keep the absolute
`--data-root` the owner actually approved, and evidence files keep the paths they were written
with. Overriding the root changes only where a job reads and writes, never what a record claims.

## Converted

- `scripts/readback-phase2-v21-province-zonal-pilot.mts`
- `scripts/readback-phase2-v21-raster-first.mjs`
- `scripts/readback-phase2-real-national.mjs`
- `scripts/check-phase2-real-national-preflight.mjs`
- `scripts/check-phase2-historical-evidence-status.mjs`
- `scripts/check-wildfire-derived-readback.mjs`
- `scripts/generate-phase2-v21-review-packet.py`

Verified against the SSD by running with the env var set: the zonal pilot readback passes and
the historical evidence check finds all 79 rasters and 38 component files there.

## Blocked on the owner: four checksum-bound defaults

These four still carry the internal root as their default and were deliberately **not** edited:

- `scripts/run-phase1-ntems-transform.mjs`
- `scripts/verify-phase1-ntems-transform.mjs`
- `scripts/run-qc-stand-copy.mjs`
- `scripts/verify-qc-stand-copy-readback.mjs`

**Why.** Each script's own SHA-256 is bound into an owner execution authorization or production
admission record. Changing a single byte fails those bindings: editing them turned
`npm run test:unit` from 827/827 to 822/827 with
`NTEMS readback stopped: runner SHA-256 does not match authorization.` Re-pointing the default
would therefore require a new owner authorization, which cannot be manufactured.

**Why it does not block execution.** All four already accept `--data-root` on the command line
(`run-phase1-ntems-transform.mjs:265`, `verify-phase1-ntems-transform.mjs:355`,
`run-qc-stand-copy.mjs:225`, `verify-qc-stand-copy-readback.mjs:607`). Runs against the SSD pass
the flag explicitly. Only the fallback is stale.

**To clear it.** Fold the default change into the next owner re-authorization of these runners,
so the byte change and the authorization checksum move together.

## Cutover sequence

Not yet performed. In this order, stopping at the first failure:

1. Finish `rsync -a --partial` convergence of the whole root.
2. Prove byte identity: `rsync -ani --checksum` must produce an empty transfer list, and the
   regular-file counts and byte totals must match.
3. Rename the internal `Witness_Tree-data` to a temporary backup name.
4. Create the compatibility symlink at the internal path pointing at the SSD root.
5. Re-run the canonical readbacks through the symlink.
6. Only then delete the backup.

The owner has authorized deleting the internal copy. Step 6 stays gated on steps 2 and 5: the
internal source is never deleted before byte verification.
