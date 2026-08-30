# Data root migration and `WITNESS_TREE_DATA_ROOT`

The Witness Tree data set is moving off the internal drive onto the external SSD. Jobs,
verifiers and readbacks must be able to name their data root instead of hard-coding it.

## Policy

`scripts/data-root.mjs` is the single source of truth:

- `WITNESS_TREE_DATA_ROOT` overrides the root for any run.
- `DEFAULT_DATA_ROOT` and `SSD_DATA_ROOT` are `/Volumes/Extended_SSD/Witness_Tree-data`; the migration cutover is complete.
  The internal root remains only as a compatibility symlink for historical evidence.
- `relocateToDataRoot(recordedPath)` re-roots a path that a durable record captured against
  the internal root. The record keeps the directory the run actually wrote to; only the
  location where the bytes are checked moves.
- `approvedDataRootRealPath()` resolves the root, permitting it to be a symlink **only** when
  it points at `SSD_DATA_ROOT`. Every path below the root must still be a real, unsymlinked
  file, so callers keep their own symlink rejections.

Durable records are never rewritten by any of this. Owner-command templates keep the absolute
`--data-root` the owner actually approved, and evidence files keep the paths they were written
with. Overriding the root changes only where a job reads and writes, never what a record claims.

For ordinary current operations, use `/Volumes/Extended_SSD/Witness_Tree-data`.
Do not replace an absolute path in a recorded command, receipt, authorization,
or other historical evidence: it documents where that action actually ran.

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

Complete. All six steps performed 2026-08-26, in this order, stopping at the first failure:

1. Finish `rsync -a --partial` convergence of the whole root.
2. Prove byte identity: `rsync -ani --checksum` must produce an empty transfer list, and the
   regular-file counts and byte totals must match.
3. Rename the internal `Witness_Tree-data` to a temporary backup name.
4. Create the compatibility symlink at the internal path pointing at the SSD root.
5. Re-run the canonical readbacks through the symlink.
6. Only then delete the backup.

The owner has authorized deleting the internal copy. Step 6 stays gated on steps 2 and 5: the
internal source is never deleted before byte verification.

### What each step produced

1. **Convergence.** Complete.
2. **Byte identity.** `rsync -ani --checksum --delete` ran for 63 minutes and exited 0 with an
   empty transfer list: no file differs and nothing would be deleted. Regular-file counts and byte
   totals match exactly on both roots: 3,916 files, 367,656,070,795 bytes.
3. **Rename.** The internal root is now `Witness_Tree-data.pre-cutover-backup`.
4. **Compatibility symlink.** The internal path is a symlink to `SSD_DATA_ROOT`.
5. **Readbacks through the symlink.** `npm run test:unit` is 873/873 against the symlinked root.
6. **Deletion.** The owner authorized deleting the internal copy, and it was deleted only after
   steps 2 and 5 both passed and after the step 5 fix landed on `main`. Immediately before the
   delete, the backup and the SSD root were confirmed to sit on different devices (16777231 and
   16777248), the internal path was confirmed to be a symlink resolving to `SSD_DATA_ROOT`, and the
   SSD root was re-counted at 3,916 files and 367,656,070,795 bytes. 343 GB was reclaimed on the
   internal drive. The suite was re-run afterwards, with the internal copy gone, and is 873/873
   reading from the SSD.

The data now exists in one place. The SSD is the only copy, so it is the only thing standing
between this project and total data loss, and it has no backup of its own. That is a real exposure
and it is outside what this migration was asked to solve.

### What step 5 caught

The first run through the symlink failed one test, and it was a real finding rather than noise.

`scripts/run-federal-electoral-approved-promotion.sh` requires its data root to satisfy
`! -L "$DATA_ROOT"`. That is deliberate. The script hashes the exact approved artifact through one
`O_NOFOLLOW` descriptor, and a swappable root would defeat the point of refusing to follow links.
The guard was left byte-identical; its SHA-256 is unchanged at
`892769330c386636e4870323a6cb82369d505dc8eadd1e9924e785b266648d34`.

The fix belonged in the caller. `tests/federal-electoral-approved-promotion.test.mjs` hard-coded
the internal root as the `FEDERAL_DATA_ROOT` it passed in. It now calls
`approvedDataRootRealPath(INTERNAL_DATA_ROOT)`, which is the helper written for exactly this: it
permits the one approved link at the root and returns the real directory. Before cutover it returns
the internal root unchanged, so the test reads identically either way.

This is the general rule for the rest of the migration. A caller that rejects a symlinked root is
usually correct, and the answer is to resolve the approved real root before calling it, never to
relax the rejection.
