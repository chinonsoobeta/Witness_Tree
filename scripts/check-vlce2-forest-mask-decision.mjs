#!/usr/bin/env node
// The VLCE2 forest-mask decision record is a gate, not a note. Prose can drift: a class row
// can be quietly set to "Include", or a sign-off row filled in, while the gate outcome still
// reads No and no reviewer ever sees the change. This check makes the document refuse to be
// half-filled. It never turns Unknown into an approval, and it cannot itself approve a mask.
import { readFileSync } from "node:fs";

const PATH = "docs/VLCE2_FOREST_MASK_DECISION.md";
const doc = readFileSync(PATH, "utf8");
const failures = [];

/** Every VLCE2 class code the register must dispose of explicitly. */
const CLASS_CODES = [0, 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230];

const rows = doc
  .split("\n")
  .filter((line) => /^\| *-?\d+ *\|/.test(line))
  .map((line) => line.split("|").map((cell) => cell.trim()));

const seen = rows.map((cells) => Number(cells[1]));
for (const code of CLASS_CODES) {
  if (!seen.includes(code)) failures.push(`Class-treatment register is missing VLCE2 class ${code}.`);
}
for (const extra of seen) {
  if (!CLASS_CODES.includes(extra)) failures.push(`Class-treatment register names unknown VLCE2 class ${extra}.`);
}

const outcome = /\|\s*\*\*Mask implementation permitted\*\*\s*\|\s*\*\*(No|Yes)\*\*\s*\|/.exec(doc);
if (!outcome) failures.push("The gate outcome row for mask implementation is missing.");

const permitted = outcome?.[1] === "Yes";
const decided = rows.filter((cells) => cells[3] !== "Unresolved");

// While the gate is closed, no class may already read as decided. A decided class with a
// closed gate is the exact drift this check exists to catch.
if (!permitted && decided.length > 0) {
  for (const cells of decided) {
    failures.push(`Class ${cells[1]} is recorded as "${cells[3]}" while mask implementation is not permitted.`);
  }
}

// Opening the gate requires the register to be complete first, never the other way round.
if (permitted && decided.length !== CLASS_CODES.length) {
  failures.push("Mask implementation is marked permitted while the class-treatment register is incomplete.");
}

// The non-implementation gate sentence is load-bearing: it is what tells a reader that an
// absent mask is Unknown rather than zero.
if (!doc.includes("it is not zero and is not a provisional national-baseline figure")) {
  failures.push("The non-implementation gate no longer states that an absent mask is Unknown rather than zero.");
}

if (failures.length > 0) {
  console.error(`${PATH} failed the forest-mask decision gate:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`VLCE2 forest-mask decision gate passed: ${CLASS_CODES.length} classes unresolved, mask implementation not permitted.`);
