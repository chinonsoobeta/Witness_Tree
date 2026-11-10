#!/usr/bin/env node
/**
 * Each published place's detected loss for every annual step, 1985 to 2022,
 * for the year-by-year chart on its page.
 *
 * Input: derived/phase3-interval-place-zonal-v1/census-subdivisions-2021.json
 * on the data root, the census-subdivision aggregate that
 * scripts/build-place-region-measurements.mjs already reads for the
 * whole-record figures. It holds each subdivision's annual loss counts and,
 * for every span, the forest mapped at the span's start and the cells with no
 * satellite data, all counted in 30 m cells.
 *
 * The file is 128 MB, so it is read as a stream: one subdivision is parsed at a
 * time and dropped, and only the 2,291 places in data/place-name-index.json are
 * kept. Each is decoded by compactDistrict, the same function the riding
 * release uses, so a broken span stops the build, and the yearly series is
 * taken from its result as the riding pages take theirs. No count is changed;
 * the build also checks that each place's 1984-2022 figures equal the row
 * data/place-whole-record-measurements.json already holds.
 *
 * Output: data/place-yearly-measurements.json, with the source's and this
 * builder's SHA-256 and the build date.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compactDistrict } from "./build-phase3-interval-release.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const PRODUCT = "derived/phase3-interval-place-zonal-v1";
const SOURCE = `${PRODUCT}/census-subdivisions-2021.json`;
const SOURCE_PROVENANCE = `${PRODUCT}/census-subdivisions-2021.provenance.json`;
const BUILDER = "scripts/build-place-yearly-measurements.mjs";
const RELEASE = "data/place-yearly-measurements.json";
const STEPS = 38;
const SPANS = (STEPS * (STEPS + 1)) / 2;
const DISTRICTS_KEY = '"districts": [';

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => value === b[i]);

const index = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/place-name-index.json"), "utf8"));
const wholeRecord = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/place-whole-record-measurements.json"), "utf8"));
const sourceProvenance = JSON.parse(readFileSync(path.join(DATA_ROOT, SOURCE_PROVENANCE), "utf8"));
const published = new Set(index.places.map((place) => place.id));

/**
 * Streams the aggregate: the header (everything before the district list) is
 * parsed once, then each district object is cut out by brace depth, outside
 * strings, and handed to `onDistrict`.
 */
async function streamAggregate(file, onDistrict) {
  const hash = createHash("sha256");
  let bytes = 0;
  let header = null;
  let pending = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  let districts = 0;
  let maxPending = 0;
  let closed = false;
  for await (const chunk of createReadStream(file, { encoding: "utf8", highWaterMark: 1 << 20 })) {
    hash.update(chunk, "utf8");
    bytes += Buffer.byteLength(chunk, "utf8");
    let text = pending + chunk;
    // Resume after what was already scanned; the parser state carries over.
    let i = header === null ? 0 : pending.length;
    if (closed) continue;
    if (header === null) {
      const at = text.indexOf(DISTRICTS_KEY);
      if (at === -1) {
        pending = text;
        continue;
      }
      header = JSON.parse(`${text.slice(0, at)}"districts": []}`);
      i = at + DISTRICTS_KEY.length;
      start = -1;
    }
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "]" && depth === 0) {
        closed = true;
        break;
      } else if (c === "{") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          onDistrict(JSON.parse(text.slice(start, i + 1)));
          districts += 1;
          start = -1;
        }
      }
    }
    // Keep only the district still being read.
    pending = start === -1 ? "" : text.slice(start);
    if (start !== -1) start = 0;
    maxPending = Math.max(maxPending, pending.length);
    text = "";
  }
  if (header === null || !closed) throw new Error("The aggregate ended before its district list closed.");
  return { header, districts, bytes, maxPending, sha256: hash.digest("hex") };
}

