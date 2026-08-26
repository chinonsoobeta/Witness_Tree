import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packetEvidencePath = `${root}/data/phase2-v21-real-review-packet-evidence.json`;
const outputPath = `${root}/data/phase2-v21-real-review-packet-raster-readback-evidence.json`;
const rasterRoot = `${root}/../../Witness_Tree-data/derived/phase2-v21-raster-first-1984-2022-v1`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const file = (path) => readFileSync(path);

function rasterReadback(samples, raster) {
  const input = samples.map(({ cell }) => `${cell.column} ${cell.row}`).join("\n") + "\n";
  const result = spawnSync("gdallocationinfo", ["-valonly", raster], { input, encoding: "utf8", maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || "gdallocationinfo failed");
  const values = result.stdout.trim().split(/\s+/).map(Number);
  assert.equal(values.length, samples.length, "native readback returned an unexpected number of pixels");
  return values;
}

const packetEvidence = JSON.parse(file(packetEvidencePath));
const packetBytes = file(`${root}/${packetEvidence.packet.path}`);
assert.equal(digest(packetBytes), packetEvidence.packet.sha256, "packet checksum does not match its existing evidence");
const packet = JSON.parse(packetBytes);
const groups = new Map();
for (const sample of packet.samples) {
  const group = groups.get(sample.raster.path) ?? [];
  group.push(sample);
  groups.set(sample.raster.path, group);
}

let observedLoss = 0;
let knownNoLoss = 0;
const rasters = [];
for (const [relativePath, samples] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const expected = samples[0].raster;
  const rasterPath = `${rasterRoot}/${relativePath}`;
  const rasterBytes = file(rasterPath);
  assert.equal(rasterBytes.length, expected.byteLength, `${relativePath} byte length differs from packet binding`);
  assert.equal(digest(rasterBytes), expected.sha256, `${relativePath} checksum differs from packet binding`);
  const values = rasterReadback(samples, rasterPath);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const expectedValue = sample.observedClass === "loss-observed" ? 1 : 0;
    assert.equal(values[index], expectedValue, `${sample.id} disagrees with its native interval raster`);
    if (expectedValue === 1) observedLoss += 1;
    else knownNoLoss += 1;
  }
  rasters.push({ path: relativePath, byteLength: rasterBytes.length, sha256: digest(rasterBytes), samples: samples.length });
}

const scriptBytes = file(fileURLToPath(import.meta.url));
const evidence = {
  schemaVersion: "witness-tree/phase2-v21-real-review-packet-raster-readback-evidence/1",
  status: "local-native-pixel-readback-passed-nonproduction",
  packet: { path: packetEvidence.packet.path, byteLength: packetBytes.length, sha256: digest(packetBytes) },
  runner: { path: "scripts/readback-phase2-v21-real-review-packet.mjs", sha256: digest(scriptBytes) },
  rasters,
  result: { samples: packet.samples.length, observedLoss, knownNoLoss, allNativePixelsMatchPacketClass: true },
  claims: { candidatePacketNativeReadbackCompleted: true, expertReviewCompleted: false, validationResultsExist: false, admittedInputs: false, productionEligible: false, released: false }
};

if (process.argv.includes("--write-repo-evidence")) {
  assert.equal(existsSync(outputPath), false, "Refusing to overwrite existing repository evidence.");
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}
console.log(`Phase 2 review-packet native readback passed: ${evidence.result.samples} cells (${observedLoss} observed loss, ${knownNoLoss} known no loss); nonproduction.`);
