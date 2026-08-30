import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const admission = JSON.parse(
  await readFile(new URL("../data/economic-region-source-admission-2026-08-29.json", import.meta.url), "utf8"),
);

test("economic-region geometry and immutable overlay release are exact", () => {
  assert.equal(admission.schemaVersion, "witness-tree/framework-source-admission/1");
  assert.equal(admission.status, "owner-directed-source-admission");
  assert.equal(admission.publisher, "Statistics Canada");
  assert.equal(admission.catalogueNumber, "92-160-X");
  assert.equal(admission.edition, "2021 Census");
  assert.equal(admission.geographicReferenceDate, "2021-01-01");
  assert.equal(admission.artifact.byteLength, 28023613);
  assert.equal(admission.artifact.sha256, "b1bcb1305a04c6ddf9b74bdee545616a85ef6ff2e5622de343c34b122bdb08f7");
  assert.equal(admission.artifact.featureCount, 76);
  assert.equal(admission.artifact.distinctDguidCount, 76);
  assert.equal(admission.licence.id, "statistics-canada-open-licence");
  assert.deepEqual(admission.artifact.targetProvinceFeatureCounts, { "24": 17, "35": 11, "48": 8, "59": 8 });
  assert.equal(admission.frenchNamesArtifact.byteLength, 28023689);
  assert.equal(admission.frenchNamesArtifact.sha256, "02449dd7bccfd6338b554821fd6fab8430cd1720d2b53b1ad8499746ae538c1b");
  assert.equal(admission.frenchNamesArtifact.featureCount, 76);
  assert.equal(admission.claims.sourceAdmitted, true);
  assert.equal(admission.claims.geometryAdmitted, true);
  assert.equal(admission.claims.immutableOverlayReleased, true);
  assert.equal(admission.overlayRelease.releaseId, "2c3667c5e23d4f976791cc30ae8246f63e2aa03b4c4829a7006952cdd43f7ff8");
  assert.equal(admission.overlayRelease.exactRemoteReadback, true);
  assert.equal(admission.claims.regionalAggregateReleased, false);
  assert.equal(admission.claims.productionEligible, false);
  assert.match(admission.limitations.join(" "), /French name bytes are separately admitted and are joined by DGUID\/IDUGD/);
});

test("the admitted economic-region record matches the attached source bytes", async (context) => {
  const root = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  const relative = admission.artifact.path.replace(/^\.\.\/Witness_Tree-data\//u, "");
  const artifactPath = path.join(root, relative);
  const frenchRelative = admission.frenchNamesArtifact.path.replace(/^\.\.\/Witness_Tree-data\//u, "");
  const frenchPath = path.join(root, frenchRelative);
  if (!existsSync(artifactPath) || !existsSync(frenchPath)) {
    context.skip("external Witness Tree data root is not attached");
    return;
  }
  const bytes = await readFile(artifactPath);
  assert.equal(bytes.length, admission.artifact.byteLength);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), admission.artifact.sha256);
  const collection = JSON.parse(bytes);
  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.features.length, admission.artifact.featureCount);
  assert.equal(new Set(collection.features.map((feature) => feature.properties.DGUID)).size, admission.artifact.distinctDguidCount);
  assert.equal(collection.features.filter((feature) => !feature.geometry).length, admission.artifact.missingGeometryCount);
  assert.equal(collection.features.filter((feature) => !String(feature.properties.DGUID ?? "").trim()).length, admission.artifact.missingIdentifierCount);
  assert.equal(collection.features.filter((feature) => !String(feature.properties.ERNAME ?? "").trim()).length, admission.artifact.missingNameCount);
  const counts = Object.fromEntries(Object.keys(admission.artifact.targetProvinceFeatureCounts).map((pruid) => [
    pruid,
    collection.features.filter((feature) => String(feature.properties.PRUID) === pruid).length,
  ]));
  assert.deepEqual(counts, admission.artifact.targetProvinceFeatureCounts);

  const frenchBytes = await readFile(frenchPath);
  assert.equal(frenchBytes.length, admission.frenchNamesArtifact.byteLength);
  assert.equal(createHash("sha256").update(frenchBytes).digest("hex"), admission.frenchNamesArtifact.sha256);
  const french = JSON.parse(frenchBytes);
  assert.equal(french.type, "FeatureCollection");
  assert.equal(french.features.length, admission.frenchNamesArtifact.featureCount);
  const englishIds = new Set(collection.features.map((feature) => String(feature.properties.DGUID)));
  const frenchIds = new Set(french.features.map((feature) => String(feature.properties.IDUGD)));
  assert.deepEqual([...frenchIds].sort(), [...englishIds].sort());
  assert.equal(french.features.filter((feature) => !String(feature.properties.RÉNOM ?? "").trim()).length, 0);
});
