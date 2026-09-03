import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDataRoot } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const RECORD_PATH = `${root}/data/phase2-hansen-gfc-v1.12-sample-profile.json`;

// The record keeps the relative path each download was written with, which resolves only from the
// canonical worktree location. Locating the bytes goes through the shared data-root helper instead,
// so a verifier run from any checkout reads the same file. What the record claims is unchanged.
const RECORDED_ROOT_PREFIX = "../../Witness_Tree-data/";

export function artifactPath(localPath) {
  if (!localPath.startsWith(RECORDED_ROOT_PREFIX)) return `${root}/${localPath}`;
  return `${resolveDataRoot()}/${localPath.slice(RECORDED_ROOT_PREFIX.length)}`;
}

// Returns null when the external data root is not attached. An artifact that cannot be read is
// unverified, not contradicted, so its byte assertions are skipped and counted. Every structural
// assertion still runs, and the caller reports how many files went unread.
function readIfPresent(localPath) {
  if (!existsSync(resolveDataRoot())) return null;
  const path = artifactPath(localPath);
  // The root being attached without the tile on it contradicts the binding, so this is an assertion
  // rather than another skip. Only a detached root is grounds for leaving a tile unread.
  assert.ok(existsSync(path), `the data root is attached but does not hold the bound tile ${localPath}`);
  return readFileSync(path);
}

// Hansen grid tiles are 10 by 10 degrees and are named for their north-west corner. Deriving the
// extent from the name means the record cannot claim an extent its own tile name contradicts.
export function extentFromTileName(tile) {
  const match = /^(\d{2})([NS])_(\d{3})([EW])$/.exec(tile ?? "");
  assert.ok(match, `tile name ${tile} is not a Hansen grid tile name`);
  const [, lat, latHemisphere, lon, lonHemisphere] = match;
  const maxY = latHemisphere === "N" ? Number(lat) : -Number(lat);
  const minX = lonHemisphere === "E" ? Number(lon) : -Number(lon);
  return [minX, maxY - 10, minX + 10, maxY];
}

// Province envelopes are not taken on the record's word. They are derived from the unsimplified
// province geometry the Phase 8 map release already binds by checksum, so widening an envelope to
// manufacture an overlap fails. The simplified display copy is deliberately not used: it omits small
// islands, so its envelope is smaller than the province and would understate coverage.
const PROVINCE_GEOMETRY_DIRECTORY = "derived/phase8-province-map-geojson-v1";
const PROVINCE_GEOMETRY_FILE = "phase2-province-loss-2020-2022.geojson";
const PROVINCE_IDS = { 24: "QC", 35: "ON", 48: "AB", 59: "BC" };

// The two sources are independently produced, so they agree closely rather than exactly: the record
// takes its envelopes from the federal district boundaries and this geometry comes from the
// Statistics Canada province file. The largest observed disagreement is 0.009 degrees.
const ENVELOPE_TOLERANCE_DEGREES = 0.05;

function boundingBox(coordinates, box) {
  if (typeof coordinates[0] === "number") {
    const [x, y] = coordinates;
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
    return box;
  }
  for (const part of coordinates) boundingBox(part, box);
  return box;
}

// Returns null when the geometry is not reachable, which leaves the record's declared envelopes
// unverified rather than contradicted. Never returns a partial map: a province missing from the
// geometry is a defect in the geometry, not a licence to skip that province.
export function loadDerivedProvinceEnvelopes() {
  const release = JSON.parse(readFileSync(`${root}/data/phase8-province-map-release.json`, "utf8"));
  const digest = release.browserCompatibilityOutput.displayGeometry.parentSha256;
  const dataRoot = resolveDataRoot();
  // A detached volume leaves the envelopes unverified. An attached volume that does not hold the
  // geometry the release binds is a different thing entirely: the binding is contradicted, and
  // falling back to the record's own envelopes there would let a swapped digest buy the weaker
  // check. Only the whole root being absent is grounds for skipping.
  if (!existsSync(dataRoot)) return null;
  const path = `${dataRoot}/${PROVINCE_GEOMETRY_DIRECTORY}/${digest}/${PROVINCE_GEOMETRY_FILE}`;
  assert.ok(
    existsSync(path),
    `the data root is attached but does not hold the province geometry the Phase 8 map release binds at ${digest}`,
  );
  const bytes = readFileSync(path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    digest,
    "province geometry does not match the checksum the Phase 8 map release binds",
  );
  const envelopes = {};
  for (const feature of JSON.parse(bytes.toString("utf8")).features) {
    const province = PROVINCE_IDS[feature.properties.province_id];
    if (province) envelopes[province] = boundingBox(feature.geometry.coordinates, [Infinity, Infinity, -Infinity, -Infinity]);
  }
  assert.deepEqual(Object.keys(envelopes).sort(), ["AB", "BC", "ON", "QC"], "province geometry is missing a sampled province");
  return envelopes;
}

