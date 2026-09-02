#!/usr/bin/env node
/**
 * Fails closed on the shipped interval measurements.
 *
 * Three things can go wrong here that nothing else would catch:
 *
 *   the file and the code can disagree about what a span index means. The
 *   producer writes 741 numbers in one order and the TypeScript reads them back
 *   by arithmetic. Nothing in either language checks the other, so every span
 *   is walked here and the two orders are compared position by position.
 *
 *   the file can carry a number that is not possible. A union above its own
 *   denominator, or above the sum it is drawn from, is not a rounding
 *   difference; it means the aggregation counted something twice.
 *
 *   the file can reach the browser. It is 2.4 MB, and the one thing keeping it
 *   server-side is that no client component imports it, directly or through the
 *   barrel. That is a property of the import graph, so it is checked as one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE_PATH = "data/phase3-riding-interval-measurements.json";
export const LOADER_PATH = "lib/explore/riding-intervals.ts";
export const BARREL_PATH = "lib/explore/index.ts";
export const RELEASE_SCHEMA = "witness-tree/phase3-riding-interval-measurements/1";
export const STEPS = 38;
export const SPANS = 741;
export const FIRST_YEAR = 1984;
export const DISTRICT_COUNTS = Object.freeze({ CA: 343, BC: 93, AB: 87, ON: 124, QC: 127 });

/** The order the release is written in, stated once so both sides can be compared to it. */
export function spanOrder() {
  const order = [];
  for (let start = 0; start < STEPS; start += 1) {
    for (let end = start; end < STEPS; end += 1) {
      order.push({ fromYear: FIRST_YEAR + start, toYear: FIRST_YEAR + end + 1 });
    }
  }
  return order;
}

/** The arithmetic the TypeScript uses, restated so a drift between them is visible. */
export function windowIndex(fromYear, toYear) {
  const start = fromYear - FIRST_YEAR;
  const end = toYear - FIRST_YEAR - 1;
  return start * STEPS - (start * (start - 1)) / 2 + (end - start);
}

/**
 * Checks the release document itself.
 *
 * Returns the district total so the caller can report it; throws on the first
 * thing that is wrong, naming the district and the span.
 */
export function validateIntervalRelease(release) {
  if (release?.schema !== RELEASE_SCHEMA) throw new Error("The interval release has the wrong schema.");
  if (release.spanCount !== SPANS || release.annualStepCount !== STEPS) {
    throw new Error("The interval release does not hold 741 spans over 38 annual steps.");
  }
  if (release.firstYear !== FIRST_YEAR || release.lastYear !== FIRST_YEAR + STEPS) {
    throw new Error("The interval release does not cover 1984 to 2022.");
  }
  if (release.cellHectares !== 0.09) throw new Error("The interval release is not on the 30 m grid.");
  if (release.summedPercentAllowed !== false) {
    throw new Error("The interval release must record that the summed figure has no percentage.");
  }
  if (release.netChangeIncluded !== false) {
    throw new Error("The interval release must record that net change is not included.");
  }
  if (Object.values(release.claims ?? {}).some(Boolean) || Object.keys(release.claims ?? {}).length !== 4) {
    throw new Error("The interval release must carry four claims, all false.");
  }
  if (!Array.isArray(release.inputs) || release.inputs.length !== 5 ||
    release.inputs.some((input) => !/^[0-9a-f]{64}$/.test(input?.sha256 ?? ""))) {
    throw new Error("The interval release must name the five aggregates it was built from, by checksum.");
  }

  const order = spanOrder();
  order.forEach((span, index) => {
    const derived = windowIndex(span.fromYear, span.toYear);
    if (derived !== index) {
      throw new Error(`Span ${span.fromYear} to ${span.toYear} sits at ${index} but the arithmetic finds ${derived}.`);
    }
  });

  let total = 0;
  const seen = new Set();
  for (const entry of release.jurisdictions ?? []) {
    const expected = DISTRICT_COUNTS[entry?.jurisdiction];
    if (expected === undefined) throw new Error(`The interval release names an unexpected jurisdiction.`);
    if (entry.districts.length !== expected) {
      throw new Error(`${entry.jurisdiction} holds ${entry.districts.length} districts, expected ${expected}.`);
    }
    for (const district of entry.districts) {
      const id = `${entry.jurisdiction}-${district.boundaryId}`;
      if (seen.has(id)) throw new Error(`Duplicate district ${id}.`);
      seen.add(id);
      const prefix = [0];
      for (const step of district.annualLossCells) prefix.push(prefix[prefix.length - 1] + step);
      let index = 0;
      for (let start = 0; start < STEPS; start += 1) {
        let union = 0;
        for (let end = start; end < STEPS; end += 1) {
          union += district.unionLossCellDeltas[index];
          const span = `${FIRST_YEAR + start} to ${FIRST_YEAR + end + 1}`;
          if (district.unionLossCellDeltas[index] < 0) {
            throw new Error(`${id} ${span}: the union shrinks as the span widens.`);
          }
          if (union > prefix[end + 1] - prefix[start]) {
            throw new Error(`${id} ${span}: the union exceeds the yearly losses added together.`);
          }
          if (union > district.knownForestCellsByStartYear[start]) {
            throw new Error(`${id} ${span}: the union exceeds the forest it is measured against.`);
          }
          index += 1;
        }
      }
      total += 1;
    }
  }
  if (total !== Object.values(DISTRICT_COUNTS).reduce((sum, count) => sum + count, 0)) {
    throw new Error(`The interval release holds ${total} districts.`);
  }
  return total;
}

/** Every file that carries the "use client" directive, with what each one imports. */
function clientModules(root) {
  const found = new Map();
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".git" || entry === ".vite") continue;
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const text = readFileSync(full, "utf8");
      if (/^[\t ]*["']use client["'];?/m.test(text)) found.set(path.relative(root, full), text);
    }
  };
  for (const directory of ["app", "components", "lib"]) walk(path.join(root, directory));
  return found;
}

/**
 * Confirms the interval table cannot reach a browser bundle.
 *
 * A client module reaches it either by importing it or by importing the barrel
 * that re-exports it. Both are checked, because closing only one of them leaves
 * the file one `export *` away from shipping.
 */
export function validateServerOnly(root) {
  const barrel = readFileSync(path.join(root, BARREL_PATH), "utf8");
  if (/riding-intervals/.test(barrel)) {
    throw new Error(
      `${BARREL_PATH} re-exports ${LOADER_PATH}. Every client module importing the barrel would then carry all 741 spans.`,
    );
  }
  const offenders = [];
  for (const [file, text] of clientModules(root)) {
    if (/from\s+["'][^"']*riding-intervals["']/.test(text) ||
      /from\s+["'][^"']*phase3-riding-interval-measurements\.json["']/.test(text)) {
      offenders.push(file);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`These client modules import the interval table directly: ${offenders.join(", ")}.`);
  }
}

async function main() {
  const release = JSON.parse(readFileSync(path.join(REPO_ROOT, RELEASE_PATH), "utf8"));
  const districts = validateIntervalRelease(release);
  validateServerOnly(REPO_ROOT);
  const bytes = statSync(path.join(REPO_ROOT, RELEASE_PATH)).size;
  console.log(
    `interval release: ${districts} districts, ${SPANS} spans each, ${(bytes / 1e6).toFixed(2)} MB, ` +
      `span order matches the reader, server-only import graph intact`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Interval release check failed: ${error.message}`);
    process.exit(1);
  });
}
