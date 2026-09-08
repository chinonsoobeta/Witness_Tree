#!/usr/bin/env node
// A year range is a claim, and it was being made in three spellings at once.
//
// The same period appeared as "2020-2022" where the machine field was printed
// verbatim, as "2020 to 2022" where someone typed it into a sentence, and as
// "2020–2022" where someone knew the typographic rule. A reader comparing two
// figures could not tell whether three spellings meant three periods. Worse,
// the sentences that spelled the span out by hand did not move when the
// underlying artifact's period field moved, so widening the aggregate would
// have left true numbers under a stale span.
//
// This gate holds three lines:
//
//   1. Prose never sets a numeric range with a hyphen, and never with a U+2014
//      em dash. Ranges take U+2013.
//   2. No component reads an artifact's machine period field straight into the
//      page. Machine fields keep their hyphen because they also name layers and
//      files; prose asks lib/domain/year-range.ts for a form.
//   3. The formatter itself still spells each form the way this file says.
//
// It decides nothing about which periods are published. It only stops one
// period being described as three.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const FORMATTER_PATH = "lib/domain/year-range.ts";
const SWEEP_ROOTS = ["app", "components", "lib"];
const SWEEP_EXTENSIONS = new Set([".ts", ".tsx"]);

// The formatter states the rule and therefore has to quote the wrong forms.
const SWEEP_EXEMPT_FILES = new Set([FORMATTER_PATH]);

/*
 * Prose that must keep a hyphenated range, each with the reason it is not a
 * typographic slip. A licence attribution quotes a product title exactly as the
 * licensor publishes it; re-typesetting a quotation misquotes it, and these
 * attributions are a condition of the Open Government Licence.
 */
const HYPHEN_ALLOWED = [
  {
    fragment: "Annual High-resolution forest land cover for Canada (1984-2022)",
    reason: "Quotes the NRCan product title exactly, as the OGL attribution requires.",
  },
  {
    fragment:
      "Annual high-resolution forest land cover for Canada, 1984-2022",
    reason: "Quotes the NRCan product title exactly, as the OGL attribution requires.",
  },
  {
    fragment: "Couverture forestière annuelle à haute résolution pour le Canada",
    reason: "French attribution quoting the same NRCan product title.",
  },
  {
    fragment: "Couverture terrestre annuelle à haute résolution des forêts du Canada (1984-2022)",
    reason: "French OGL attribution quoting the NRCan product title as the licensor publishes it.",
  },
];

/*
 * The machine period field is read by exactly one module, which turns it into
 * the forms prose uses. Any other reader is printing a hyphen at a reader.
 */
export const PERIOD_FIELD_READER = "lib/explore/period.ts";
const PERIOD_FIELD_READ = "EXPLORE_PRODUCTION_LAYER.period";

/** A numeric year range joined by a hyphen, the form prose must not use. */
const HYPHENATED_RANGE = /\b(?:19|20)\d{2}\s?-\s?(?:19|20)\d{2}\b/u;
const EM_DASH = "—";

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

/*
 * Comments carry the reasoning, including the wrong forms they warn about, so
 * they are removed before the sweep rather than exempted file by file.
 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

/**
 * The quoted strings in one source file.
 *
 * A machine string is not prose and keeps its hyphen: a URL names a published
 * object, and a bare token with no spaces is an identifier, a layer name or a
 * file name. Only what has words in it is read as prose.
 */
export function proseLiterals(text) {
  const literals = [];
  const pattern = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/gu;
  for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!value.includes(" ")) continue;
    if (value.includes("://")) continue;
    literals.push(value);
  }
  return literals;
}

export function allowedReason(literal) {
  return HYPHEN_ALLOWED.find((entry) => literal.includes(entry.fragment));
}

/** The rules one prose literal breaks, so the rules are testable on their own. */
export function literalViolations(literal) {
  const rules = [];
  if (literal.includes(EM_DASH)) rules.push("em-dash");
  if (HYPHENATED_RANGE.test(literal) && !allowedReason(literal)) rules.push("hyphenated-range");
  return rules;
}

export function sweepViolations(files = sourceFiles()) {
  const violations = [];
  for (const file of files) {
    if (SWEEP_EXEMPT_FILES.has(file)) continue;
    const text = stripComments(readFileSync(path.join(root, file), "utf8"));
    for (const literal of proseLiterals(text)) {
      for (const rule of literalViolations(literal)) violations.push({ file, literal, rule });
    }
  }
  return violations;
}

export function periodFieldReaders(files = sourceFiles()) {
  return files.filter((file) => {
    if (file === PERIOD_FIELD_READER) return false;
    return stripComments(readFileSync(path.join(root, file), "utf8")).includes(PERIOD_FIELD_READ);
  });
}

export function checkFormatter() {
  const text = readFileSync(path.join(root, FORMATTER_PATH), "utf8");
  assert.match(text, /const EN_DASH = "–";/u, `${FORMATTER_PATH} must set ranges with U+2013.`);
  assert.equal(
    text.includes(`const EN_DASH = "${EM_DASH}"`),
    false,
    `${FORMATTER_PATH} must never define the range separator as a U+2014 em dash.`,
  );
  for (const form of ["compact", "span", "from", "between"]) {
    assert.ok(text.includes(`"${form}"`), `${FORMATTER_PATH} must still offer the ${form} form.`);
  }
}

export function run() {
  checkFormatter();

  const readers = periodFieldReaders();
  assert.deepEqual(
    readers,
    [],
    `Only ${PERIOD_FIELD_READER} may read ${PERIOD_FIELD_READ}. These print the machine ` +
      `form at a reader: ${readers.join(", ")}. Call productionAggregatePeriod(locale, form) instead.`,
  );

  const violations = sweepViolations();
  assert.deepEqual(
    violations,
    [],
    violations
      .map(
        (violation) =>
          `${violation.file}: ${violation.rule} in ${JSON.stringify(violation.literal.slice(0, 120))}`,
      )
      .join("\n"),
  );

  return { checkedFiles: sourceFiles().length, allowedQuotations: HYPHEN_ALLOWED.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = run();
  console.log(
    `Year-range gate passed across ${result.checkedFiles} source files, ` +
      `with ${result.allowedQuotations} quoted product titles held as written.`,
  );
}
