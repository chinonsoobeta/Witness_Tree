import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const BOUNDARY = join(DATA_ROOT, "raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip");
const AGGREGATE = join(DATA_ROOT, "derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.json");
const OUT_ROOT = join(DATA_ROOT, "derived/phase8-province-map-release-v1");
const EXPECTED = {
  boundary: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
  aggregate: "ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d",
};
const PROVINCES = new Set(["24", "35", "48", "59"]);
const LAYER = "phase2_province_loss_2020_2022";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

assert.equal(sha256(BOUNDARY), EXPECTED.boundary, "boundary checksum changed");
assert.equal(sha256(AGGREGATE), EXPECTED.aggregate, "aggregate checksum changed");

const rows = JSON.parse(readFileSync(AGGREGATE, "utf8"));
const byId = new Map(rows.filter((row) => PROVINCES.has(row.boundaryId)).map((row) => [row.boundaryId, row]));
assert.equal(byId.size, 4, "expected four admitted aggregate rows");

const work = mkdtempSync(join(tmpdir(), "witness-tree-map-release-"));
try {
  const boundariesPath = join(work, "boundaries.geojson");
  const joinedPath = join(work, "phase2-province-loss.geojson");
  const archivePath = join(work, "phase2-province-loss-2020-2022.pmtiles");

  run("ogr2ogr", [
    "-f", "GeoJSON", boundariesPath, `/vsizip/${BOUNDARY}`, "lpr_000b21a_e",
    "-where", "PRUID IN ('24','35','48','59')", "-t_srs", "EPSG:4326",
    "-simplify", "1000", "-select", "PRUID,PRENAME,PRFNAME,PREABBR,PRFABBR",
  ]);
  const boundaries = JSON.parse(readFileSync(boundariesPath, "utf8"));
  assert.equal(boundaries.features.length, 4, "expected four province geometries");
  boundaries.name = LAYER;
  boundaries.features = boundaries.features
    .map((feature) => {
      const row = byId.get(feature.properties.PRUID);
      assert.ok(row, `missing aggregate for ${feature.properties.PRUID}`);
      return {
        type: "Feature",
        id: feature.properties.PRUID,
        properties: {
          province_id: feature.properties.PRUID,
          province_name_en: feature.properties.PRENAME,
          province_name_fr: feature.properties.PRFNAME,
          province_abbr_en: feature.properties.PREABBR,
          province_abbr_fr: feature.properties.PRFABBR,
          period_start: 2020,
          period_end: 2022,
          coverage_grade: row.coverageGrade,
          known_forested_hectares: row.knownForestedHectares,
          observed_loss_hectares: row.lossHectares,
          observed_loss_percent: row.observedLossPercent,
          observed_loss_outside_first_year_forest_hectares: row.observedLossOutsideFirstYearForestHectares,
          unknown_required_input_hectares: row.unknownRequiredInputHectares,
        },
        geometry: feature.geometry,
      };
    })
    .sort((a, b) => a.properties.province_id.localeCompare(b.properties.province_id));
  writeFileSync(joinedPath, `${JSON.stringify(boundaries)}\n`);

  run("tippecanoe", [
    "-o", archivePath, "-l", LAYER, "--name=Witness Tree Phase 2 province aggregate 2020-2022", "--description=Verified technical-preview province aggregate; not per-cell geometry", "--minimum-zoom=0", "--maximum-zoom=6",
    "--no-feature-limit", "--no-tile-size-limit", "--force", joinedPath,
  ]);
  const metadata = JSON.parse(run("pmtiles", ["show", "--metadata", archivePath]));
  metadata.name = "Witness Tree Phase 2 province aggregate 2020-2022";
  metadata.description = "Verified technical-preview province aggregate; not per-cell geometry";
  metadata.generator_options = "tippecanoe -l phase2_province_loss_2020_2022 --minimum-zoom=0 --maximum-zoom=6 --no-feature-limit --no-tile-size-limit";
  const metadataPath = join(work, "pmtiles-metadata.json");
  writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
  run("pmtiles", ["edit", archivePath, "--metadata", metadataPath]);
  const archiveSha256 = sha256(archivePath);
  const releaseDir = join(OUT_ROOT, archiveSha256);
  if (existsSync(releaseDir)) throw new Error(`immutable release already exists: ${releaseDir}`);
  mkdirSync(releaseDir, { recursive: true });
  const finalArchive = join(releaseDir, "phase2-province-loss-2020-2022.pmtiles");
  copyFileSync(archivePath, finalArchive, 0);
  assert.equal(sha256(finalArchive), archiveSha256, "copied archive checksum changed");
  const manifest = {
    schemaVersion: "witness-tree/phase8-province-map-release/1",
    status: "verified-technical-preview-release-candidate",
    scope: {
      layer: LAYER,
      provinceIds: ["24", "35", "48", "59"],
      period: "2020-2022",
      geometryMeaning: "Statistics Canada 2021 province and territory cartographic boundaries joined to admitted province-level Phase 2 aggregate values",
      excludedClaim: "This archive is not per-cell forest-loss geometry and does not close the Phase 2 production gate.",
    },
    inputs: {
      boundary: { relativePath: "raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip", byteLength: statSync(BOUNDARY).size, sha256: EXPECTED.boundary },
      aggregate: { relativePath: "derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.json", byteLength: statSync(AGGREGATE).size, sha256: EXPECTED.aggregate },
      admissionRecord: { path: "data/phase2-admission-record-2026-08-26.json" },
    },
    transform: {
      boundaryFilter: "PRUID IN ('24','35','48','59')",
      sourceCrs: "EPSG:3347",
      outputCrs: "EPSG:4326/WebMercator vector tiles",
      simplifyToleranceSourceMetres: 1000,
      minZoom: 0,
      maxZoom: 6,
      ogr2ogrVersion: run("ogr2ogr", ["--version"]),
      tippecanoeVersion: run("tippecanoe", ["--version"]),
    },
    output: {
      fileName: "phase2-province-loss-2020-2022.pmtiles",
      byteLength: statSync(finalArchive).size,
      sha256: archiveSha256,
      contentType: "application/vnd.pmtiles",
    },
    claims: {
      exactInputsVerified: true,
      featureCount: 4,
      technicalPreviewEligible: true,
      phase2ProductionGateComplete: false,
      perCellGeometryMaterialized: false,
    },
  };
  const manifestPath = join(releaseDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ releaseDir, manifestPath, archivePath: finalArchive, archiveSha256, byteLength: manifest.output.byteLength }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
