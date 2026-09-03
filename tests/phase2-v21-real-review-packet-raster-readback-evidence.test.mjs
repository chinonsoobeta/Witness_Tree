import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateReviewPacketRasterReadback } from "../scripts/check-phase2-v21-real-review-packet-raster-readback-evidence.mjs";
import { resolveRecordedDataPath } from "../scripts/data-root.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = read("data/phase2-v21-real-review-packet-raster-readback-evidence.json");
const packetEvidence = read("data/phase2-v21-real-review-packet-evidence.json");
// The record declares the packet the way the archive sits beside a canonical
// checkout. Resolving that against this file named a directory two levels above
// the repository that exists on no machine, so the test failed with the drive
// attached and, because the checker it is chained behind fails first when the
// drive is gone, the detached sweep never saw it.
const packetBytes = readFileSync(resolveRecordedDataPath(packetEvidence.packet.path) ?? new URL(`../${packetEvidence.packet.path}`, import.meta.url));

test("native review-packet readback evidence remains explicitly nonproduction", () => {
  const output = execFileSync("node", ["scripts/check-phase2-v21-real-review-packet-raster-readback-evidence.mjs"], { encoding: "utf8" });
  assert.match(output, /grants no review, admission, or release credit/);
});

test("native review-packet readback rejects raster identity and claim drift", () => {
  const runnerSha256 = evidence.runner.sha256;
  const alteredRaster = structuredClone(evidence);
  alteredRaster.rasters[0].path = "whole-interval-loss-incorrect.tif";
  assert.throws(() => validateReviewPacketRasterReadback(alteredRaster, packetEvidence, packetBytes, runnerSha256));

  const alteredClaim = structuredClone(evidence);
  alteredClaim.claims.expertReviewCompleted = true;
  assert.throws(() => validateReviewPacketRasterReadback(alteredClaim, packetEvidence, packetBytes, runnerSha256));
});
