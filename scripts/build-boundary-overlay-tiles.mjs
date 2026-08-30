// Builds the boundary-overlay tile archives the Explore map draws: federal
// ridings, the four provincial riding sets, and admitted reference frameworks.
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
import { requireExactBilingualJoin, resolveBoundaryNames } from "./boundary-overlay-names.mjs";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OUT_DIR = path.join(DATA_ROOT, "derived/boundary-overlays-v2");
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
  {
    id: "statcan-economic-regions-2021",
    overlay: "economic-regions",
    jurisdiction: "CA",
    input: path.join(DATA_ROOT, "raw/statcan-economic-regions-2021/2026-08-29/ler_000a21s_e.geojson"),
    sha256: "b1bcb1305a04c6ddf9b74bdee545616a85ef6ff2e5622de343c34b122bdb08f7",
    french_input: path.join(DATA_ROOT, "raw/statcan-economic-regions-2021/2026-08-29/lre_000a21s_f.geojson"),
    french_sha256: "02449dd7bccfd6338b554821fd6fab8430cd1720d2b53b1ad8499746ae538c1b",
    featureCount: 76,
    districtCount: 76,
    id_field: "DGUID",
    en_field: "ERNAME",
    french_id_field: "IDUGD",
    french_field: "RÉNOM",
  },
  {
    id: "nrcan-wsc-sub-drainage-v6",
    overlay: "watersheds",
    jurisdiction: "CA",
    input: path.join(DATA_ROOT, "raw/nrcan-wsc-sub-drainage-v6/2026-08-29/canadwscsda_p_1m_v6-0_shp.zip"),
    outer_input: path.join(DATA_ROOT, "raw/nrcan-wsc-sub-drainage-v6/2026-08-29/canadwscsda_1m_v6-0_shp.zip"),
    outer_sha256: "9afc4f505cc7d86e20c1296b7695b6ccae94fd085ed94f7be3178811583d8213",
    outer_member: "canadwscsda_p_1m_v6-0_shp.zip",
    payload_byte_length: 23489341,
    vsi: "/vsizip/{input}/canadwscsda_p.shp",
    sha256: "0108bb97466e4fe43f59bbda27744e19d8a969bc8a40e9a20880d3ff9ca50fad",
    sourceFeatureCount: 184,
    featureCount: 169,
    districtCount: 169,
    where: "WSCSDA NOT LIKE 'U%'",
    excludedIdPrefix: "U",
    excludedFeatureCount: 15,
    id_field: "WSCSDA",
    en_field: "WSCSDA_EN",
    fr_field: "WSCSDA_FR",
  },
];

const sha256File = (file) => {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
};

const run = (cmd, args) =>
  execFileSync(path.join(TOOLS, cmd), args, { encoding: "utf8", maxBuffer: 1 << 28 });

function verifyOne(id, input, expected) {
  if (!fs.existsSync(input)) throw new Error(`${id}: input missing at ${input}`);
  const actual = sha256File(input);
  if (actual !== expected) {
    throw new Error(`${id}: checksum drift. recorded ${expected}, found ${actual}`);
  }
  return actual;
}

function verify(source) {
  const sha256 = verifyOne(source.id, source.input, source.sha256);
  const frenchSha256 = source.french_input
    ? verifyOne(`${source.id} French names`, source.french_input, source.french_sha256)
    : null;
  let outerSha256 = null;
  if (source.outer_input) {
    outerSha256 = verifyOne(`${source.id} outer archive`, source.outer_input, source.outer_sha256);
    const members = execFileSync("unzip", ["-Z1", source.outer_input], { encoding: "utf8" })
      .split("\n")
      .filter((member) => member === source.outer_member);
    if (members.length !== 1) {
      throw new Error(`${source.id}: expected outer archive member ${source.outer_member} exactly once, found ${members.length}`);
    }
    const payload = execFileSync("unzip", ["-p", source.outer_input, source.outer_member], { maxBuffer: 1 << 28 });
    const payloadSha256 = createHash("sha256").update(payload).digest("hex");
    if (payload.length !== source.payload_byte_length || payloadSha256 !== source.sha256) {
      throw new Error(`${source.id}: polygon payload does not match the governed extracted archive`);
    }
  }
  return { sha256, frenchSha256, outerSha256 };
}

function frenchNames(source) {
  if (!source.french_input) return null;
  const collection = JSON.parse(fs.readFileSync(source.french_input, "utf8"));
  if (collection?.type !== "FeatureCollection" || collection.features.length !== source.featureCount) {
    throw new Error(`${source.id}: French name source must contain ${source.featureCount} features`);
  }
  const names = new Map();
  for (const feature of collection.features) {
    const id = feature.properties?.[source.french_id_field];
    const name = feature.properties?.[source.french_field];
    if (id === null || id === undefined || !String(name ?? "").trim()) {
      throw new Error(`${source.id}: French name source has an incomplete identifier or name`);
    }
    if (names.has(String(id))) throw new Error(`${source.id}: duplicate French identifier ${id}`);
    names.set(String(id), String(name).trim());
  }
  if (names.size !== source.districtCount) {
    throw new Error(`${source.id}: expected ${source.districtCount} French identifiers, read ${names.size}`);
  }
  return names;
}

