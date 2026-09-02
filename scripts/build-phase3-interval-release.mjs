#!/usr/bin/env node
/**
 * Turns the five interval aggregates on the data root into the one file the
 * site reads.
 *
 * The aggregates hold 741 spans a district, four numbers each, which is 2.3 GB
 * of JSON across the four provinces and the federal map. The site cannot carry
 * that and does not need to: three of the four numbers are not independent.
 *
 *   known and unknown depend only on the span's opening year. The denominator
 *   is the forest present when the span begins, and a cell whose record goes
 *   dark inside the span would make the denominator shrink as the span widens.
 *   In this run no cell does, so 741 numbers collapse to 38. That collapse is a
 *   measured property of this data, not a law, so it is verified for every
 *   district and the build stops rather than assume it.
 *
 *   the sum is the annual counts added up, so 741 numbers collapse to 38 and
 *   the site adds them back. It is emitted as annual counts precisely so that
 *   nothing downstream can mistake it for an area of ground.
 *
 *   the union does not collapse. A cell lost twice is one cell in the span and
 *   two in the sum, and no smaller set of numbers recovers that. It is written
 *   as first differences along the closing year, which are small because the
 *   union can only grow as a span widens, and which compress accordingly.
 *
 * Every invariant the aggregate promised is re-checked here against the bytes
 * that will actually ship, not against the bytes that were computed. A release
 * step that trusts its input is a release step that cannot catch a truncated
 * copy.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASE_PATH = "data/phase3-riding-interval-measurements.json";
export const RELEASE_SCHEMA = "witness-tree/phase3-riding-interval-measurements/1";
export const SOURCE_SCHEMA = "witness-tree/phase3-interval-zonal/1";
const PRODUCT_DIRECTORY = "derived/phase3-interval-riding-zonal-v1";

/** The five sources, and the district count each one must have. */
export const SOURCES = Object.freeze([
  { slug: "federal-ridings-2023", jurisdiction: "CA", overlay: "federal-2023", districts: 343 },
  { slug: "bc-provincial-ridings-2023", jurisdiction: "BC", overlay: "bc-2023", districts: 93 },
  { slug: "ab-provincial-ridings-2019", jurisdiction: "AB", overlay: "ab-2019", districts: 87 },
  { slug: "on-provincial-ridings-2022", jurisdiction: "ON", overlay: "on-2022", districts: 124 },
  { slug: "qc-provincial-ridings-2026", jurisdiction: "QC", overlay: "qc-2022", districts: 127 },
]);

const STEPS = 38;
const SPANS = (STEPS * (STEPS + 1)) / 2;

const fail = (message) => {
  console.error(`Interval release build stopped: ${message}`);
  process.exit(1);
};

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The producer's span order, rebuilt so the build can name the span it rejects. */
function spanOrder() {
  const order = [];
  for (let start = 0; start < STEPS; start += 1) {
    for (let end = start; end < STEPS; end += 1) order.push({ start, end });
  }
  return order;
}

const ORDER = spanOrder();

/**
 * Collapse and check one district.
 *
 * Returns the district's compact record, or throws with the exact span that
 * broke. Every rejection names a district and a span, because a message that
 * only says the shape was wrong sends the reader back to 573,000 numbers.
 */
export function compactDistrict(district, firstYear) {
  const { boundaryId, intervalKnownCells: known, intervalUnionLossCells: union } = district;
  const unknown = district.intervalUnknownCells;
  const summed = district.intervalSummedLossCells;
  const annual = district.annualLossCells;
  for (const [label, array, length] of [
    ["intervalKnownCells", known, SPANS],
    ["intervalUnionLossCells", union, SPANS],
    ["intervalUnknownCells", unknown, SPANS],
    ["intervalSummedLossCells", summed, SPANS],
    ["annualLossCells", annual, STEPS],
  ]) {
    if (!Array.isArray(array) || array.length !== length) {
      throw new Error(`${boundaryId} ${label} must hold ${length} numbers`);
    }
  }

  const knownByStart = new Array(STEPS).fill(null);
  const unknownByStart = new Array(STEPS).fill(null);
  const unionDeltas = new Array(SPANS).fill(0);
  const runningSum = [0];
  for (let index = 0; index < STEPS; index += 1) runningSum.push(runningSum[index] + annual[index]);

  let previousUnion = 0;
  for (let index = 0; index < SPANS; index += 1) {
    const { start, end } = ORDER[index];
    if (end === start) previousUnion = 0;
    const span = `${firstYear + start} to ${firstYear + end + 1}`;

    if (knownByStart[start] === null) knownByStart[start] = known[index];
    else if (knownByStart[start] !== known[index]) {
      throw new Error(
        `${boundaryId} ${span}: the known denominator changes as the span widens ` +
          `(${knownByStart[start]} then ${known[index]}), so it cannot be stored by opening year`,
      );
    }
    if (unknownByStart[start] === null) unknownByStart[start] = unknown[index];
    else if (unknownByStart[start] !== unknown[index]) {
      throw new Error(`${boundaryId} ${span}: Unknown changes as the span widens, so it cannot be stored by opening year`);
    }

    if (union[index] < previousUnion) {
      throw new Error(`${boundaryId} ${span}: the union shrank as the span widened, which cannot happen`);
    }
    if (union[index] > known[index]) {
      throw new Error(`${boundaryId} ${span}: the union exceeds the forest it is measured against`);
    }
    const expectedSum = runningSum[end + 1] - runningSum[start];
    if (summed[index] !== expectedSum) {
      throw new Error(`${boundaryId} ${span}: the summed figure is not the annual counts added up`);
    }
    if (union[index] > summed[index]) {
      throw new Error(`${boundaryId} ${span}: the union exceeds the sum, so a cell was counted fewer times than once`);
    }
    unionDeltas[index] = union[index] - previousUnion;
    previousUnion = union[index];
  }

  return {
    boundaryId,
    boundaryName: district.boundaryName ?? null,
    unmappedCells: district.unmappedCells,
    annualLossCells: annual,
    knownForestCellsByStartYear: knownByStart,
    unknownCellsByStartYear: unknownByStart,
    unionLossCellDeltas: unionDeltas,
  };
}

