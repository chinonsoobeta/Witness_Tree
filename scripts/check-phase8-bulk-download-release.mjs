#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPhase8BulkDownloads, FIXED_GPKG_TIMESTAMP, LAYER_NAME } from "./build-phase8-bulk-downloads.mjs";
import { preparePhase8BulkDownloadPublicManifest } from "./prepare-phase8-bulk-download-public-manifest.mjs";

export const RELEASE_ID = "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
export const CSV_SHA256 = "a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd";
export const GPKG_SHA256 = "d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a";
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

export function checkPhase8BulkDownloadRelease({ dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data" } = {}) {
  const generated = buildPhase8BulkDownloads({ dataRoot, verifyOnly: true });
  const { manifest } = generated;
  assert.equal(manifest.releaseId, RELEASE_ID);
  assert.equal(manifest.outputs.csv.sha256, CSV_SHA256);
  assert.equal(manifest.outputs.geopackage.sha256, GPKG_SHA256);
  assert.equal(manifest.geometryTransform.operation, "OGR -makevalid with PROMOTE_TO_MULTI");
  assert.equal(manifest.geometryTransform.allOutputGeometriesValid, true);
  assert.equal(manifest.geometryTransform.allOutputGeometriesNonEmpty, true);
  assert.deepEqual(manifest.scope.provinceIds, ["24", "35", "48", "59"]);
  assert.equal(manifest.claims.phase2ProductionGateComplete, false);
  assert.equal(manifest.inputs.admissionRecord.sha256, "58147c088d12190f8882d0c493364cd07cf7c176d4fafbc266421bf337ca7d82");
  assert.equal(manifest.inputs.zonalEvidence.sidecarSha256, "20894a732a762fdbfd618e35f2b8934028727e6207ac9846732d9899e501c50c");
  assert.equal(manifest.inputs.displayGeometryManifest.sha256, "47d4c6aad0400810e6233d83b53b560df9056e8168ed2b1e4c566d425e5969e4");
  assert.ok(manifest.sources.every(({ publisher, datasetTitle, catalogueUrl, sourceUrl, retrievedAt }) => publisher && datasetTitle && /^https:\/\//.test(catalogueUrl) && /^https:\/\//.test(sourceUrl) && /^\d{4}-\d{2}-\d{2}T/.test(retrievedAt)));
  assert.ok(manifest.licences.every(({ name, version, url, publisher, redistributionStatus, requiredAttribution }) => name && version && /^https:\/\//.test(url) && publisher && redistributionStatus && requiredAttribution));
  const csvPath = join(generated.outputDir, manifest.outputs.csv.fileName);
  const gpkgPath = join(generated.outputDir, manifest.outputs.geopackage.fileName);
  assert.equal(statSync(csvPath).size, manifest.outputs.csv.byteLength);
  assert.equal(statSync(gpkgPath).size, manifest.outputs.geopackage.byteLength);
  assert.equal(sha256(csvPath), CSV_SHA256);
  assert.equal(sha256(gpkgPath), GPKG_SHA256);
  const csv = readFileSync(csvPath, "utf8");
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "province_id,province_name_en,province_name_fr,period_start,period_end,coverage_grade,known_forested_hectares,observed_loss_hectares,observed_loss_outside_first_year_forest_hectares,observed_loss_percent,unknown_required_input_hectares,boundary_edition,method_version,source_boundary_sha256,source_aggregate_sha256,display_geometry_sha256");
  assert.ok(!/(?:unknown|inconnu)\s*(?:value|valeur)?\s*0\b/i.test(csv));
  const qa = JSON.parse(execFileSync("ogrinfo", ["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", `SELECT province_id, ST_IsValid(geom) AS valid, ST_IsEmpty(geom) AS empty, ST_GeometryType(geom) AS geometry_type FROM ${LAYER_NAME} ORDER BY province_id`, gpkgPath], { encoding: "utf8" }));
  const rows = qa.layers[0].features.map(({ properties }) => properties);
  assert.deepEqual(rows.map(({ province_id }) => province_id), ["24", "35", "48", "59"]);
  assert.ok(rows.every(({ valid, empty, geometry_type: type }) => valid === 1 && empty === 0 && type === "MULTIPOLYGON"));
  const layer = JSON.parse(execFileSync("ogrinfo", ["-ro", "-json", "-features", "-geom=NO", gpkgPath, LAYER_NAME], { encoding: "utf8" })).layers[0];
  assert.equal(layer.fields.find(({ name }) => name === "unknown_required_input_hectares").type, "Real");
  const headers = lines[0].split(",");
  const csvRows = lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
  const gpkgRows = layer.features.map(({ properties }) => properties).sort((a, b) => a.province_id.localeCompare(b.province_id));
  for (let index = 0; index < csvRows.length; index += 1) for (const header of headers) assert.equal(String(gpkgRows[index][header]), csvRows[index][header], `CSV/GeoPackage drift for ${gpkgRows[index].province_id}.${header}`);
  assert.equal(execFileSync("sqlite3", [gpkgPath, "PRAGMA integrity_check;"], { encoding: "utf8" }).trim(), "ok");
  assert.equal(execFileSync("sqlite3", [gpkgPath, `SELECT last_change FROM gpkg_contents WHERE table_name='${LAYER_NAME}';`], { encoding: "utf8" }).trim(), FIXED_GPKG_TIMESTAMP);
  const publicManifest = preparePhase8BulkDownloadPublicManifest({ dataRoot });
  assert.equal(publicManifest.sha256, "0d43fd90f3f8c522e2885922f838e56b6c28fe4e2d1f8f2ab72a15a0a209789d");
  assert.equal(publicManifest.document.authorization.status, "owner-authorized-bounded-public-release");
  return { releaseId: RELEASE_ID, csv: { path: csvPath, sha256: CSV_SHA256 }, geopackage: { path: gpkgPath, sha256: GPKG_SHA256 }, publicManifest: { path: publicManifest.outputPath, sha256: publicManifest.sha256 }, featureCount: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = process.argv.indexOf("--data-root");
  if (process.argv.some((value, offset) => offset > 1 && value !== "--data-root" && offset !== index + 1)) throw new Error("Usage: check-phase8-bulk-download-release.mjs [--data-root PATH]");
  const result = checkPhase8BulkDownloadRelease({ dataRoot: index === -1 ? undefined : process.argv[index + 1] });
  console.log(`Phase 8 local bulk release verified: ${result.releaseId}; ${result.featureCount} valid province features; deterministic CSV and GeoPackage regeneration matched.`);
}