// Reproject to WGS84 and normalize to one schema. Proper names are never
// translated, so a jurisdiction that publishes a single official name carries
// that same name in both locales rather than a fabricated translation.
function normalize(source, tmp) {
  const vsi = source.vsi ? source.vsi.replace("{input}", source.input) : source.input;
  const translatedNames = frenchNames(source);
  if (source.sourceFeatureCount) profileRawSource(source, vsi, tmp);
  const geo = path.join(tmp, `${source.id}.4326.geojsonl`);
  run("ogr2ogr", [
    "-t_srs", "EPSG:4326", "-f", "GeoJSONSeq", "-lco", "RS=NO",
    ...(source.where ? ["-where", source.where] : []),
    geo, vsi,
  ]);

  const out = [];
  let seen = 0;
  const ids = new Set();
  for (const line of fs.readFileSync(geo, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const props = feature.properties ?? {};
    const rawId = props[source.id_field];
    if (rawId === null || rawId === undefined) throw new Error(`${source.id}: feature without ${source.id_field}`);
    const { en, fr } = resolveBoundaryNames(source, props, translatedNames, rawId);
    if (source.excludedIdPrefix && String(rawId).startsWith(source.excludedIdPrefix)) {
      throw new Error(`${source.id}: excluded identifier ${rawId} reached the Canadian overlay`);
    }
    seen += 1;
    ids.add(String(rawId));
    out.push(JSON.stringify({
      type: "Feature",
      properties: {
        id: `${source.jurisdiction}-${rawId}`,
        juris: source.jurisdiction,
        name_en: en,
        name_fr: fr,
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
  requireExactBilingualJoin(ids, translatedNames, source.id);
  return out;
}

function profileRawSource(source, vsi, tmp) {
  const raw = path.join(tmp, `${source.id}.raw.geojsonl`);
  run("ogr2ogr", ["-t_srs", "EPSG:4326", "-f", "GeoJSONSeq", "-lco", "RS=NO", raw, vsi]);
  const ids = new Set();
  let count = 0;
  let excluded = 0;
  for (const line of fs.readFileSync(raw, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const properties = feature.properties ?? {};
    const id = String(properties[source.id_field] ?? "").trim();
    const en = String(properties[source.en_field] ?? "").trim();
    const fr = String(properties[source.fr_field] ?? "").trim();
    if (!feature.geometry || !id || !en || !fr) {
      throw new Error(`${source.id}: raw source has missing geometry, identifier, or bilingual name`);
    }
    count += 1;
    ids.add(id);
    if (id.startsWith(source.excludedIdPrefix)) {
      excluded += 1;
      if (!en.startsWith("[USA:") || !fr.startsWith("[É.-U")) {
        throw new Error(`${source.id}: excluded identifier ${id} is not explicitly marked USA-only in both official names`);
      }
    }
  }
  if (count !== source.sourceFeatureCount || ids.size !== source.sourceFeatureCount) {
    throw new Error(`${source.id}: expected ${source.sourceFeatureCount} raw features and identifiers, read ${count}/${ids.size}`);
  }
  if (excluded !== source.excludedFeatureCount) {
    throw new Error(`${source.id}: expected ${source.excludedFeatureCount} USA-only features, read ${excluded}`);
  }
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
  const pmtiles = path.join(OUT_DIR, `${overlay}-v2.pmtiles`);
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
  const verified = verify(source);
  const lines = normalize(source, tmp);
  if (!byOverlay.has(source.overlay)) byOverlay.set(source.overlay, []);
  byOverlay.get(source.overlay).push(...lines);
  sources.push({
    id: source.id,
    overlay: source.overlay,
    jurisdiction: source.jurisdiction,
    sha256: verified.sha256,
    ...(verified.frenchSha256 ? { frenchSha256: verified.frenchSha256 } : {}),
    ...(verified.outerSha256 ? {
      outerSha256: verified.outerSha256,
      outerMember: source.outer_member,
      outerMemberByteLength: source.payload_byte_length,
    } : {}),
    featureCount: source.featureCount,
    districtCount: source.districtCount,
    ...(source.sourceFeatureCount ? { sourceFeatureCount: source.sourceFeatureCount } : {}),
    ...(source.where ? { selection: source.where } : {}),
  });
  process.stderr.write(`${source.id.padEnd(38)} ${String(source.featureCount).padStart(4)} features verified\n`);
}

const archives = [];
for (const [overlay, lines] of byOverlay) archives.push(buildArchive(overlay, lines, tmp));
fs.rmSync(tmp, { recursive: true, force: true });

const manifest = {
  schemaVersion: "witness-tree/boundary-overlay-tiles/1",
  productId: "boundary-overlays-v2",
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
