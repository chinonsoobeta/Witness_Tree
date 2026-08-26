# Phase 2 owner admission packet

## Recorded limited admission — 2026-08-26

The content/data owner approved decision `phase2-v21-21-raster-and-2020-2022-province-aggregate-admission-v1` in the active implementation task. The decision is recorded separately, without changing this preparation packet or historical readback evidence, in `data/phase2-admission-record-2026-08-26.json`.

The record admits only the exact 39 VLCE2 source archives, the exact Statistics Canada 2021 province/territory boundary, all 21 V2.1 rasters and 21 sidecars, and the exact 13-row 2020–2022 aggregate. It explicitly keeps release, publication, production eligibility, expert review, independent comparisons, accuracy claims, other time ranges, and vector/per-cell geometry false. The machine-checked formal Phase 2 result is therefore 2/4 (50%).

[`data/phase2-owner-admission-packet.json`](../data/phase2-owner-admission-packet.json) presents one checksum-bound decision for the exact 21 V2.1 raster outputs and one 13-row 2020–2022 provincial/territorial aggregate. It is deliberately a **template, not an approval**.

The packet pins every raster and sidecar through the SHA-256 of the readback record that enumerates all 42 artifacts, plus lineage, raster contract, method parameters, boundary edition and ID field, aggregate output and sidecar, and the no-national-per-cell-geometry limit. Its copy/paste block accepts only `approve`, `reject`, or `defer`.

An owner approval would still not complete either formal admission gate. The V2.1 contract requires the raw inputs themselves to be admitted and checksum-bound. A later, separate immutable admission record must revalidate the packet and source-input admission evidence before gate 1 (admitted V2.1 baseline) or gate 4 (admitted boundary aggregates) can be marked complete. It must not modify this packet or the historical local-readback evidence.

[`data/phase2-admission-record.template.json`](../data/phase2-admission-record.template.json) now makes that future record fail closed. It requires one recorded `approve` decision bound to this packet, explicit admission records for all 39 annual VLCE2 archives and the exact Statistics Canada 2021 province/territory boundary artifact, and a fresh binding for all 21 rasters, 21 sidecars, method evidence, and the 13-row aggregate. It remains non-admitting until those separate records exist.

Even after a valid future admission record, expert review, independent comparisons, release, publication, production eligibility, vector geometry, and any unbound time range remain outside this decision.

Verify the packet with:

```sh
npm run check:phase2-owner-admission-packet
npm run check:phase2-admission-record-template
```

## Open owner decision: re-admit the corrected boundary evidence

`data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json` binds the exact
bytes of `data/boundary-editions.json`. That record contains a toolchain claim that is now false,
and correcting it breaks the binding. Engineering has verified the correction and refused to rebind
an owner admission to it.

The decision, the independent verification behind it, and the exact digests involved are in
[`docs/BOUNDARY_EDITIONS_GDAL_CLAIM_CORRECTION.md`](BOUNDARY_EDITIONS_GDAL_CLAIM_CORRECTION.md).
The admitted artifact, edition id, and feature count are unchanged; only the surrounding evidence
text is corrected.