export function validateHansenSampleProfile(record, readArtifact = readIfPresent, loadEnvelopes = loadDerivedProvinceEnvelopes) {
  assert.equal(record.schemaVersion, "witness-tree/phase2-hansen-gfc-v1.12-sample-profile/1", "Hansen sample profile schema version drifted");
  assert.equal(record.status, "locally-staged-cross-check-input-no-comparison-result");
  assert.equal(record.source.licence, "CC BY 4.0");
  assert.equal(record.source.displayAttribution, "Source: Hansen/UMD/Google/USGS/NASA");
  assert.deepEqual(record.artifacts.map(({ provinceSample }) => provinceSample).sort(), ["AB", "BC", "ON", "QC"]);
  const derivedEnvelopes = loadEnvelopes();
  let bytesVerified = 0;
  const unread = [];
  for (const artifact of record.artifacts) {
    const bytes = readArtifact(artifact.localPath);
    if (bytes === null) {
      unread.push(artifact.provinceSample);
    } else {
      assert.equal(bytes.length, artifact.byteLength, `${artifact.provinceSample} byte length`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `${artifact.provinceSample} SHA-256`);
      bytesVerified += 1;
    }

    // The tile a sample names and the file its checksum binds must be the same tile, so a label can
    // never be corrected without the download it stands for being corrected with it.
    assert.ok(
      artifact.localPath.includes(artifact.tile),
      `${artifact.provinceSample} names tile ${artifact.tile} but binds ${artifact.localPath}`,
    );
    assert.deepEqual(
      artifact.extentWgs84,
      extentFromTileName(artifact.tile),
      `${artifact.provinceSample} extent does not match the tile name ${artifact.tile}`,
    );
    assert.ok(
      Array.isArray(artifact.provinceEnvelopeWgs84) && artifact.provinceEnvelopeWgs84.length === 4,
      `${artifact.provinceSample} is missing the province envelope the tile must be checked against`,
    );

    // Where the geometry is reachable, the overlap is judged against the derived envelope, and the
    // declared one only has to agree with it. Where it is not, the declared envelope is used and
    // reported as unverified.
    const derived = derivedEnvelopes?.[artifact.provinceSample] ?? null;
    if (derived) {
      for (let corner = 0; corner < 4; corner += 1) {
        const drift = Math.abs(artifact.provinceEnvelopeWgs84[corner] - derived[corner]);
        assert.ok(
          drift <= ENVELOPE_TOLERANCE_DEGREES,
          `${artifact.provinceSample} declares a province envelope ${drift} degrees from the bound ` +
            `province geometry at corner ${corner}: ${artifact.provinceEnvelopeWgs84} against ${derived}`,
        );
      }
    }

    // A correct checksum on the wrong tile is still the wrong tile. The Alberta sample was
    // 60N_110W, which spans 110W to 100W; Alberta ends at 110W, so the tile met the province along
    // a meridian and held none of it. Byte checks cannot see that, so the tile must overlap its
    // province in both axes with positive area, not merely touch it.
    const [tileMinX, tileMinY, tileMaxX, tileMaxY] = artifact.extentWgs84;
    const [provMinX, provMinY, provMaxX, provMaxY] = derived ?? artifact.provinceEnvelopeWgs84;
    const overlapX = Math.min(tileMaxX, provMaxX) - Math.max(tileMinX, provMinX);
    const overlapY = Math.min(tileMaxY, provMaxY) - Math.max(tileMinY, provMinY);
    assert.ok(
      overlapX > 0 && overlapY > 0,
      `${artifact.provinceSample} sample tile ${artifact.tile} does not overlap the ` +
        `province in area: ${overlapX} by ${overlapY} degrees`,
    );
  }
  assert.deepEqual(record.claims, {comparisonComputed:false,likeForLike:false,productAccuracyClaim:false,admitted:false,productionEligible:false,released:false});
  return { record, bytesVerified, unread, envelopesDerived: derivedEnvelopes !== null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(readFileSync(RECORD_PATH, "utf8"));
  const { bytesVerified, unread, envelopesDerived } = validateHansenSampleProfile(record);
  const bytes = unread.length === 0
    ? `all ${bytesVerified} raw tiles are checksum-verified`
    : `${bytesVerified} of ${record.artifacts.length} raw tiles are checksum-verified, and ${unread.join(", ")} went unread because the data root is not attached`;
  const envelopes = envelopesDerived
    ? "each province envelope is derived from the checksum-bound province geometry"
    : "province envelopes are as declared and unverified because the data root is not attached";
  console.log(`Phase 2 Hansen v1.12 sample profile passes; every tile covers the province it samples, ${envelopes}, ${bytes}, and no comparison is claimed.`);
}
