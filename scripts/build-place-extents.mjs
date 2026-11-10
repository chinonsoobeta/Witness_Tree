#!/usr/bin/env node
/**
 * Records the bounding box of every place page's boundary, so the page can
 * frame its small map and link to the same view on Explore.
 *
 * Inputs: the boundary files the place figures and the map's outline tiles are
 * already built from, each checked against the checksum the existing builders
 * record (scripts/build-boundary-overlay-tiles.mjs for ridings and economic
 * regions; the census-subdivision geometry the community figures were measured
 * on, read by scripts/build-census-subdivision-overlay-tiles.mjs, has no
 * recorded checksum, so its checksum is recorded here). Nothing is measured:
 * the box is the smallest longitude-latitude rectangle holding the published
 * geometry, rounded outward to four decimals (about 10 m).
 *
 * Output: data/place-extents.json, one [west, south, east, north] box per page
 * key (`<geography>/<code>`), with each source's path and SHA-256, this
 * script's SHA-256 and the date it ran.
 *
 * Bounded: GDAL computes each feature's box and streams one CSV row per
 * feature; only the boxes are kept here.
 * Run it as one process: `node scripts/build-place-extents.mjs`.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OGR2OGR = "/opt/homebrew/bin/ogr2ogr";
const OUTPUT = "data/place-extents.json";
const FEDERAL_PREFIXES = ["59", "48", "35", "24"];
const PROVINCIAL_GEOGRAPHY = { BC: "bc-2023", AB: "ab-2019", ON: "on-2022", QC: "qc-2026" };

const SOURCES = [
  {
    geography: "csd-2021",
    path: "derived/phase3-interval-place-zonal-v1/csd-four-province-2021.gpkg",
    sha256: null,
    layer: "csd",
    geometry: "geom",
    idField: "CSDUID",
    code: (id) => id,
  },
  {
    geography: "er-2021",
    path: "raw/statcan-economic-regions-2021/2026-08-29/ler_000a21s_e.geojson",
    sha256: "b1bcb1305a04c6ddf9b74bdee545616a85ef6ff2e5622de343c34b122bdb08f7",
    layer: "ler_000a21s_e",
    where: "PRUID IN ('24','35','48','59')",
    idField: "DGUID",
    code: (id) => id.slice(-4),
  },
  {
    geography: "federal-2023",
    path: "derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg",
    sha256: "ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05",
    layer: "federal_electoral_districts_2023",
    geometry: "geom",
    idField: "FED_NUM",
    code: (id) => id,
  },
  {
    geography: PROVINCIAL_GEOGRAPHY.BC,
    path: "staging/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson",
    sha256: "d2403eeb488be4ef761f7dcbc72c25f8af3a046fce9980536307ba145993f193",
    layer: "bc-provincial-electoral-districts-2023",
    idField: "ELECTORAL_DISTRICT_ID",
    code: (id) => id,
  },
  {
    geography: PROVINCIAL_GEOGRAPHY.AB,
    path: "raw/alberta-provincial-electoral-divisions-2019/2026-09-18/provincial-electoral-division-current-2019.geojson",
    sha256: "2c3772181068395df9d4397c143bc6880f8474cd589502a0dfa915adb008dd07",
    layer: "provincial-electoral-division-current-2019",
    idField: "EDNUMBER",
    code: (id) => id,
  },
  {
    geography: PROVINCIAL_GEOGRAPHY.ON,
    path: "staging/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip",
    vsi: "Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp",
    sha256: "70fd809a4998147b228fd9275e34e569be8ae1fd67470e2f4a20761e5d1e7cae",
    layer: "ELECTORAL_DISTRICT",
    // Its projection has no EPSG code, which the SQL transform needs, so GDAL
    // reprojects whole features instead; the file is small.
    wholeFeatures: true,
    idField: "ED_ID",
    code: (id) => id,
  },
  {
    geography: PROVINCIAL_GEOGRAPHY.QC,
    path: "staging/qc-electoral-2026/qc-electoral-2026.geojson",
    sha256: "5c22379acdffc6138eb77a5aaec265d7c301cffd04eb4c0bafede68ed8651503",
    layer: "qc-electoral-2026",
    idField: "CO_CEP",
    code: (id) => id,
  },
];

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
});

// Every page the site builds, by the same records lib/place-pages reads.
function pageKeys() {
  const read = (file) => JSON.parse(readFileSync(path.join(REPO_ROOT, file), "utf8"));
  const keys = new Set(read("data/place-name-index.json").places.map((place) => `csd-2021/${place.id}`));
  for (const region of read("data/phase3-economic-region-interval-measurements.json").regions) keys.add(`er-2021/${region.boundaryId.slice(-4)}`);
  for (const jurisdiction of read("data/phase3-riding-interval-measurements.json").jurisdictions) {
    const geography = jurisdiction.jurisdiction === "CA" ? "federal-2023" : PROVINCIAL_GEOGRAPHY[jurisdiction.jurisdiction];
    for (const district of jurisdiction.districts) {
      // Federal ridings outside the four provinces have no page (lib/place-pages).
      if (geography === "federal-2023" && !FEDERAL_PREFIXES.some((prefix) => String(district.boundaryId).startsWith(prefix))) continue;
      keys.add(`${geography}/${district.boundaryId}`);
    }
  }
  return keys;
}

function extendBox(box, coordinates) {
  if (typeof coordinates[0] === "number") {
    const [x, y] = coordinates;
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
    return box;
  }
  for (const part of coordinates) extendBox(box, part);
  return box;
}

/*
 * GDAL reprojects every vertex and reports each feature's box, so only one row
 * of five numbers per feature crosses into this process. Reading whole features
 * as GeoJSON instead held the census-subdivision file at 3.4 GB in GDAL; this
 * query holds it near 130 MB.
 *
 * One [id, west, south, east, north] row per feature.
 */
