# Phase 2 Version 2.1 real review packet

The corrected local packet at `../../Witness_Tree-data/derived/phase2-v21-review-packet-v2/packet.json` contains 400 real raster observations: 100 each in BC, Alberta, Ontario and Québec, split evenly across early/late interval and observed-loss/known-no-loss strata. Every selected location was re-read from its native 30 m V2.1 interval raster and verified inside the recorded provincial boundary geometry. Version 2 explicitly uses GDAL's traditional GIS axis order for EPSG:4326 and the validator rejects implausible Canadian longitude/latitude values; it replaces the axis-swapped display coordinates in the superseded Version 1 packet.

This is a deterministic nonproduction candidate packet, not a validation result. It carries the sample cell coordinates, latitude/longitude, interval, observed class, raster and boundary hashes, selection seed, and blank bilingual reviewer fields. The interval rasters do not establish harvest or wildfire causation, so the packet deliberately has no attribution stratum and does not infer attribution.

The checksum-bound repository record is `data/phase2-v21-real-review-packet-evidence.json`. Run `node scripts/check-phase2-v21-real-review-packet.mjs` to verify its digest, cardinality, no-review state and nonproduction assertions.

`data/phase2-v21-real-review-packet-raster-readback-evidence.json` additionally records a direct local readback of all 400 packet cells from the two native V2.1 interval rasters: 200 observed-loss cells read as `1` and 200 known-no-loss cells read as `0`. Run `npm run check:phase2-real-review-packet-raster-readback` to verify that record, or `npm run readback:phase2-real-review-packet` to perform a new non-overwriting readback. This confirms only that the candidate labels agree with the bound local rasters; it is not expert review, validation, admission, publication, or a product-accuracy claim.

Expert review remains not started (0/100 in every province). The separately admitted baseline and boundary aggregate bring the Phase 2 formal score to 2/4; this packet grants no additional credit.

## Offline expert-review workflow

`data/phase2-v21-expert-review-workflow.json` turns the existing checksum-bound packet into a fail-closed offline assignment: the packet samples are sorted by province and selection rank, yielding exactly 100 candidates for each of BC, Alberta, Ontario, and Québec. `data/phase2-v21-expert-review-results.template.json` and `data/phase2-v21-expert-reviewer-roster.template.json` deliberately contain no reviewer identity, approval, or result.

Before a result can count, the named content/data owner, Chinonso Obeta, must approve a separate roster that binds both the exact workflow contract and the real packet. Each reviewer entry must identify a human (`isHuman: true`) with a substantive name, affiliation, role, qualifications, province coverage, approval date, and a self-attested independent/no-conflict review. The completed results must checksum-bind that exact roster byte-for-byte, repeat the approved role for every row, and attest the reviewer’s independent inspection at the row timestamp. `node scripts/check-phase2-v21-expert-review-workflow.mjs --results /path/to/results.json --roster /path/to/approved-roster.json` rejects incomplete, duplicate, reassigned, unbound, unrostered, synthetic or placeholder, unqualified, non-UTC-dated, non-independent, or blank records and prints the province-by-province completion and outcome summary. The default command validates only the ready/no-results package and reports 0/100 per province; it does not turn preparation into human review.

Every row must record one bounded outcome (`confirmed`, `not-confirmed`, or `indeterminate`) for both year and attribution. An `indeterminate` value is not a substitute for inspection: it requires substantive bilingual `indeterminateReasons.year` or `indeterminateReasons.attribution` evidence. English and French row notes must be substantive and cannot be placeholder or synthetic test text. The contract records a minimum substantive-note length of 32 characters and requires at least one determinate year outcome and one determinate attribution outcome in each of BC, AB, ON and QC, so 400 copied all-indeterminate rows cannot close the criterion. The checks are evidence-quality gates; they do not prove that an outcome is scientifically correct.

## Completion evidence envelope

`scripts/check-phase2-v21-expert-review-evidence.mjs` validates a later, owner-supplied completion envelope without creating one. The envelope must be `status: "completed"` and checksum-bind:

- `data/phase2-v21-expert-review-workflow.json` and its exact packet;
- the approved reviewer-roster JSON;
- the completed 400-result JSON; and
- exact totals of 400 assigned, 400 completed, and 100 completed results in each of BC, AB, ON and QC.

The envelope has only these fields: `schemaVersion`, `status`, `workflow`, `packet`, `reviewerRoster`, `results`, `counts` (`assigned`, `completed`, `perProvince`), and `claims`. Each binding is `{path, sha256, byteLength}`; the validator computes and checks the digests from the referenced bytes.

The workflow checker supplies the owner-approved roster binding, human identity/role and independence attestations, reviewer qualification/province coverage, packet-source-hash, timestamp, bounded outcome, indeterminate-reason, and bilingual-substantive-note checks. The envelope’s claim boundary must keep `productAccuracyClaim`, `admittedInputs`, `productionEligible`, and `released` false. No completed human evidence is checked into this repository.

Run the readiness check with `npm run check:phase2-expert-review-evidence`; it reports 0/100 per province until an evidence path is supplied. After the owner has created the completed envelope and its bound files, run `node scripts/check-phase2-v21-expert-review-evidence.mjs --evidence /path/to/review-evidence.json`. This validator does not modify `data/phase2-formal-exit-status.json`, make an admission or release decision, or grant production eligibility.
