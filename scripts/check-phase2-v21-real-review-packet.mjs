import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const evidence = JSON.parse(readFileSync(`${root}/data/phase2-v21-real-review-packet-evidence.json`, "utf8"));
const packetPath = `${root}/${evidence.packet.path}`;
const packetBytes = readFileSync(packetPath);
const packet = JSON.parse(packetBytes);
assert.equal(createHash("sha256").update(packetBytes).digest("hex"), evidence.packet.sha256);
assert.equal(packetBytes.length, evidence.packet.byteLength);
assert.equal(packet.status, "local-real-raster-candidates-no-review-results");
assert.equal(packet.productionEligible, false); assert.equal(packet.released, false);
assert.equal(packet.samples.length, 400);
for (const province of ["BC", "AB", "ON", "QC"]) assert.equal(packet.samples.filter((sample) => sample.province === province).length, 100);
for (const stratum of packet.selection.strata) assert.equal(packet.samples.filter((sample) => sample.stratum === stratum).length, 100);
assert.deepEqual(packet.expertReview, { status: "not-started", completedLocationsByProvince: { BC: 0, AB: 0, ON: 0, QC: 0 }, resultClaims: "none" });
for (const sample of packet.samples) {
  assert.match(sample.raster.sha256, /^[a-f0-9]{64}$/); assert.match(sample.boundary.boundaryGeometrySha256, /^[a-f0-9]{64}$/);
  assert.equal(sample.review.status, "not-started"); assert.equal(sample.review.yearAndAttribution.en, ""); assert.equal(sample.review.yearAndAttribution.fr, "");
}
console.log("Phase 2 V2.1 real review packet passes; 400 candidates, zero review results, nonproduction.");
