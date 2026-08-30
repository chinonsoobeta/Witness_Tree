import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OLD_INTERNAL_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const EXTERNAL_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data";
const ACTIVE_RUNTIME_SCRIPTS = [
  "run-phase1-ntems-transform.mjs",
  "verify-phase1-ntems-transform.mjs",
  "check-phase2-real-national-execution-evidence.mjs",
  "run-qc-stand-copy.mjs",
  "verify-qc-stand-copy-readback.mjs",
];

// The federal transformation and QC multipart runners are historical evidence:
// dedicated gates bind their exact bytes to completed owner-run attestations.
// Changing their defaults would invalidate those records rather than migrate them.

test("active runtime scripts resolve their default data root through the shared helper", () => {
  for (const name of ACTIVE_RUNTIME_SCRIPTS) {
    const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
    assert.match(source, /from ["']\.\/data-root\.mjs["']/u, `${name} must import data-root.mjs`);
    assert.match(source, /(?:resolveDataRoot|configuredDataRoot)\(\)/u, `${name} must call the shared data-root resolver`);
    assert.doesNotMatch(source, new RegExp(OLD_INTERNAL_ROOT.replaceAll("/", "\\/"), "u"), `${name} retains the retired internal default`);
  }
});

test("active shell runners and the phase2 review generator default to the external data volume", () => {
  const runners = [
    "run-alberta-plvi-approved-promotion.sh", "run-current-wildfire-approved-promotion.sh",
    "run-federal-electoral-approved-promotion.sh", "run-nbac-approved-promotion.sh",
    "run-phase1-approved-promotion.sh", "run-phase2-annual-riding-zonal.sh",
    "run-phase2-per-cell-tiles.sh", "run-phase8-bulk-download-publication.sh",
    "run-qc-fourth-inventory-approved-promotion.sh",
    "run-wildfire-derived-approved-promotion.sh", "run-wildfire-derived-manifest-retention.sh",
    "run-wildfire-derived-readback.sh", "run-wildfire-derived-recovery-owner.sh",
    "run-wildfire-derived-recovery.sh",
  ];
  for (const name of runners) {
    const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(EXTERNAL_ROOT.replaceAll("/", "\\/"), "u"), `${name} must default to the external data root`);
    assert.doesNotMatch(source, new RegExp(OLD_INTERNAL_ROOT.replaceAll("/", "\\/"), "u"), `${name} retains the retired internal default`);
  }
  const generator = readFileSync(new URL("../scripts/generate-phase2-v21-review-packet.py", import.meta.url), "utf8");
  assert.match(generator, new RegExp(EXTERNAL_ROOT.replaceAll("/", "\\/"), "u"));
  assert.doesNotMatch(generator, new RegExp(OLD_INTERNAL_ROOT.replaceAll("/", "\\/"), "u"));
});