function main() {
  const dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  const jurisdictions = [];
  const inputs = [];
  let cellHectares = null;
  let firstYear = null;
  let lastYear = null;

  for (const source of SOURCES) {
    const file = path.join(dataRoot, PRODUCT_DIRECTORY, `${source.slug}.json`);
    const marker = path.join(dataRoot, PRODUCT_DIRECTORY, `${source.slug}.complete.sha256`);
    try {
      statSync(marker);
    } catch {
      fail(`${source.slug} has no completion marker; a half-written aggregate is not a smaller aggregate`);
    }
    const product = JSON.parse(readFileSync(file, "utf8"));
    if (product.schema !== SOURCE_SCHEMA) fail(`${source.slug} is not a ${SOURCE_SCHEMA} product`);
    if (product.jurisdiction !== source.jurisdiction) fail(`${source.slug} is ${product.jurisdiction}, expected ${source.jurisdiction}`);
    if (product.productionClaim !== false || product.admissionStatus !== "not-admitted") {
      fail(`${source.slug} carries a production or admission claim this release does not accept`);
    }
    if (product.summedPercentAllowed !== false || product.netChangeIncluded !== false) {
      fail(`${source.slug} does not carry the vocabulary decision this release depends on`);
    }
    if (product.intervalCount !== SPANS) fail(`${source.slug} holds ${product.intervalCount} spans, expected ${SPANS}`);
    if (product.districts.length !== source.districts) {
      fail(`${source.slug} holds ${product.districts.length} districts, expected ${source.districts}`);
    }
    if (cellHectares === null) {
      cellHectares = product.cellHectares;
      firstYear = product.firstYear;
      lastYear = product.lastYear;
    } else if (product.cellHectares !== cellHectares || product.firstYear !== firstYear || product.lastYear !== lastYear) {
      fail(`${source.slug} was computed on a different grid or a different range than the others`);
    }
    // The producer writes its own span order. Reading it back rather than
    // assuming it means a producer that changes order breaks loudly here.
    product.intervalOrder.forEach((span, index) => {
      const expected = { fromYear: firstYear + ORDER[index].start, toYear: firstYear + ORDER[index].end + 1 };
      if (span.fromYear !== expected.fromYear || span.toYear !== expected.toYear) {
        fail(`${source.slug} span ${index} is ${span.fromYear}-${span.toYear}, expected ${expected.fromYear}-${expected.toYear}`);
      }
    });

    const districts = [];
    for (const district of product.districts) {
      try {
        districts.push(compactDistrict(district, firstYear));
      } catch (error) {
        fail(`${source.slug}: ${error.message}`);
      }
    }
    districts.sort((left, right) => (left.boundaryId < right.boundaryId ? -1 : left.boundaryId > right.boundaryId ? 1 : 0));
    jurisdictions.push({
      jurisdiction: source.jurisdiction,
      overlay: source.overlay,
      boundaryEdition: product.boundaryEdition,
      methodVersion: product.methodVersion,
      districts,
    });
    inputs.push({ slug: source.slug, path: file, byteLength: statSync(file).size, sha256: sha256(file) });
  }

  const release = {
    schema: RELEASE_SCHEMA,
    builtFrom: PRODUCT_DIRECTORY,
    cellHectares,
    firstYear,
    lastYear,
    annualStepCount: STEPS,
    spanCount: SPANS,
    encoding: {
      unionLossCellDeltas:
        "first differences along the closing year, restarting at each opening year; add them up to recover the union",
      knownForestCellsByStartYear: "one number per opening year; the denominator does not move as the span widens",
      unknownCellsByStartYear: "one number per opening year, on the same grounds",
      summedLoss: "not stored; add annualLossCells across the span. It has no denominator and never carries a percentage.",
    },
    unionTerm: "Forest lost at least once",
    summedTerm: "Yearly losses added together",
    summedPercentAllowed: false,
    netChangeIncluded: false,
    claims: { admitted: false, released: false, productionEligible: false, externalAction: false },
    inputs,
    jurisdictions,
  };
  const serialized = `${JSON.stringify(release)}\n`;
  writeFileSync(path.join(REPO_ROOT, RELEASE_PATH), serialized);
  const districts = jurisdictions.reduce((total, row) => total + row.districts.length, 0);
  console.log(
    `wrote ${RELEASE_PATH}: ${districts} districts across ${jurisdictions.length} boundary sets, ` +
      `${SPANS} spans each, ${(serialized.length / 1e6).toFixed(2)} MB`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
