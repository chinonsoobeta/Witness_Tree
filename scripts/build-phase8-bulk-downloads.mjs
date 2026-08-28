#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const METHOD_VERSION = "phase8-province-bulk-download-v2";
export const LAYER_NAME = "phase2_province_loss_2020_2022";
export const FIXED_GPKG_TIMESTAMP = "2000-01-01T00:00:00.000Z";
export const INPUTS = Object.freeze({
  boundarySha256: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
  aggregateRelativePath: "derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.json",
  aggregateSha256: "ff1589029f30800021b52d9aa736b9aa9e122df70e3070d19a68f7aa45d9a16d",
  geojsonRelativePath: "derived/phase8-province-map-geojson-v1/101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505/phase2-province-loss-2020-2022.geojson",
  geojsonSha256: "101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505",
});
const PROVINCE_IDS = ["24", "35", "48", "59"];
const CSV_COLUMNS = [
  "province_id",
  "province_name_en",
  "province_name_fr",
  "period_start",
  "period_end",
  "coverage_grade",
  "known_forested_hectares",
  "observed_loss_hectares",
  "observed_loss_outside_first_year_forest_hectares",
  "observed_loss_percent",
  "unknown_required_input_hectares",
  "boundary_edition",
  "method_version",
  "source_boundary_sha256",
  "source_aggregate_sha256",
  "display_geometry_sha256",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (path) => sha256(readFileSync(path));
const escapeCsv = (value) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function loadRows(dataRoot) {
  const aggregatePath = join(dataRoot, INPUTS.aggregateRelativePath);
  const geojsonPath = join(dataRoot, INPUTS.geojsonRelativePath);
  assert.equal(fileSha256(aggregatePath), INPUTS.aggregateSha256, "aggregate checksum drift");
  assert.equal(fileSha256(geojsonPath), INPUTS.geojsonSha256, "display GeoJSON checksum drift");
  const aggregate = new Map(JSON.parse(readFileSync(aggregatePath, "utf8")).map((row) => [row.boundaryId, row]));
  const geojson = JSON.parse(readFileSync(geojsonPath, "utf8"));
  assert.equal(geojson.features.length, PROVINCE_IDS.length);
  const rows = geojson.features
    .map((feature) => {
      const id = feature.properties?.province_id;
      const source = aggregate.get(id);
      assert.ok(source && PROVINCE_IDS.includes(id), `unexpected province ${id}`);
      assert.equal(feature.properties.observed_loss_hectares, source.lossHectares);
      assert.equal(feature.properties.observed_loss_percent, source.observedLossPercent);
      assert.equal(feature.properties.coverage_grade, source.coverageGrade);
      return {
        properties: {
          province_id: id,
          province_name_en: feature.properties.province_name_en,
          province_name_fr: feature.properties.province_name_fr,
          period_start: 2020,
          period_end: 2022,
          coverage_grade: source.coverageGrade,
          known_forested_hectares: source.knownForestedHectares,
          observed_loss_hectares: source.lossHectares,
          observed_loss_outside_first_year_forest_hectares: source.observedLossOutsideFirstYearForestHectares,
          observed_loss_percent: source.observedLossPercent,
          unknown_required_input_hectares: source.unknownRequiredInputHectares,
          boundary_edition: "statcan-2021-provinces-territories-cbf",
          method_version: METHOD_VERSION,
          source_boundary_sha256: INPUTS.boundarySha256,
          source_aggregate_sha256: INPUTS.aggregateSha256,
          display_geometry_sha256: INPUTS.geojsonSha256,
        },
        geometry: feature.geometry,
      };
    })
    .sort((a, b) => a.properties.province_id.localeCompare(b.properties.province_id));
  assert.deepEqual(rows.map((row) => row.properties.province_id), PROVINCE_IDS);
  return rows;
}

export function writeBulkDownloadCandidate(rows, work) {
  const csvPath = join(work, "phase2-province-loss-2020-2022.csv");
  const geojsonPath = join(work, "source.geojson");
  const gpkgPath = join(work, "phase2-province-loss-2020-2022.gpkg");
  const csv = [CSV_COLUMNS.join(","), ...rows.map(({ properties }) => CSV_COLUMNS.map((column) => escapeCsv(properties[column])).join(","))].join("\n") + "\n";
  writeFileSync(csvPath, csv, { flag: "wx" });
  writeFileSync(geojsonPath, `${JSON.stringify({ type: "FeatureCollection", name: LAYER_NAME, features: rows.map((row) => ({ type: "Feature", ...row })) })}\n`, { flag: "wx" });
  const select = CSV_COLUMNS.map((column) => column === "unknown_required_input_hectares" ? `CAST(${column} AS FLOAT) AS ${column}` : column).join(", ");
  execFileSync("ogr2ogr", ["-f", "GPKG", "-makevalid", "-nlt", "PROMOTE_TO_MULTI", "-nln", LAYER_NAME, "-dialect", "OGRSQL", "-sql", `SELECT ${select} FROM ${LAYER_NAME}`, "-lco", "FID=feature_id", "-dsco", "VERSION=1.2", gpkgPath, geojsonPath], { stdio: ["ignore", "pipe", "pipe"] });
  for (const sql of [
    `UPDATE gpkg_contents SET last_change='${FIXED_GPKG_TIMESTAMP}' WHERE table_name='${LAYER_NAME}'`,
    `UPDATE gpkg_metadata_reference SET timestamp='${FIXED_GPKG_TIMESTAMP}'`,
  ]) execFileSync("ogrinfo", ["-update", gpkgPath, "-dialect", "SQLite", "-sql", sql], { stdio: ["ignore", "pipe", "pipe"] });
  const qa = JSON.parse(execFileSync("ogrinfo", ["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", `SELECT province_id, ST_IsValid(geom) AS valid, ST_IsEmpty(geom) AS empty, ST_GeometryType(geom) AS geometry_type FROM ${LAYER_NAME}`, gpkgPath], { encoding: "utf8" }));
  const geometryRows = qa.layers?.[0]?.features?.map(({ properties }) => properties) ?? [];
  assert.equal(geometryRows.length, rows.length, "GeoPackage feature count drift");
  assert.ok(geometryRows.every(({ valid, empty, geometry_type: type }) => valid === 1 && empty === 0 && type === "MULTIPOLYGON"), "GeoPackage geometry validity QA failed");
  return { csvPath, gpkgPath, rows, geometryRows };
}

function buildCandidate(dataRoot, work) {
  return writeBulkDownloadCandidate(loadRows(dataRoot), work);
}

export function buildPhase8BulkDownloads({ dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data", verifyOnly = false } = {}) {
  const firstWork = mkdtempSync(join(tmpdir(), "witness-tree-bulk-first-"));
  const secondWork = mkdtempSync(join(tmpdir(), "witness-tree-bulk-second-"));
  try {
  const first = buildCandidate(dataRoot, firstWork);
  const second = buildCandidate(dataRoot, secondWork);
  const csvBytes = readFileSync(first.csvPath);
  const gpkgBytes = readFileSync(first.gpkgPath);
  assert.deepEqual(csvBytes, readFileSync(second.csvPath), "CSV regeneration is not byte-deterministic");
  assert.deepEqual(gpkgBytes, readFileSync(second.gpkgPath), "GeoPackage regeneration is not byte-deterministic");
  const csvSha256 = sha256(csvBytes);
  const gpkgSha256 = sha256(gpkgBytes);
  const releaseId = sha256(Buffer.from(`${METHOD_VERSION}\u001f${csvSha256}\u001f${gpkgSha256}`));
  const outputDir = join(dataRoot, "derived/phase8-bulk-download-v1", releaseId);
  const csvOutput = join(outputDir, "phase2-province-loss-2020-2022.csv");
  const gpkgOutput = join(outputDir, "phase2-province-loss-2020-2022.gpkg");
  const manifest = {
    schemaVersion: "witness-tree/phase8-bulk-download-release/1",
    status: "verified-local-release-candidate",
    releaseId,
    methodVersion: METHOD_VERSION,
    scope: { provinceIds: PROVINCE_IDS, period: "2020-2022", rowCount: 4, boundaryEdition: "statcan-2021-provinces-territories-cbf" },
    inputs: {
      ...INPUTS,
      admissionRecord: { path: "data/phase2-admission-record-2026-08-26.json", sha256: "58147c088d12190f8882d0c493364cd07cf7c176d4fafbc266421bf337ca7d82" },
      zonalEvidence: { path: "data/phase2-v21-province-zonal-pilot-evidence.json", sha256: "4fb0efc6ec984025e91f0124e0347a2f0a08673ed1f606ba318c9ca732f5ce62", sidecarRelativePath: "derived/phase2-v21-zonal-province-2021-cbf-v5/province-2020-2022.sidecar.json", sidecarSha256: "20894a732a762fdbfd618e35f2b8934028727e6207ac9846732d9899e501c50c" },
      displayGeometryManifest: { relativePath: "derived/phase8-province-map-geojson-v1/101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505/manifest.json", sha256: "47d4c6aad0400810e6233d83b53b560df9056e8168ed2b1e4c566d425e5969e4", parentSha256: "aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11" },
    },
    outputs: {
      csv: { fileName: "phase2-province-loss-2020-2022.csv", byteLength: csvBytes.length, sha256: csvSha256, contentType: "text/csv; charset=utf-8" },
      geopackage: { fileName: "phase2-province-loss-2020-2022.gpkg", byteLength: gpkgBytes.length, sha256: gpkgSha256, contentType: "application/geopackage+sqlite3", layer: LAYER_NAME, fixedTimestamp: FIXED_GPKG_TIMESTAMP },
    },
    sources: [
      { id: "statcan-2021-provinces-territories-cbf", publisher: "Statistics Canada", datasetTitle: "2021 Census Province/Territory Cartographic Boundary File", edition: "2021 Census, Cartographic Boundary File, ArcGIS Shapefile, English", referenceDate: "2021-01-01", retrievedAt: "2026-08-12T16:26:00Z", catalogueUrl: "https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X", sourceUrl: "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip", sourceSha256: INPUTS.boundarySha256 },
      { id: "ntems-annual-land-cover", publisher: "Natural Resources Canada", datasetTitle: "Annual High-resolution forest land cover for Canada (1984-2022)", edition: "annual 2020-2022 derived interval", referenceDate: "2022-01-01", retrievedAt: "2026-08-14T00:00:00Z", catalogueUrl: "https://open.canada.ca/data/en/dataset/2785c103-9c2d-429b-9f3d-89f5cd9ea94d", sourceUrl: "https://opendata.nfis.org/downloads/forest_change/CA_forest_VLCE2_{YEAR}.zip", aggregateSha256: INPUTS.aggregateSha256 },
    ],
    licences: [
      { id: "statcan-open-licence", name: "Statistics Canada Open Licence", version: "unversioned; page last modified 2025-07-10", url: "https://www.statcan.gc.ca/en/reference/licence", publisher: "Statistics Canada", appliesTo: "boundary geometry", redistributionStatus: "allowed with source acknowledgement and no implied endorsement", requiredAttribution: "Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. This does not constitute an endorsement by Statistics Canada of this product." },
      { id: "ogl-canada-2.0", name: "Open Government Licence - Canada", version: "2.0", url: "https://open.canada.ca/en/open-government-licence-canada", publisher: "Natural Resources Canada", appliesTo: "NRCan NTEMS-derived forest-change values", redistributionStatus: "allowed subject to licence requirements and exclusions", requiredAttribution: { en: "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). This does not constitute an endorsement by Natural Resources Canada.", fr: "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert - Canada. Adapté de Ressources naturelles Canada, Couverture terrestre annuelle à haute résolution des forêts du Canada (1984-2022). Cela ne constitue pas une approbation de Ressources naturelles Canada." } },
    ],
    geometryTransform: {
      source: "display_geometry_sha256",
      operation: "OGR -makevalid with PROMOTE_TO_MULTI",
      displayOnly: true,
      parentSimplifyToleranceMetres: 5000,
      minimumExteriorRingAreaSquareDegrees: 0.001,
      smallIslandsOmitted: true,
      gdalVersion: execFileSync("ogr2ogr", ["--version"], { encoding: "utf8" }).trim(),
      fixedGpkgTimestamp: FIXED_GPKG_TIMESTAMP,
      outputFeatureCount: first.geometryRows.length,
      allOutputGeometriesValid: true,
      allOutputGeometriesNonEmpty: true,
      outputGeometryType: "MULTIPOLYGON",
    },
    modificationNotice: {
      en: "Witness Tree selected the admitted 2020-2022 province-level aggregate rows for Quebec, Ontario, Alberta, and British Columbia; joined them to simplified Statistics Canada 2021 display boundaries; omitted islands below the recorded display-area threshold; repaired polygon validity with GDAL; promoted the result to multipolygon geometry; and wrote deterministic CSV and GeoPackage files. The values remain province-level aggregates and are not per-cell forest-loss geometry.",
      fr: "Witness Tree a sélectionné les lignes agrégées admises de 2020 à 2022 pour le Québec, l’Ontario, l’Alberta et la Colombie-Britannique; les a jointes aux limites d’affichage simplifiées de Statistique Canada de 2021; a omis les îles sous le seuil de superficie d’affichage consigné; a réparé la validité des polygones avec GDAL; a converti le résultat en géométrie multipolygone; et a produit des fichiers CSV et GeoPackage déterministes. Les valeurs demeurent des agrégats provinciaux et ne constituent pas une géométrie de perte de forêt par cellule."
    },
    claims: { deterministicRegenerationVerified: true, technicalPreviewEligible: true, phase2ProductionGateComplete: false, perCellGeometryMaterialized: false, displayOnlyGeometry: true },
    claimLimit: "This four-province bulk release is a technical preview of province-level 2020-2022 aggregates. It is not per-cell forest-loss geometry and does not complete the formal Phase 2 production gate.",
    claimLimitFr: "Cette version en bloc pour quatre provinces est un aperçu technique des agrégats provinciaux de 2020 à 2022. Elle ne représente pas une géométrie de perte de forêt par cellule et ne satisfait pas au critère formel de la phase 2.",
  };
  const manifestPath = join(outputDir, "manifest.json");
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (existsSync(outputDir)) {
    assert.equal(fileSha256(csvOutput), csvSha256, "immutable CSV release drift");
    assert.equal(fileSha256(gpkgOutput), gpkgSha256, "immutable GeoPackage release drift");
    assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes, "immutable release manifest drift");
  } else {
    if (verifyOnly) throw new Error(`verified release is absent: ${outputDir}`);
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(first.csvPath, csvOutput);
    copyFileSync(first.gpkgPath, gpkgOutput);
    writeFileSync(manifestPath, manifestBytes, { flag: "wx" });
  }
  return { outputDir, manifestPath, manifest };
  } finally {
    rmSync(firstWork, { recursive: true, force: true });
    rmSync(secondWork, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataRootIndex = process.argv.indexOf("--data-root");
  const dataRoot = dataRootIndex === -1 ? undefined : resolve(process.argv[dataRootIndex + 1]);
  console.log(JSON.stringify(buildPhase8BulkDownloads({ dataRoot }), null, 2));
}
