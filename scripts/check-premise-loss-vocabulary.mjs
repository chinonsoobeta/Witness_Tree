#!/usr/bin/env node
// The loss vocabulary is a gate, not a style note.
//
// Three things drift independently and each one is a wrong claim on its own:
// the decision record can say one thing while the module says another; a new
// component can reintroduce retired wording that no reviewer will notice among
// hundreds of strings; and a percentage can be attached to the sum, which is
// the one arithmetic error in this product that produces a plausible-looking
// number rather than an obvious one.
//
// This check compares the record to the module, sweeps user-facing source for
// retired wording, and refuses a percentage on the sum. It decides nothing: the
// owner decided the words, and this only stops them changing by accident.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RECORD_PATH = "data/premise-loss-vocabulary-decision.json";
export const MODULE_PATH = "lib/domain/loss-vocabulary.ts";
export const RECORD_SCHEMA = "witness-tree/premise-loss-vocabulary-decision/1";

// The register and the module both quote the retired wording on purpose, so
// they are the two files a sweep must not read as violations.
const SWEEP_EXEMPT = new Set([RECORD_PATH, MODULE_PATH]);
const SWEEP_ROOTS = ["app", "components"];
const SWEEP_EXTENSIONS = new Set([".ts", ".tsx"]);

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

export function sourceFiles(roots = SWEEP_ROOTS) {
  const files = [];
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(next);
      } else if (SWEEP_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(next);
      }
    }
  };
  for (const dir of roots) walk(dir);
  return files.sort();
}

/** Pulls the quoted string literals out of one exported localized constant. */
function moduleTerm(moduleText, exportName) {
  const pattern = new RegExp(
    `export const ${exportName}: LocalizedString = localized\\(\\s*"((?:[^"\\\\]|\\\\.)*)",\\s*"((?:[^"\\\\]|\\\\.)*)",?\\s*\\)`,
    "u",
  );
  const match = pattern.exec(moduleText);
  assert.ok(match, `${MODULE_PATH} no longer exports ${exportName} as a localized pair.`);
  return { en: match[1], fr: match[2] };
}

export function validateLossVocabulary(record, moduleText, files, readFile) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), "the vocabulary record is required");
  assert.equal(record.schemaVersion, RECORD_SCHEMA, "vocabulary record schema differs");
  assert.equal(record.status, "owner-approved-vocabulary-nonproduction", "vocabulary record status differs");
  assert.equal(record.decidedBy, "owner", "a vocabulary decision must name the owner as its decider");
  assert.match(String(record.decidedOn), /^\d{4}-\d{2}-\d{2}$/, "a vocabulary decision needs a decision date");

  // The record restates the module. If they disagree, one of them is lying to
  // a reader and there is no way to tell which, so neither is trusted.
  const pairs = [
    ["union", "UNION_TERM"],
    ["sum", "SUM_TERM"],
  ];
  for (const [key, exportName] of pairs) {
    const stated = record.terms?.[key];
    assert.ok(stated, `the record must state the ${key} term`);
    const actual = moduleTerm(moduleText, exportName);
    assert.equal(stated.en, actual.en, `${key} English term differs between the record and ${MODULE_PATH}`);
    assert.equal(stated.fr, actual.fr, `${key} French term differs between the record and ${MODULE_PATH}`);
  }
  for (const [key, exportName] of [
    ["detectedLossHectares", "DETECTED_LOSS_HECTARES"],
    ["detectedLossPercent", "DETECTED_LOSS_PERCENT"],
    ["forestLossLayer", "FOREST_LOSS_LAYER"],
    ["detectedForestLoss", "DETECTED_FOREST_LOSS"],
  ]) {
    const stated = record.labels?.[key];
    assert.ok(stated, `the record must state the ${key} label`);
    const actual = moduleTerm(moduleText, exportName);
    assert.equal(stated.en, actual.en, `${key} English label differs between the record and ${MODULE_PATH}`);
    assert.equal(stated.fr, actual.fr, `${key} French label differs between the record and ${MODULE_PATH}`);
  }

  // The union may carry a percentage because first-year forest bounds it. The
  // sum may not, because a cell lost twice contributes twice and no denominator
  // makes that a share of anything.
  assert.equal(record.terms.union.percentAllowed, true, "the union is the quantity a percentage is valid for");
  assert.equal(record.terms.sum.percentAllowed, false, "the sum can double-count a cell, so it has no valid percentage");
  assert.match(moduleText, /export const SUM_PERCENT_IS_FORBIDDEN = true as const;/,
    `${MODULE_PATH} must keep the sum-percentage prohibition as an enforced constant`);
  assert.equal(record.terms.netChange.included, false, "net change stays excluded until a gain product exists and is validated");

  // Every retired phrase the module bans must be banned in the record too, in
  // the same order, so a reviewer reading either file sees the whole rule.
  const modulePatterns = [...moduleText.matchAll(/pattern: "((?:[^"\\]|\\.)*)"/gu)]
    .map((match) => match[1].replace(/\\"/g, '"'));
  const recordPatterns = (record.retiredWording ?? []).map((entry) => entry.pattern);
  assert.ok(recordPatterns.length > 0, "the retired-wording register must not be empty");
  assert.deepEqual(recordPatterns, modulePatterns,
    "the retired-wording register differs between the record and the module");
  for (const entry of record.retiredWording) {
    assert.ok(typeof entry.replacement === "string" && entry.replacement.trim().length > 0,
      `retired wording "${entry.pattern}" needs a replacement`);
    assert.ok(typeof entry.reason === "string" && entry.reason.trim().length > 0,
      `retired wording "${entry.pattern}" needs a stated reason`);
  }

  const violations = [];
  for (const file of files) {
    if (SWEEP_EXEMPT.has(file)) continue;
    const text = readFile(file);
    for (const pattern of recordPatterns) {
      if (!text.includes(pattern)) continue;
      const line = text.slice(0, text.indexOf(pattern)).split("\n").length;
      violations.push(`${file}:${line} uses retired wording ${JSON.stringify(pattern)}`);
    }
  }
  assert.deepEqual(violations, [], `retired wording is still in user-facing source:\n  ${violations.join("\n  ")}`);

  return { files: files.length, retired: recordPatterns.length };
}

function main() {
  const result = validateLossVocabulary(
    JSON.parse(read(RECORD_PATH)),
    read(MODULE_PATH),
    sourceFiles(),
    read,
  );
  console.log(`${RECORD_PATH}: vocabulary matches ${MODULE_PATH}; ${result.retired} retired phrases absent from ${result.files} source files.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
