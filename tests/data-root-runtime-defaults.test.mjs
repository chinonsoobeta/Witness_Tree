import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * Generalizes the frozen-date defect rather than pinning the one script it was
 * found in. A `??` fallback to a literal under data/ with a calendar date in it
 * is a destination chosen by whoever last edited the source rather than by the
 * run that writes it.
 *
 * Only scripts that write are considered. Defaulting a reader to a dated record
 * is the opposite of the defect: it names which canonical record to validate,
 * and asserts nothing about when anything happened. Two scripts do exactly that
 * and are correct, so a rule that flagged every dated fallback would be wrong.
 */
const DATED_FALLBACK = /\?\?[^;]*?["'`][^"'`]*data\/[^"'`]*\d{4}-\d{2}-\d{2}[^"'`]*["'`]/u;
const WRITES = /\b(?:writeFileSync|appendFileSync|writeFile|createWriteStream)\s*\(/u;

const datedWriteDestinations = (source) => {
  if (!WRITES.test(source)) return [];
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("//") && !line.startsWith("*") && DATED_FALLBACK.test(line));
};

test("the scan catches the shape the NTEMS readback verifier used to have", () => {
  const before = [
    'const evidencePath = options.evidencePath ?? (result.specifications.length === 1 ? `data/${result.specifications[0].id}-readback-evidence-2026-08-26.json` : DEFAULT_COMPOSITE_EVIDENCE);',
    'writeFileSync(destination, body, { flag: "wx" });',
  ].join("\n");
  assert.equal(datedWriteDestinations(before).length, 1, "The removed line is the defect this scan exists for.");
  assert.deepEqual(datedWriteDestinations(before.replace("-2026-08-26", "")), []);
  assert.deepEqual(datedWriteDestinations('const file = argv[2] ?? "data/readback-2026-08-25.json";\nreadFileSync(file);'), [], "A reader that names a dated record is not this defect.");
});

test("no runtime script that writes falls back to an evidence destination with a date frozen into it", () => {
  const offenders = [];
  for (const name of readdirSync(new URL("../scripts", import.meta.url)).filter((entry) => /\.(mjs|mts)$/u.test(entry))) {
    const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
    for (const line of datedWriteDestinations(source)) offenders.push(`${name}: ${line}`);
  }
  assert.deepEqual(offenders, [], "A defaulted dated path names a date the run did not happen on. Require an explicit destination instead.");
});
