import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FIXED_GPKG_TIMESTAMP, LAYER_NAME, writeBulkDownloadCandidate } from "../scripts/build-phase8-bulk-downloads.mjs";

const properties = {
  province_id: "24", province_name_en: "Quebec", province_name_fr: "Québec", period_start: 2020, period_end: 2022,
  coverage_grade: "complete", known_forested_hectares: 10, observed_loss_hectares: 2,
  observed_loss_outside_first_year_forest_hectares: 1, observed_loss_percent: 20,
  unknown_required_input_hectares: 0, boundary_edition: "fixture", method_version: "fixture-v1",
  source_boundary_sha256: "a".repeat(64), source_aggregate_sha256: "b".repeat(64), display_geometry_sha256: "c".repeat(64),
};
const selfIntersectingFixture = [{ properties, geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] } }];

test("bulk CSV and repaired GeoPackage are deterministic, aligned, valid, and CI-safe", () => {
  const firstRoot = mkdtempSync(join(tmpdir(), "witness-tree-bulk-test-first-"));
  const secondRoot = mkdtempSync(join(tmpdir(), "witness-tree-bulk-test-second-"));
  try {
  const first = writeBulkDownloadCandidate(selfIntersectingFixture, firstRoot);
  const second = writeBulkDownloadCandidate(selfIntersectingFixture, secondRoot);
  assert.deepEqual(readFileSync(first.csvPath), readFileSync(second.csvPath));
  assert.deepEqual(readFileSync(first.gpkgPath), readFileSync(second.gpkgPath));
  const csv = readFileSync(first.csvPath, "utf8");
  assert.equal(csv.trimEnd().split("\n").length, 2);
  assert.match(csv, /province_name_en,province_name_fr/);
  assert.match(csv, /Québec/);
  assert.deepEqual(first.geometryRows, [{ province_id: "24", valid: 1, empty: 0, geometry_type: "MULTIPOLYGON" }]);
  const info = JSON.parse(execFileSync("ogrinfo", ["-ro", "-json", "-so", first.gpkgPath, LAYER_NAME], { encoding: "utf8" }));
  assert.equal(info.layers[0].featureCount, 1);
  assert.equal(info.layers[0].fields.find(({ name }) => name === "unknown_required_input_hectares").type, "Real");
  const timestamp = JSON.parse(execFileSync("ogrinfo", ["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", `SELECT last_change FROM gpkg_contents WHERE table_name='${LAYER_NAME}'`, first.gpkgPath], { encoding: "utf8" })).layers[0].features[0].properties.last_change;
  assert.match(timestamp, /^2000(?:-|\/)01(?:-|\/)01[ T]00:00:00/);
  assert.equal(FIXED_GPKG_TIMESTAMP, "2000-01-01T00:00:00.000Z");
  } finally {
    rmSync(firstRoot, { recursive: true, force: true });
    rmSync(secondRoot, { recursive: true, force: true });
  }
});
