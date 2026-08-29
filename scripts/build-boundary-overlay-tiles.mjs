// Builds the two boundary-overlay tile archives the Explore map draws:
// federal ridings, and the four provincial riding sets that have verified terms.
//
// Every source is checksum-verified before it is read. A source whose bytes do
// not match its recorded checksum is a hard failure rather than a warning,
// because the licence evidence is bound to those exact bytes and would no
// longer describe what we published.
//
// District names are carried in the tiles rather than in any repository record.
// That is deliberate: 204 of the 343 federal names contain an em dash, which
// data/*.json reserves as the Unknown marker, and the names are statutory text
// that must not be altered to fit our conventions.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OUT_DIR = path.join(DATA_ROOT, "derived/boundary-overlays-v1");
const TOOLS = "/opt/homebrew/bin";

const SOURCES = [
  {
    id: "fed-2023-ridings",
    overlay: "federal-ridings",
    jurisdiction: "CA",
    // The owner-admitted transformation output, not a fresh download.
    input: path.join(
      DATA_ROOT,
      "derived/phase1/federal-electoral-districts-2023-v1",
      "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93",
      "phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg",
    ),
    sha256: "ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05",
    featureCount: 352,
    districtCount: 343,
    id_field: "FED_NUM",
    en_field: "ED_NAMEE",
    fr_field: "ED_NAMEF",
  },
  {
    id: "bc-provincial-electoral-districts-2023",
    overlay: "provincial-ridings",
    jurisdiction: "BC",
    input: path.join(DATA_ROOT, "staging/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson"),
    sha256: "d2403eeb488be4ef761f7dcbc72c25f8af3a046fce9980536307ba145993f193",
    featureCount: 93,
    districtCount: 93,
    id_field: "ELECTORAL_DISTRICT_ID",
    en_field: "ED_NAME",
    fr_field: null,
  },
  {
    id: "ontario-electoral-districts-2022",
    overlay: "provincial-ridings",
    jurisdiction: "ON",
    input: path.join(DATA_ROOT, "staging/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip"),
    vsi: "/vsizip/{input}/Electoral District Shapefile - 2022 General Election/ELECTORAL_DISTRICT.shp",
    sha256: "70fd809a4998147b228fd9275e34e569be8ae1fd67470e2f4a20761e5d1e7cae",
    featureCount: 124,
    districtCount: 124,
    id_field: "ED_ID",
    en_field: "ENGLISH_NA",
    fr_field: "FRENCH_NAM",
  },
  {
    id: "ab-electoral-divisions-2019",
    overlay: "provincial-ridings",
    jurisdiction: "AB",
    input: path.join(DATA_ROOT, "staging/ab-electoral-2019/EDS_ENACTED_BILL33_15DEC2017.shp"),
    sha256: "89d0393f8046fe9178f630012fbf4a68718e898f538523554e211fc8dae526a4",
    featureCount: 87,
    districtCount: 87,
    id_field: "EDNumber20",
    en_field: "EDName2017",
    fr_field: null,
  },
  {
    id: "qc-electoral-districts-2026",
    overlay: "provincial-ridings",
    jurisdiction: "QC",
    input: path.join(DATA_ROOT, "staging/qc-electoral-2026-sanseau/qc-electoral-districts-2026-sans-eau.geojson"),
    sha256: "dd164f0ad5ff7e9f5366f26696d78b9c562ceb88b3a5ad664c22a8e158843677",
    featureCount: 127,
    districtCount: 127,
    id_field: "CO_CEP",
    en_field: "NM_CEP",
    fr_field: "NM_CEP",
  },
];

const sha256File = (file) => {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
};

const run = (cmd, args) =>
  execFileSync(path.join(TOOLS, cmd), args, { encoding: "utf8", maxBuffer: 1 << 28 });

function verify(source) {
  if (!fs.existsSync(source.input)) throw new Error(`${source.id}: input missing at ${source.input}`);
  const actual = sha256File(source.input);
  if (actual !== source.sha256) {
    throw new Error(`${source.id}: checksum drift. recorded ${source.sha256}, found ${actual}`);
  }
  return actual;
}

