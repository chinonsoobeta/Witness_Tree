import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const admission = JSON.parse(await readFile(
  new URL("../data/watershed-source-admission-2026-08-29.json", import.meta.url),
  "utf8",
));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dataPath = (root, relative) => path.join(root, relative.replace(/^\.\.\/Witness_Tree-data\//u, ""));

const SOURCE_ID = "nrcan-wsc-sub-drainage-v6";

test("watershed admission records the measured v6 archive and Canadian selection", () => {
  assert.equal(admission.schemaVersion, "witness-tree/framework-source-admission/1");
  assert.equal(admission.publisher, "Natural Resources Canada");
  assert.equal(admission.edition, "Version 6.0");
  assert.equal(admission.artifact.byteLength, 50896154);
  assert.equal(admission.artifact.sha256, "9afc4f505cc7d86e20c1296b7695b6ccae94fd085ed94f7be3178811583d8213");
  assert.equal(admission.artifact.polygonPayload.sha256, "0108bb97466e4fe43f59bbda27744e19d8a969bc8a40e9a20880d3ff9ca50fad");
  assert.equal(admission.artifact.featureCount, 184);
  assert.equal(admission.artifact.distinctWscsdaCount, 184);
  assert.equal(admission.canadianOverlaySelection.rule, "WSCSDA NOT LIKE 'U%'");
  assert.equal(admission.canadianOverlaySelection.excludedUsaOnlyFeatureCount, 15);
  assert.equal(admission.canadianOverlaySelection.selectedFeatureCount, 169);
  assert.deepEqual(admission.canadianOverlaySelection.targetCoverage, ["BC", "AB", "ON", "QC"]);
  assert.equal(admission.claims.sourceAdmitted, true);
  assert.equal(admission.claims.geometryAdmitted, true);
  assert.equal(admission.claims.immutableOverlayReleased, true);
  assert.equal(admission.overlayRelease.releaseId, "2c3667c5e23d4f976791cc30ae8246f63e2aa03b4c4829a7006952cdd43f7ff8");
  assert.equal(admission.overlayRelease.exactRemoteReadback, true);
  assert.equal(admission.claims.watershedAggregateReleased, false);
  assert.equal(admission.claims.productionEligible, false);
});

test("watershed admission matches the governed outer and polygon payload bytes", async (context) => {
  const root = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  const outerPath = dataPath(root, admission.artifact.path);
  const payloadPath = dataPath(root, admission.artifact.polygonPayload.storedPath);
  if (!existsSync(outerPath) || !existsSync(payloadPath)) {
    context.skip("external Witness Tree data root is not attached or the governed copy is pending");
    return;
  }
  const outer = await readFile(outerPath);
  const payload = await readFile(payloadPath);
  assert.equal(outer.length, admission.artifact.byteLength);
  assert.equal(hash(outer), admission.artifact.sha256);
  assert.equal(payload.length, admission.artifact.polygonPayload.byteLength);
  assert.equal(hash(payload), admission.artifact.polygonPayload.sha256);
  const extracted = execFileSync("unzip", ["-p", outerPath, admission.artifact.polygonPayload.member], { maxBuffer: 1 << 26 });
  assert.equal(hash(extracted), admission.artifact.polygonPayload.sha256);
  assert.equal(extracted.length, admission.artifact.polygonPayload.byteLength);

  const geojsonLines = execFileSync("ogr2ogr", [
    "-f", "GeoJSONSeq", "/vsistdout/",
    `/vsizip/${payloadPath}/${admission.artifact.polygonPayload.shapefile}`,
  ], { encoding: "utf8", maxBuffer: 1 << 28 }).trim().split("\n").map(JSON.parse);
  const ids = geojsonLines.map((feature) => String(feature.properties.WSCSDA ?? "").trim());
  const excluded = geojsonLines.filter((feature) => ids[geojsonLines.indexOf(feature)].startsWith("U"));
  assert.equal(geojsonLines.length, admission.artifact.featureCount);
  assert.equal(new Set(ids).size, admission.artifact.distinctWscsdaCount);
  assert.equal(geojsonLines.filter((feature) => !feature.geometry).length, 0);
  assert.equal(geojsonLines.filter((feature) => !String(feature.properties.WSCSDA_EN ?? "").trim()).length, 0);
  assert.equal(geojsonLines.filter((feature) => !String(feature.properties.WSCSDA_FR ?? "").trim()).length, 0);
  assert.equal(excluded.length, admission.canadianOverlaySelection.excludedUsaOnlyFeatureCount);
  assert.equal(excluded.filter((feature) => !String(feature.properties.WSCSDA_EN).startsWith("[USA:")).length, 0);
  assert.equal(excluded.filter((feature) => !String(feature.properties.WSCSDA_FR).startsWith("[É.-U")).length, 0);
  assert.equal(ids.filter((id) => !id.startsWith("U")).length, admission.canadianOverlaySelection.selectedFeatureCount);

  const selected = geojsonLines.filter((feature) => !String(feature.properties.WSCSDA).startsWith("U"));
  const coordinatePairs = (value) => Array.isArray(value)
    ? typeof value[0] === "number" && typeof value[1] === "number"
      ? [value]
      : value.flatMap(coordinatePairs)
    : [];
  const intersects = (feature, [west, south, east, north]) => coordinatePairs(feature.geometry.coordinates)
    .some(([longitude, latitude]) => longitude >= west && longitude <= east && latitude >= south && latitude <= north);
  const targetInteriors = {
    BC: [-130, 49, -120, 58],
    AB: [-119, 50, -111, 59],
    ON: [-92, 43, -75, 55],
    QC: [-78, 46, -59, 60],
  };
  for (const [province, interior] of Object.entries(targetInteriors)) {
    assert.ok(selected.some((feature) => intersects(feature, interior)), `${province} must intersect the selected Canadian watershed framework`);
  }
});

// The admitted source is national; the overlay that ships is not. This binds the
// record to the release that is current, so a later release cannot quietly leave
// this admission pointing at a superseded file the way v2 did.
test("the superseded overlay pointer names the release that is actually current", async () => {
  const release = JSON.parse(
    await readFile(new URL("../data/boundary-overlay-release.json", import.meta.url), "utf8"),
  );
  const superseded = admission.overlayReleaseSuperseded;
  assert.equal(superseded.supersedes, admission.overlayRelease.releaseId);
  assert.notEqual(superseded.releaseId, admission.overlayRelease.releaseId);
  assert.equal(superseded.productId, release.productId);
  assert.equal(superseded.releaseId, release.releaseId);
  assert.equal(superseded.builtAt, release.builtAt);

  const archive = release.archives.find((entry) => entry.fileName === superseded.fileName);
  assert.ok(archive, `${superseded.fileName} is not in the current release`);
  assert.equal(superseded.byteLength, archive.byteLength);
  assert.equal(superseded.sha256, archive.sha256);
  assert.equal(superseded.url, archive.url);
  assert.equal(superseded.shippedFeatureCount, archive.featureCount);
  assert.equal(superseded.url, `${release.base}/${superseded.fileName}`);

  const source = release.sources.find((entry) => entry.id === SOURCE_ID);
  assert.ok(source, `${SOURCE_ID} is not a source of the current release`);
  assert.equal(superseded.shippedFeatureCount, source.featureCount);
  assert.equal(superseded.sourceFeatureCount, source.sourceFeatureCount);
  assert.equal(superseded.selection, source.selection);
  assert.equal(superseded.clippedToProvinceBoundary, source.clippedToProvinceBoundary);
  assert.equal(source.clippedToProvinceBoundary, true);
  assert.ok(
    superseded.shippedFeatureCount < superseded.admittedSelectionFeatureCount,
    "a clipped overlay ships fewer features than the admission selected",
  );
});