const places = {};
const read = await streamAggregate(path.join(DATA_ROOT, SOURCE), (district) => {
  if (!published.has(district.boundaryId)) return;
  const compact = compactDistrict(district, 1984);
  const loss = compact.annualLossCells;
  const known = compact.knownForestCellsByStartYear;
  const unknown = compact.unknownCellsByStartYear;
  // The span denominators by opening year agree with the aggregate's annual
  // counts: the same known forest, and the annual Unknown plus the area's
  // unmapped cells, which the span counts include and the annual ones leave out.
  if (!sameArray(known, district.annualKnownCells)) throw new Error(`${district.boundaryId}: the known forest by opening year differs from the annual known counts.`);
  if (!sameArray(unknown, district.annualUnknownCells.map((cells) => cells + district.unmappedCells))) {
    throw new Error(`${district.boundaryId}: the Unknown by opening year is not the annual Unknown plus the unmapped cells.`);
  }
  loss.forEach((cells, step) => {
    if (cells > known[step]) throw new Error(`${district.boundaryId} ${1985 + step}: the loss exceeds the forest mapped at its start.`);
  });
  // The whole-record row, built from the same file, must be unchanged.
  const row = wholeRecord.places[district.boundaryId];
  const expected = [
    district.intervalUnionLossCells[STEPS - 1],
    district.intervalKnownCells[STEPS - 1],
    district.intervalUnknownCells[STEPS - 1],
    district.intervalSummedLossCells[STEPS - 1],
    district.unmappedCells,
  ];
  if (!sameArray(row, expected)) throw new Error(`${district.boundaryId}: the whole-record row does not match the aggregate.`);
  if (loss.reduce((sum, cells) => sum + cells, 0) !== row[3]) throw new Error(`${district.boundaryId}: the annual counts do not add up to the summed figure.`);
  places[district.boundaryId] = [loss, known, unknown];
});

const { header } = read;
if (header.firstYear !== 1984 || header.lastYear !== 2022 || header.intervalCount !== SPANS) {
  throw new Error("The census-subdivision aggregate does not cover the 741 spans of 1984 to 2022.");
}
if (read.districts !== 3033) throw new Error(`Expected 3,033 census subdivisions, read ${read.districts}.`);
if (read.sha256 !== sourceProvenance.outputSha256 || read.bytes !== sourceProvenance.outputByteLength) {
  throw new Error("The aggregate is not the file its provenance record describes.");
}
if (wholeRecord.builtFrom.sha256 !== read.sha256) throw new Error("The whole-record figures were built from a different aggregate.");
if (Object.keys(places).length !== published.size || published.size !== 2291) {
  throw new Error(`Expected 2,291 published places, built ${Object.keys(places).length}.`);
}

const sorted = Object.fromEntries(Object.keys(places).sort().map((id) => [id, places[id]]));
writeFileSync(path.join(REPO_ROOT, RELEASE), `${JSON.stringify({
  schema: "witness-tree/place-yearly-measurements/1",
  builtFrom: { path: SOURCE, sha256: read.sha256, byteLength: read.bytes, provenance: SOURCE_PROVENANCE },
  builtBy: { path: BUILDER, sha256: sha256(readFileSync(path.join(REPO_ROOT, BUILDER))) },
  builtOn: new Date().toISOString().slice(0, 10),
  boundaryEdition: header.boundaryEdition,
  methodVersion: header.methodVersion,
  cellHectares: header.cellHectares,
  firstYear: 1985,
  lastYear: 2022,
  annualStepCount: STEPS,
  fields: ["annualLossCells", "knownForestCellsByStartYear", "unknownCellsByStartYear"],
  claims: { admitted: false, released: false, productionEligible: false, externalAction: false },
  note: "One row per place in data/place-name-index.json. Each annual step is that year's detected loss against the forest mapped at its start; a cell lost in two years counts in both, so the years are never added into a total. Unmapped cells are in data/place-whole-record-measurements.json.",
  places: sorted,
})}\n`);
console.log(`places ${Object.keys(sorted).length}, districts read ${read.districts}, longest held text ${read.maxPending} chars, source ${read.sha256}`);
