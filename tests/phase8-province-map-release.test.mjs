import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertDecodedProvince,
  cacheHitObservation,
  clientTileCoordinates,
  decodeVectorTile,
  validateRangeRecord,
} from "../scripts/check-phase8-province-map-release.mjs";

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

test("live validation selects the archive center at the client zooms", () => {
  assert.deepEqual(
    clientTileCoordinates({
      centerLon: -126.5625,
      centerLat: 50.70264,
    }),
    [
      { z: 0, x: 0, y: 0 },
      { z: 3, x: 1, y: 2 },
      { z: 6, x: 9, y: 21 },
    ],
  );
});

test("live validation decodes and checks the admitted province value", () => {
  const tile = Uint8Array.from(
    Buffer.from(
      "GmQKHnBoYXNlMl9wcm92aW5jZV9sb3NzXzIwMjBfMjAyMhIIEgQAAAEBGAMaC3Byb3ZpbmNlX2lkGhVvYnNlcnZlZF9sb3NzX3BlcmNlbnQiBAoCNTkiCRm4yN/nr0T2PyiAIHgC",
      "base64",
    ),
  );
  const features = decodeVectorTile(tile, "phase2_province_loss_2020_2022");
  assert.deepEqual(features, [
    {
      province_id: "59",
      observed_loss_percent: 1.3917693193039167,
    },
  ]);
  assert.deepEqual(assertDecodedProvince(features), {
    provinceId: "59",
    observedLossPercent: 1.3917693193039167,
  });
  assert.throws(
    () =>
      assertDecodedProvince(features, {
        provinceId: "59",
        observedLossPercent: 0,
      }),
    /Expected values to be strictly equal/,
  );
});

test("live validation binds exact ranges and only claims an observable cache hit", () => {
  const first = {
    status: 206,
    range: "bytes=127-408",
    contentRange: "bytes 127-408/289166",
    contentLength: 282,
    byteLength: 282,
    attempt: 1,
    cacheStatus: "Miss from cloudfront",
  };
  const repeat = { ...first, attempt: 2, cacheStatus: "Hit from cloudfront" };
  validateRangeRecord(first, { byteLength: 289166, offset: 127, length: 282 });
  assert.deepEqual(cacheHitObservation([first, repeat]), {
    observable: true,
    hitObserved: true,
    status: "Hit from cloudfront",
  });
  assert.throws(
    () => validateRangeRecord({ ...first, status: 200 }, { byteLength: 289166, offset: 127, length: 282 }),
    /Expected values to be strictly equal/,
  );
  assert.deepEqual(cacheHitObservation([{ ...first, cacheStatus: null }]), {
    observable: false,
    hitObserved: false,
    status: null,
  });
});