function gdalRows(source, dataset) {
  if (source.wholeFeatures) {
    const child = spawn(OGR2OGR, ["-t_srs", "EPSG:4326", "-f", "GeoJSONSeq", "-lco", "RS=NO", "-select", source.idField, "/vsistdout/", dataset, source.layer], { stdio: ["ignore", "pipe", "inherit"] });
    return { child, toRow: (line) => {
      const feature = JSON.parse(line);
      const box = extendBox([Infinity, Infinity, -Infinity, -Infinity], feature.geometry.coordinates);
      return [String(feature.properties[source.idField] ?? ""), ...box];
    } };
  }
  const geometry = source.geometry ?? "GEOMETRY";
  const sql = `SELECT id, ST_MinX(t) AS w, ST_MinY(t) AS s, ST_MaxX(t) AS e, ST_MaxY(t) AS n FROM (SELECT CAST("${source.idField}" AS TEXT) AS id, ST_Transform("${geometry}", 4326) AS t FROM "${source.layer}"${source.where ? ` WHERE ${source.where}` : ""})`;
  const child = spawn(OGR2OGR, ["-f", "CSV", "/vsistdout/", dataset, "-dialect", "SQLite", "-sql", sql], { stdio: ["ignore", "pipe", "inherit"] });
  let header = true;
  return { child, toRow: (line) => {
    if (header) {
      if (line !== "id,w,s,e,n") throw new Error(`${source.path}: unexpected header ${line}`);
      header = false;
      return null;
    }
    const [id, ...numbers] = line.split(",");
    return [id.replace(/^"|"$/g, ""), ...numbers.map(Number)];
  } };
}

async function readSource(source, wanted, boxes) {
  const input = path.join(DATA_ROOT, source.path);
  const sha256 = await sha256File(input);
  if (source.sha256 !== null && sha256 !== source.sha256) throw new Error(`${source.path}: recorded ${source.sha256}, found ${sha256}`);
  const dataset = source.vsi ? `/vsizip/${input}/${source.vsi}` : input;
  const { child, toRow } = gdalRows(source, dataset);
  const exited = new Promise((resolve, reject) => child.on("error", reject).on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ogr2ogr exited ${code} on ${source.path}`)))));
  let features = 0;
  let kept = 0;
  for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const row = toRow(line);
    if (row === null) continue;
    const [id, ...box] = row;
    if (!id) throw new Error(`${source.path}: a feature has no ${source.idField}`);
    features += 1;
    const key = `${source.geography}/${source.code(id)}`;
    if (!wanted.has(key)) continue;
    const [west, south, east, north] = box;
    if (!box.every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) {
      throw new Error(`${key}: bad box ${line}`);
    }
    kept += 1;
    // A district drawn as several features gets the box of all of them.
    const previous = boxes.get(key);
    boxes.set(key, previous
      ? [Math.min(previous[0], west), Math.min(previous[1], south), Math.max(previous[2], east), Math.max(previous[3], north)]
      : box);
  }
  await exited;
  return { geography: source.geography, path: source.path, sha256, idField: source.idField, features, featuresUsed: kept };
}

const outward = (value, direction) => Number((Math[direction](value * 1e4) / 1e4).toFixed(4));

const wanted = pageKeys();
const boxes = new Map();
const sources = [];
for (const source of SOURCES) sources.push(await readSource(source, wanted, boxes));
const missing = [...wanted].filter((key) => !boxes.has(key));
if (missing.length) throw new Error(`${missing.length} pages have no boundary, first ${missing.slice(0, 5).join(", ")}`);

const extents = Object.fromEntries([...wanted].sort().map((key) => {
  const [west, south, east, north] = boxes.get(key);
  return [key, [outward(west, "floor"), outward(south, "floor"), outward(east, "ceil"), outward(north, "ceil")]];
}));
const record = {
  schema: "witness-tree/place-extents/1",
  builtBy: { path: path.relative(REPO_ROOT, SCRIPT), sha256: await sha256File(SCRIPT) },
  builtOn: new Date().toISOString().slice(0, 10),
  crs: "EPSG:4326",
  order: ["west", "south", "east", "north"],
  rounding: "outward to 4 decimal places",
  claims: { measurement: false, admitted: false, released: false, productionEligible: false, externalAction: false },
  note: "The smallest longitude-latitude box holding each place page's published boundary, for framing its map. Not a measurement and not an area.",
  sources,
  places: Object.keys(extents).length,
  extents,
};
writeFileSync(path.join(REPO_ROOT, OUTPUT), `${JSON.stringify(record, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, "[$1, $2, $3, $4]")}\n`);
console.log(`Wrote ${OUTPUT}: ${record.places} places from ${sources.length} sources; peak RSS ${Math.round(process.resourceUsage().maxRSS / 1024)} MB.`);
