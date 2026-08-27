# Phase 2 zonal provenance repair

Recorded 2026-08-26. This is a control record for a falsified-provenance defect found
on `main` at `e74264ff2c8ee2fe437c6f47ffa6041ddcd364d8` and repaired on
`fix/phase2-zonal-provenance-restore`.

## What was wrong

The squash merge of PR #25 edited `scripts/phase2_zonal_aggregate.py` (adding a
defensive fallback when GDAL exposes no `MEM` OGR driver) and rewrote
`data/phase2-v21-province-zonal-pilot-evidence.json` so that `run.workerSha256` and
`run.codeVersion` named the edited worker.

The recorded run did not use the edited worker. The run-time sidecar,
`derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.sidecar.json`, is
identical on both data roots and records:

- `execution.workerSha256`: `ba331f904d73c6f0ecf77a87029154b00d539a366c06c2e69863f531d32b1a41`
- `execution.startedAt`: `2026-08-25T23:59:44.625830Z`
- `execution.completedAt`: `2026-08-26T00:07:03.119294Z`

The edited worker did not exist until after that run completed. The evidence file
therefore claimed a code version that could not have produced its own outputs.

Four checked-in records still bound the truthful pre-edit evidence file
(`4fb0efc6ec984025e91f0124e0347a2f0a08673ed1f606ba318c9ca732f5ce62`), including
`data/phase2-admission-record-2026-08-26.json`, which is a recorded owner admission
(`decision: approve`, `claims.admitted: true`). The drift therefore broke the binding
between an owner decision and the artifact that decision approved.

## Evidence that it was a real failure, not a stale pin

Both canonical Phase 2 validators failed on `main`:

- `node scripts/check-phase2-formal-exit-status.mjs` threw `evidence bindings drifted`.
- `npx tsx scripts/readback-phase2-v21-province-zonal-pilot.mts` threw on
  `sidecar.execution.workerSha256 !== evidence.run.workerSha256`.

`npx tsx --test tests/phase2-formal-exit-status.test.mjs` was **3 failed / 0 passed** on
`main`. The handoff note recording `npm run test:unit` at 827/827 described the
pre-squash branch, not the merged `main`.

## Repair

`data/phase2-v21-province-zonal-pilot-evidence.json` and
`scripts/phase2_zonal_aggregate.py` were restored to their owner-admitted state from
`7023afbd866611216682d94f7623109508deb189`. No gate, pin, assertion or admission record
was loosened, and no owner decision was rewritten. The evidence file again records the
worker that actually produced the run, and the worker on disk again hashes to the value
the sidecar recorded.

After the repair: both validators pass, `tsc --noEmit` is clean, `eslint` is clean, and
`npm run test:unit` is 827/827.

## Why CI did not catch it

`.github/workflows/ci.yml` ran the exit-status checker for Phases 1, 4, 5, 6, 7, 8 and 9
but not for Phase 2. `npm run check:phase2-formal-exit-status` reads only repository
files, so it is portable and belongs on the Ubuntu branch gate. It has been added
alongside the other exit-status checks.

## Freezing the admitted worker bytes

Restoring the evidence alone put two true facts in conflict:

- The admitted outputs were produced by worker `ba331f90`, which the run-time sidecar records.
- That worker is not portable. On the Ubuntu CI image `ogr.GetDriverByName("MEM")` returns
  `None`, so `npm run check:phase2-zonal-aggregation` failed 5 of 8 GDAL tests.

PR #25 resolved the conflict by editing the worker and rewriting the evidence to name the
edited worker. That is what made the evidence false: it claimed a code version that did not
exist when the outputs were written.

The honest resolution keeps both facts. `evidence.run.workerSha256` is a statement about
what `scripts/phase2_zonal_aggregate.py` contained **at run time**. It stays true forever and
does not require the live file to be frozen. So:

