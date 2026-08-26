# Phase 2 formal exit status

The machine-checked record `data/phase2-formal-exit-status.json` tracks the four literal Phase 2 exit criteria: admitted V2.1 baseline, expert review, published independent comparisons, and admitted boundary aggregates. The exact limited baseline and boundary-aggregate admissions now pass: **2/4 (50%)**.

The new immutable admission record binds the owner decision, all 39 versioned VLCE2 source archives, the exact Statistics Canada 2021 province/territory boundary, all 21 rasters and 21 sidecars, and the exact 13-row 2020–2022 aggregate. It grants admission only: release and production eligibility remain false. Expert review remains 0/100 in every province, and all independent-comparison values remain null. Run `node scripts/check-phase2-formal-exit-status.mjs`.

The checker derives all four completion booleans from the bound evidence. It runs the canonical admission-record, V2.1 raster-readback, and province/territory aggregate validators before crediting the two admitted criteria. The review and comparison criteria stay open unless their evidence pointers resolve to the canonical completed envelope and that envelope passes its completion validator; a self-asserted `complete` flag or a staged/readback record cannot advance the count. The stored count, percentage, status, and claims must then match the derived result.
