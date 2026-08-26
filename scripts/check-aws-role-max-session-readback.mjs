import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const evidencePath = path.join(root, "data/aws-role-max-session-readback-2026-08-25.json");
export const evidenceSha256 = "e92eb0d0ff4859b9762d3a7aafe3d3a0352c0ae3f618ed57d619bd85084bc8a7";
const roles = [
  "WitnessTreeArchivePromotionUploader", "WitnessTreeQcArchivePromotionUploader", "WitnessTreeArchiveReplication",
  "WitnessTreeWildfireDerivedPromotionUploader", "WitnessTreePlviArchivePromotionUploader", "WitnessTreeCurrentWildfirePromotionUploader",
  "WitnessTreeArchiveUploader", "WitnessTreeArchiveRetentionBreakGlass", "WitnessTreeArchiveVerifier"
].sort();

export function validateRoleReadback(raw = readFileSync(evidencePath, "utf8")) {
  assert.equal(createHash("sha256").update(raw).digest("hex"), evidenceSha256, "role-duration evidence checksum changed");
  const value = JSON.parse(raw);
  assert.deepEqual(Object.keys(value).sort(), ["maxSessionDuration", "notice", "observedAt", "roles", "schemaVersion", "status"]);
  assert.equal(value.schemaVersion, "witness-tree/aws-role-max-session-readback/1");
  assert.equal(value.status, "observed-read-only");
  assert.equal(value.observedAt, "2026-08-25");
  assert.equal(value.maxSessionDuration, 43200);
  assert.deepEqual([...value.roles].sort(), roles);
  return true;
}

if (process.argv[1]?.endsWith("check-aws-role-max-session-readback.mjs")) {
  validateRoleReadback();
  console.log("Redacted nine-role 43200-second readback evidence checksum passed.");
}