- The admitted bytes are frozen at `data/provenance/phase2_zonal_aggregate.admitted-ba331f90.py`,
  taken byte-exact from `7023afbd:scripts/phase2_zonal_aggregate.py`. It is a provenance
  record, not code: nothing imports or executes it.
- The live worker carries the in-memory OGR driver fallback and now hashes to `e01a1168`.
- `check-phase2-v21-province-zonal-pilot-evidence.mjs` and the local readback verify the
  binding against the frozen record instead of the live worker.

The record's path is *derived from the digest it must hash to*
(`admitted-${workerSha256.slice(0, 8)}.py`), so it is self-binding: the record cannot be
swapped without breaking equality with `evidence.run.workerSha256`, which is itself
checksum-bound into the recorded owner admission (`4fb0efc6`). The chain is no weaker than
hashing the live file, and it survives legitimate worker changes.

This stays fail-closed for re-runs. A new run writes a sidecar naming the new worker digest,
which will not equal the admitted `evidence.run.workerSha256`, so the readback fails until a
fresh admission is recorded.

## Steps 1 to 3, now done

Recorded 2026-08-26, after the repair above.

1. **The re-run happened.** The 2020-2022 province zonal aggregate was run again against the
   canonical data root with the live portable worker `e01a1168`, into a new batch directory
   `derived/phase2-v21-zonal-province-2021-cbf-v6`. The admitted v5 directory was not touched.
   All three inputs were confirmed identical to the admitted run by SHA-256 before the run:
   the 2020 forest mask, the 2020-2022 whole-interval loss raster, and the 2021 cartographic
   boundary archive. GDAL, Python and numpy versions match the admitted run exactly.

2. **The fresh sidecar and evidence exist.** The run wrote its own sidecar, and
   `data/phase2-v21-province-zonal-pilot-v6-evidence.json` records it. The evidence was
   generated from the sidecar bytes rather than written by hand, so it cannot drift from the
   run it describes. `npm run check:phase2-v21-province-zonal-pilot-v6` validates it against
   the repository, and `npm run readback:phase2-v21-province-zonal-pilot-v6` verifies it
   against the real artifacts on the data root.

3. **The new worker bytes are frozen.** `data/provenance/phase2_zonal_aggregate.candidate-e01a1168.py`
   is byte-exact from the live worker and hashes to the digest in its own filename, so it is
   self-binding in the same way the admitted record is.

   The name is `candidate-`, not `admitted-`. No owner has admitted this worker, and a filename
   that said `admitted` would assert an approval nobody has given. If the owner admits it, the
   rename to `admitted-e01a1168.py` is the visible act of admission.

### The result worth recording

**The portable worker reproduced the admitted output byte for byte.** Both runs produce an
output of 3131 bytes hashing to `ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d`.

That is stronger evidence than the repair needed. It shows the in-memory OGR driver fallback,
the edit that started this whole problem, changed no number on this run. It does not show that
the fallback changes no number on any run, and the evidence record says so explicitly.

The two sidecars differ, and should. Each records its own worker digest, code version, start
and completion time, and elapsed seconds. A sidecar that did not differ would mean one of them
was not a record of its own run.

The reproduction claim is bound rather than restated. The checker asserts that the v6 output
digest equals the digest inside the admitted v5 evidence, so editing either one fails the check
instead of quietly making the claim false. Six tampering cases were confirmed rejected,
including forging the reproduction digest, claiming the admitted worker produced the v6 run,
and flipping `admitted` to true.

## Still open

An owner decision. `data/phase2-zonal-v6-owner-admission-packet.json` is prepared and contains
no approval: `ownerDecision` is null, and no field in it may be filled in on the owner's behalf.
It states what would be admitted, binds the exact checksums, and lists what the owner should
know before deciding, including the fact that admitting it advances no gate.

Phase 2 stays honestly at 2/4. This work advances nothing, and was not meant to. The two open
Phase 2 criteria are expert review at 100 per province and published independent comparisons,
and neither is touched by any of it.
