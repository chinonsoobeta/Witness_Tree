import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { PMTiles, TileType } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const release = load("phase8-province-map-release.json");
const delivery = load("phase8-public-delivery-evidence.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoBytes = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url));

const CLIENT_ZOOMS = Object.freeze([
  release.output.minZoom,
  Math.floor((release.output.minZoom + release.output.maxZoom) / 2),
  release.output.maxZoom,
]);
const EXPECTED_TILE_ASSERTION = Object.freeze({
  provinceId: "59",
  observedLossPercent: 1.3917693193039167,
});

const tileCoordinate = (zoom, longitude, latitude) => {
  const scale = 2 ** zoom;
  const x = Math.min(
    scale - 1,
    Math.max(0, Math.floor(((longitude + 180) / 360) * scale)),
  );
  const radians = (latitude * Math.PI) / 180;
  const mercatorY =
    (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  const y = Math.min(scale - 1, Math.max(0, Math.floor(mercatorY * scale)));
  return { z: zoom, x, y };
};

export const clientTileCoordinates = (header) =>
  CLIENT_ZOOMS.map((zoom) =>
    tileCoordinate(zoom, header.centerLon, header.centerLat),
  );

export const decodeVectorTile = (bytes, layerName) => {
  const tile = new VectorTile(new PbfReader(bytes));
  const layer = tile.layers[layerName];
  if (!layer) return [];
  return Array.from({ length: layer.length }, (_, index) => ({
    ...layer.feature(index).properties,
  }));
};

export const assertDecodedProvince = (features, expected = EXPECTED_TILE_ASSERTION) => {
  const feature = features.find(
    (item) => String(item.province_id) === expected.provinceId,
  );
  assert.ok(
    feature,
    `decoded tile did not contain province ${expected.provinceId}`,
  );
  assert.equal(feature.observed_loss_percent, expected.observedLossPercent);
  return {
    provinceId: String(feature.province_id),
    observedLossPercent: feature.observed_loss_percent,
  };
};

export const validateRangeRecord = (
  record,
  { byteLength, offset, length },
) => {
  assert.equal(record.status, 206);
  assert.equal(record.range, `bytes=${offset}-${offset + length - 1}`);
  assert.equal(
    record.contentRange,
    `bytes ${offset}-${offset + length - 1}/${byteLength}`,
  );
  assert.equal(record.contentLength, length);
  assert.equal(record.byteLength, length);
};

export const cacheHitObservation = (records) => {
  const repeated = records.filter((record) => record.attempt > 1);
  const observable = repeated.filter((record) => record.cacheStatus);
  const hit = observable.find((record) =>
    /(?:hit|cached)/i.test(record.cacheStatus),
  );
  return {
    observable: observable.length > 0,
    hitObserved: Boolean(hit),
    status: hit?.cacheStatus ?? null,
  };
};

const cacheStatusFromHeaders = (headers) =>
  headers.get("x-cache") ??
  headers.get("cf-cache-status") ??
  headers.get("x-cache-status") ??
  null;

const requestHeaders = (origin, range) => {
  const headers = { Origin: origin };
  if (range) headers.Range = range;
  return headers;
};

const createRecordingSource = ({ url, origin, byteLength }) => {
  const records = [];
  const attempts = new Map();
  let requestSequence = 0;
  const source = {
    records,
    getKey: () => `${url}#phase8-live-validation`,
    async getBytes(offset, length, signal) {
      const range = `bytes=${offset}-${offset + length - 1}`;
      const key = `${offset}:${length}`;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      const started = performance.now();
      const response = await fetch(url, {
        signal,
        headers: requestHeaders(origin, range),
      });
      const data = await response.arrayBuffer();
      const record = {
        sequence: ++requestSequence,
        method: "GET",
        range,
        offset,
        length,
        attempt,
        status: response.status,
        contentRange: response.headers.get("content-range"),
        contentLength: Number(response.headers.get("content-length")),
        byteLength: data.byteLength,
        etag: response.headers.get("etag"),
        cacheStatus: cacheStatusFromHeaders(response.headers),
        age: response.headers.get("age"),
        latencyMs: Number((performance.now() - started).toFixed(2)),
        accessControlAllowOrigin: response.headers.get(
          "access-control-allow-origin",
        ),
        accessControlExposeHeaders: response.headers.get(
          "access-control-expose-headers",
        ),
      };
      records.push(record);
      validateRangeRecord(record, { byteLength, offset, length });
      assert.equal(record.accessControlAllowOrigin, "*");
      return {
        data,
        etag: record.etag ?? undefined,
        cacheControl: response.headers.get("cache-control") ?? undefined,
        expires: response.headers.get("expires") ?? undefined,
      };
    },
  };
  return source;
};

const recordFullResponse = async ({ url, origin, label }) => {
  const started = performance.now();
  const response = await fetch(url, {
    headers: requestHeaders(origin),
  });
  const data = await response.arrayBuffer();
  return {
    label,
    method: "GET",
    range: null,
    status: response.status,
    contentRange: response.headers.get("content-range"),
    contentLength: Number(response.headers.get("content-length")),
    byteLength: data.byteLength,
    etag: response.headers.get("etag"),
    cacheStatus: cacheStatusFromHeaders(response.headers),
    age: response.headers.get("age"),
    latencyMs: Number((performance.now() - started).toFixed(2)),
    accessControlAllowOrigin: response.headers.get(
      "access-control-allow-origin",
    ),
    accessControlExposeHeaders: response.headers.get(
      "access-control-expose-headers",
    ),
    data,
  };
};

const repeatRecordedRanges = async (source) => {
  const ranges = [
    ...new Map(
      source.records.map((record) => [
        `${record.offset}:${record.length}`,
        { offset: record.offset, length: record.length },
      ]),
    ).values(),
  ];
  for (const range of ranges) {
    await source.getBytes(range.offset, range.length);
  }
  return ranges;
};

const runStaticChecks = () => {
  assert.equal(release.status, "published-verified-technical-preview");
  assert.deepEqual(release.scope.provinceIds, ["24", "35", "48", "59"]);
  assert.equal(release.scope.featureCount, 4);
  assert.equal(
    sha256(repoBytes(release.inputs.admissionRecord.path)),
    release.inputs.admissionRecord.sha256,
  );
  assert.equal(
    sha256(repoBytes(release.inputs.zonalEvidence.path)),
    release.inputs.zonalEvidence.sha256,
  );
  const admission = JSON.parse(repoBytes(release.inputs.admissionRecord.path));
  const zonal = JSON.parse(repoBytes(release.inputs.zonalEvidence.path));
  assert.equal(
    admission.evidenceBindings.zonalAggregate.sha256,
    release.inputs.zonalEvidence.sha256,
  );
  assert.equal(zonal.artifacts.output.sha256, release.inputs.aggregate.sha256);
  assert.equal(
    release.inputs.zonalEvidence.outputSha256,
    release.inputs.aggregate.sha256,
  );
  assert.equal(release.output.sha256, delivery.object.sha256);
  assert.equal(
    release.output.sha256,
    delivery.externalVerification.fullReadbackSha256,
  );
  assert.equal(release.output.byteLength, delivery.object.byteLength);
  assert.equal(release.output.byteLength, 289166);
  assert.equal(
    release.browserCompatibilityOutput.sha256,
    delivery.browserCompatibilityObject.sha256,
  );
  assert.equal(
    release.browserCompatibilityOutput.byteLength,
    delivery.browserCompatibilityObject.byteLength,
  );
  assert.equal(release.browserCompatibilityOutput.featureCount, 4);
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry.purpose,
    "display-only province boundaries",
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry.parentSha256,
    "aec8513a57c2360bf5a4c6faecc750155ba16f16f588b28773414cebde1cbd11",
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry
      .parentSimplifyToleranceMetres,
    5000,
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry
      .minimumExteriorRingAreaSquareDegrees,
    0.001,
  );
  assert.equal(
    release.browserCompatibilityOutput.displayGeometry.smallIslandsOmitted,
    true,
  );
  assert.equal(
    delivery.browserCompatibilityObject.fullReadbackSha256,
    release.browserCompatibilityOutput.sha256,
  );
  assert.equal(release.claims.exactInputsVerified, true);
  assert.equal(release.claims.archiveStructureVerified, true);
  assert.equal(release.claims.fullPublicReadbackChecksumVerified, true);
  assert.equal(release.claims.technicalPreviewEligible, true);
  assert.equal(release.claims.phase2ProductionGateComplete, false);
  assert.equal(release.claims.perCellGeometryMaterialized, false);
  assert.match(release.claimLimit, /not per-cell|does not complete/i);
  assert.equal(delivery.region, "ca-central-1");
  assert.equal(new URL(delivery.publicUrl).protocol, "https:");
  assert.equal(delivery.publicUrl.includes(delivery.object.sha256), true);
  assert.equal(delivery.externalVerification.rangeStatus, 206);
  assert.equal(
    delivery.externalVerification.contentRange,
    `bytes 0-16383/${release.output.byteLength}`,
  );
  assert.equal(delivery.externalVerification.directS3ExactObjectStatus, 403);
  assert.equal(delivery.externalVerification.pmtilesVerifyPassed, true);
  assert.match(delivery.externalVerification.repeatRangeCacheResult, /hit/i);
  assert.equal(delivery.separation.rawArchiveBucketIsOrigin, false);
  assert.equal(delivery.separation.deliveryBucketDirectPublicRead, false);
  assert.equal(delivery.separation.cloudFrontOriginAccessControl, true);
  assert.equal(delivery.separation.releasePutRequiresIfNoneMatch, true);
  assert.equal(delivery.separation.unconditionalExistingKeyPutDenied, true);
  assert.equal(
    delivery.separation.conditionalExistingKeyPutPreconditionFailed,
    true,
  );
  assert.equal(delivery.separation.releaseDeleteDenied, true);
};

const verifyExternal = () => {
  const rootIndex = process.argv.indexOf("--data-root");
  assert.notEqual(rootIndex, -1, "--verify-external requires --data-root");
  const dataRoot = process.argv[rootIndex + 1];
  assert.ok(dataRoot, "--data-root value is required");
  assert.equal(
    sha256(
      readFileSync(
        `${dataRoot}/${release.inputs.externalManifest.relativePath}`,
      ),
    ),
    release.inputs.externalManifest.sha256,
  );
  assert.equal(
    sha256(
      readFileSync(
        `${dataRoot}/${release.inputs.browserCompatibilityManifest.relativePath}`,
      ),
    ),
    release.inputs.browserCompatibilityManifest.sha256,
  );
};

const verifyLive = async () => {
  const origin = delivery.externalVerification.origin;
  const source = createRecordingSource({
    url: delivery.publicUrl,
    origin,
    byteLength: release.output.byteLength,
  });
  const archive = new PMTiles(source);
  const header = await archive.getHeader();
  assert.equal(header.specVersion, release.output.pmtilesSpecVersion);
  assert.equal(header.tileType, TileType.Mvt);
  assert.equal(header.minZoom, release.output.minZoom);
  assert.equal(header.maxZoom, release.output.maxZoom);
  assert.equal(header.numAddressedTiles, release.output.addressedTileCount);
  assert.equal(header.tileCompression, 2);
  assert.ok(header.rootDirectoryLength > 0);
  assert.ok(header.tileDataLength > 0);

  const metadata = await archive.getMetadata();
  const layer = metadata.vector_layers?.find(
    (candidate) => candidate.id === release.scope.layer,
  );
  assert.ok(layer, `PMTiles metadata is missing ${release.scope.layer}`);
  assert.equal(layer.minzoom, release.output.minZoom);
  assert.equal(layer.maxzoom, release.output.maxZoom);

  const directory = await source.getBytes(
    header.rootDirectoryOffset,
    header.rootDirectoryLength,
  );
  assert.equal(directory.data.byteLength, header.rootDirectoryLength);

  const coordinates = clientTileCoordinates(header);
  const decoded = [];
  for (const coordinate of coordinates) {
    const tile = await archive.getZxy(
      coordinate.z,
      coordinate.x,
      coordinate.y,
    );
    assert.ok(
      tile,
      `PMTiles has no tile at ${coordinate.z}/${coordinate.x}/${coordinate.y}`,
    );
    const features = decodeVectorTile(tile.data, release.scope.layer);
    decoded.push({
      coordinate,
      featureCount: features.length,
      assertion: assertDecodedProvince(features),
    });
  }

  const repeatedRanges = await repeatRecordedRanges(source);
  const cache = cacheHitObservation(source.records);
  if (cache.observable) {
    assert.equal(cache.hitObserved, true);
  }
  assert.ok(
    source.records.every((record) => record.status === 206),
    "every PMTiles range request must return 206",
  );
  assert.equal(
    source.records.filter((record) => record.attempt > 1).length,
    repeatedRanges.length,
  );
  const rangeEtags = new Set(
    source.records.map((record) => record.etag).filter(Boolean),
  );
  assert.equal(rangeEtags.size, 1);

  const full = await recordFullResponse({
    url: delivery.publicUrl,
    origin,
    label: "pmtiles-full-readback",
  });
  assert.equal(full.status, 200);
  assert.equal(full.byteLength, release.output.byteLength);
  assert.equal(sha256(Buffer.from(full.data)), release.output.sha256);
  assert.equal(full.accessControlAllowOrigin, "*");

  const compatible = await recordFullResponse({
    url: delivery.browserCompatibilityObject.publicUrl,
    origin,
    label: "browser-compatible-full-readback",
  });
  assert.equal(compatible.status, 200);
  assert.equal(
    compatible.byteLength,
    release.browserCompatibilityOutput.byteLength,
  );
  assert.equal(
    sha256(Buffer.from(compatible.data)),
    release.browserCompatibilityOutput.sha256,
  );
  assert.equal(compatible.accessControlAllowOrigin, "*");

  console.log(
    JSON.stringify(
      {
        liveValidation: {
          archiveUrl: delivery.publicUrl,
          clientTileCoordinates: coordinates,
          requests: [
            ...source.records,
            { ...full, data: undefined },
            { ...compatible, data: undefined },
          ],
          decodedTiles: decoded,
          repeatedRangeCount: repeatedRanges.length,
          cacheHit: cache,
        },
      },
      null,
      2,
    ),
  );
};

runStaticChecks();

if (process.argv.includes("--verify-external")) verifyExternal();
if (process.argv.includes("--verify-live")) await verifyLive();

console.log("Phase 8 province map release and delivery evidence passed.");