// Reproject to WGS84 and normalize to one schema. Proper names are never
// translated, so a jurisdiction that publishes a single official name carries
// that same name in both locales rather than a fabricated translation.
function normalize(source, tmp) {
  const vsi = source.vsi ? source.vsi.replace("{input}", source.input) : source.input;
  const geo = path.join(tmp, `${source.id}.4326.geojsonl`);
  run("ogr2ogr", ["-t_srs", "EPSG:4326", "-f", "GeoJSONSeq", "-lco", "RS=NO", geo, vsi]);

  const out = [];
  let seen = 0;
  const ids = new Set();
  for (const line of fs.readFileSync(geo, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const props = feature.properties ?? {};
    const rawId = props[source.id_field];
    if (rawId === null || rawId === undefined) throw new Error(`${source.id}: feature without ${source.id_field}`);
    const en = props[source.en_field];
    const fr = source.fr_field ? props[source.fr_field] : en;
    if (!en) throw new Error(`${source.id}: feature ${rawId} has no name in ${source.en_field}`);
    seen += 1;
    ids.add(String(rawId));
    out.push(JSON.stringify({
      type: "Feature",
      properties: {
        id: `${source.jurisdiction}-${rawId}`,
        juris: source.jurisdiction,
        name_en: String(en),
        name_fr: String(fr ?? en),
      },
      geometry: feature.geometry,
    }));
  }
  if (seen !== source.featureCount) {
    throw new Error(`${source.id}: expected ${source.featureCount} features, read ${seen}`);
  }
  if (ids.size !== source.districtCount) {
    throw new Error(`${source.id}: expected ${source.districtCount} distinct districts, read ${ids.size}`);
  }
  return out;
}

function buildArchive(overlay, lines, tmp) {
  const layer = overlay.replaceAll("-", "_");
  const src = path.join(tmp, `${overlay}.geojsonl`);
  fs.writeFileSync(src, `${lines.join("\n")}\n`);
  const mbtiles = path.join(tmp, `${overlay}.mbtiles`);
  run("tippecanoe", [
    "-Z0", "-z10",
    "--simplification=10",
    // Keeps adjacent district edges aligned when simplifying, so the overlay
    // does not develop gaps between neighbours as you zoom out.
    "--detect-shared-borders",
    "--no-tile-size-limit",
    "--no-feature-limit",
    "--preserve-input-order",
    "-l", layer,
    "-o", mbtiles,
    src,
  ]);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pmtiles = path.join(OUT_DIR, `${overlay}-v1.pmtiles`);
  fs.rmSync(pmtiles, { force: true });
  run("pmtiles", ["convert", mbtiles, pmtiles]);
  return {
    overlay,
    layer,
    fileName: path.basename(pmtiles),
    path: pmtiles,
    featureCount: lines.length,
    byteLength: fs.statSync(pmtiles).size,
    sha256: sha256File(pmtiles),
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-overlays-"));
const byOverlay = new Map();
const sources = [];
for (const source of SOURCES) {
  const sha = verify(source);
  const lines = normalize(source, tmp);
  if (!byOverlay.has(source.overlay)) byOverlay.set(source.overlay, []);
  byOverlay.get(source.overlay).push(...lines);
  sources.push({
    id: source.id,
    overlay: source.overlay,
    jurisdiction: source.jurisdiction,
    sha256: sha,
    featureCount: source.featureCount,
    districtCount: source.districtCount,
  });
  process.stderr.write(`${source.id.padEnd(38)} ${String(source.featureCount).padStart(4)} features verified\n`);
}

const archives = [];
for (const [overlay, lines] of byOverlay) archives.push(buildArchive(overlay, lines, tmp));
fs.rmSync(tmp, { recursive: true, force: true });

const manifest = {
  schemaVersion: "witness-tree/boundary-overlay-tiles/1",
  productId: "boundary-overlays-v1",
  builtAt: new Date().toISOString(),
  sources,
  archives: archives.map((archive) => {
    const rest = { ...archive };
    // The local build path is machine specific and must not reach the manifest.
    delete rest.path;
    return rest;
  }),
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
