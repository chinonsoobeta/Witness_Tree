#!/usr/bin/env node
/**
 * Builds the census-subdivision layer for the Explore map: one PMTiles archive
 * of the 2,291 places in data/place-name-index.json, from the 2021 cartographic
 * census-subdivision file already extracted for the four provinces, and beside
 * it the places' span figures, one gzip-encoded file per province (written by
 * scripts/build-place-region-measurements.mjs).
 *
 * Reserves, settlements and treaty or agreement lands are not in the place
 * index, so they are not drawn: the owner withdrew that geography from the
 * record on 2026-09-26.
 *
 * It is its own product, not a rebuild of boundary-overlays-v4, so the four
 * published overlay archives, which evidence records bind by digest, are left
 * untouched. Settings match that build: zooms 0 to 10, simplified with shared
 * borders kept aligned.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const INPUT = path.join(DATA_ROOT, "derived/phase3-interval-place-zonal-v1/csd-four-province-2021.gpkg");
const FIGURES_DIR = path.join(DATA_ROOT, "derived/phase3-interval-place-zonal-v1/site");
const PROVINCES = ["BC", "AB", "ON", "QC"];
export const PRODUCT_ID = "census-subdivision-overlay-v1";
const OUT_DIR = path.join(DATA_ROOT, "derived", PRODUCT_ID);
const LAYER = "census_subdivisions";

const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"] });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (file) => sha256(readFileSync(file));

if (existsSync(OUT_DIR) && readdirSync(OUT_DIR).length > 0) {
  throw new Error(`immutable ${PRODUCT_ID} output directory is not empty: ${OUT_DIR}`);
}
const index = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/place-name-index.json"), "utf8"));
const published = new Map(index.places.map((place) => [place.id, place]));

const tmp = mkdtempSync(path.join(os.tmpdir(), "csd-overlay-"));
try {
  const raw = path.join(tmp, "csd.raw.geojsonl");
  run("ogr2ogr", ["-t_srs", "EPSG:4326", "-f", "GeoJSONSeq", "-lco", "RS=NO", raw, INPUT, "csd"]);
  const lines = [];
  for (const line of readFileSync(raw, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line);
    const id = String(feature.properties?.CSDUID ?? "");
    const place = published.get(id);
    if (!place) continue;
    lines.push(JSON.stringify({
      type: "Feature",
      properties: { id: `CA-${id}`, juris: "CA", name_en: place.name, name_fr: place.nameFr ?? place.name },
      geometry: feature.geometry,
    }));
  }
  if (lines.length !== published.size) throw new Error(`Expected ${published.size} places, drew ${lines.length}.`);
  const src = path.join(tmp, "csd.geojsonl");
  writeFileSync(src, `${lines.join("\n")}\n`);
  const mbtiles = path.join(tmp, "csd.mbtiles");
  run("tippecanoe", [
    "-t", tmp, "-Z0", "-z10",
    "--simplification=10", "--detect-shared-borders",
    "--no-tile-size-limit", "--no-feature-limit", "--preserve-input-order",
    "-l", LAYER, "-o", mbtiles, src,
  ]);
  mkdirSync(OUT_DIR, { recursive: true });
  const pmtiles = path.join(OUT_DIR, "census-subdivisions-v1.pmtiles");
  run("pmtiles", ["convert", mbtiles, pmtiles]);
  const figures = PROVINCES.map((province) => {
    const input = path.join(FIGURES_DIR, `census-subdivisions-${province}.json`);
    const json = readFileSync(input);
    const body = JSON.parse(json);
    if (body.province !== province || !Array.isArray(body.places)) throw new Error(`${input} is not the ${province} figure file.`);
    const fileName = `census-subdivisions-${province}.json`;
    // Served with Content-Encoding: gzip, so the stored bytes are the gzip
    // stream and the browser sees the JSON.
    const gzip = gzipSync(json, { level: 9 });
    writeFileSync(path.join(OUT_DIR, fileName), gzip);
    return {
      province,
      fileName,
      placeCount: body.places.length,
      jsonSha256: sha256(json),
      byteLength: gzip.length,
      sha256: sha256(gzip),
      contentEncoding: "gzip",
    };
  });
  const placeCount = figures.reduce((total, file) => total + file.placeCount, 0);
  if (placeCount !== lines.length) throw new Error(`The figure files hold ${placeCount} places and the tiles ${lines.length}.`);
  const manifest = {
    productId: PRODUCT_ID,
    source: { path: path.relative(DATA_ROOT, INPUT), sha256: sha256File(INPUT) },
    archive: { fileName: path.basename(pmtiles), layer: LAYER, featureCount: lines.length, byteLength: statSync(pmtiles).size, sha256: sha256File(pmtiles) },
    figures,
    zooms: [0, 10],
    note: "The 2,291 places of data/place-name-index.json. Reserves, settlements and treaty or agreement lands are neither drawn nor given figures.",
  };
  writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest.archive));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
