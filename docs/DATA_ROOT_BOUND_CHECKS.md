# Checks that require the real data root

Twenty of the repository's check scripts read real source or derived bytes
and verify their SHA-256 against a bound checksum. They live in
[`data/data-root-bound-checks.json`](../data/data-root-bound-checks.json) and
are validated by `npm run check:data-root-bound-checks`.

The current operational default is `/Volumes/Extended_SSD/Witness_Tree-data`.
This inventory still names the internal compatibility path because its purpose
is to classify historical checks when that recorded path is unavailable; the
path currently resolves to the approved SSD. Historical evidence is not
rewritten.

## Why this record exists

When the drive holding `Witness_Tree-data` is detached, those twenty checks
fail. Some fail with a bare `AssertionError`, which on its face is
indistinguishable from a check that ran and found the evidence wrong. The two
findings are not the same and must never be collapsed:

- **Evidence contradicted** means the check read the bytes and they disagree
  with what a record claims. That is a defect and blocks the gate.
- **Evidence unavailable** means the check could not read the bytes at all.
  That is not a defect, and it is also not a pass. It is Unknown, and Unknown
  must not be recorded as zero, as absent, or as satisfied.

Nothing here excuses a failure. Every one of the nineteen still exits
non-zero, and no gate is relaxed. The record only makes the reason legible.

## What the checker proves, and what it does not

`node scripts/check-data-root-bound-checks.mjs` performs static validation: it
proves the inventory names only check scripts that still exist in
`package.json`, pins the schema, and holds the claim boundary at
`ownerAdmitted: false`, `released: false`, `productionEligible: false`. This
runs in CI. It proves the list has not rotted. It does **not** prove the list
is complete.

Completeness is only decidable while the data root is detached, because with
the drive attached these checks pass and a sweep cannot show which of them
depended on it. Running `node scripts/check-data-root-bound-checks.mjs
--empirical` with the drive detached runs every check script and requires a
two-way match: exactly the inventoried checks fail, no unlisted check fails,
and every listed failure is attributable to data-root absence. With the drive
attached the same command refuses to make a completeness claim and says so.
It does not guess.

At revision `cf985e1`, with the drive detached, that reconciliation passed:
137 of 156 check scripts passed and exactly the nineteen inventoried checks
failed.

That sentence is a record of what one sweep produced at one revision, so it
keeps its own numbers and is not updated to agree with today. The inventory has
since grown: `1a7a35f` added `check:phase1-ntems-readback-bytes`, taking it to
twenty, and the total number of check scripts has grown alongside it. The
current figures are the ones `npm run check:data-root-bound-checks` prints,
which is why they are not restated here. The empirical
reconciliation has not been re-run with the drive detached since, so whether a
fresh sweep would again attribute every failure cleanly is not determined. It
must not be assumed either way.

## Attribution is an allow-list

A failure counts as data-root absence only when its output matches one of two
recorded markers:

| Marker | Source |
| --- | --- |
| a path containing `Witness_Tree-data` | the check named the unreadable path |
| `Derived data root is absent or not absolute` | `scripts/run-wildfire-derived-recovery.sh` refuses before any TOTP or AWS call and deliberately never echoes a local path |

Anything else classifies as `other` and fails the reconciliation. A substring
catch-all would let a genuine defect hide behind a detached drive, so the
markers are enumerated rather than inferred.

## Why these checks cannot be made hermetic

The obvious repair is to point the tests at a fixture directory. It does not
work, and attempting it would weaken what they prove. `validateLocalArtifacts`
in `scripts/check-wildfire-derived-readback.mjs` verifies the SHA-256 of each
local artifact against the checksum bound in the promotion plan. A fixture
cannot reproduce the checksum of a real archive. The only ways to make the
test pass against a fixture are to fabricate the bytes, which is impossible,
or to delete the checksum comparison, which removes the single thing the test
exists to establish. The boundary is recorded here instead.

## What this means operationally

The twenty checks are unverifiable until the drive holding
`Witness_Tree-data` is reattached. That drive currently holds the only copy of
the data. Reattaching it is an owner action; nothing in this repository can
substitute for it, and no evidence derived from those checks may be recorded
as satisfied in the meantime.
