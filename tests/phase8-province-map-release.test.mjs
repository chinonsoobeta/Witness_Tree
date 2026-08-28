import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const load = async (name) =>
  JSON.parse(
    await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"),
  );

test("the public map is checksum-bound, range verified, isolated from raw storage, and claim limited", async () => {
  const release = await load("phase8-province-map-release.json");
  const delivery = await load("phase8-public-delivery-evidence.json");
  assert.equal(release.output.sha256, delivery.object.sha256);
  assert.equal(delivery.externalVerification.rangeStatus, 206);
  assert.equal(
    delivery.externalVerification.fullReadbackSha256,
    release.output.sha256,
  );
  assert.equal(
    delivery.browserCompatibilityObject.fullReadbackSha256,
    release.browserCompatibilityOutput.sha256,
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry.smallIslandsOmitted,
    true,
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry
      .minimumExteriorRingAreaSquareDegrees,
    0.001,
  );
  assert.equal(delivery.separation.rawArchiveBucketIsOrigin, false);
  assert.equal(delivery.separation.releasePutRequiresIfNoneMatch, true);
  assert.equal(delivery.separation.unconditionalExistingKeyPutDenied, true);
  assert.equal(delivery.separation.releaseDeleteDenied, true);
  assert.equal(release.claims.phase2ProductionGateComplete, false);
  assert.equal(release.claims.perCellGeometryMaterialized, false);
});

test("the client pins the exact immutable public URL and source layer", async () => {
  const release = await load("phase8-province-map-release.json");
  const delivery = await load("phase8-public-delivery-evidence.json");
  const style = await readFile(
    new URL("../lib/explore/map-style.ts", import.meta.url),
    "utf8",
  );
  assert.match(style, new RegExp(delivery.object.sha256));
  assert.match(style, new RegExp(release.scope.layer));
  assert.match(style, /https:\/\//);
});
