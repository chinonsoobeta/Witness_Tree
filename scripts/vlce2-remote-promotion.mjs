import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateVlce2PromotionPreparation } from "./check-vlce2-promotion-preparation.mjs";

const BUCKET = "witness-tree-raw-archive-ca-central-1";
const REGION = "ca-central-1";
const RETENTION_FLAG = "--approve-compliance-retention";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const utc = (value) => UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");

export function sidecarFor(plan, entry) {
  return `${JSON.stringify({
    schemaVersion: "witness-tree/vlce2-remote-sidecar/1",
    purpose: { en: "Rebuildable provenance metadata for one immutable VLCE2 payload version.", fr: "Métadonnées de provenance reconstruisibles pour une version de charge utile VLCE2 immuable." },
    source: { id: plan.source.id, publisher: plan.source.publisher, catalogueUrl: plan.source.catalogueUrl, downloadUrl: plan.source.downloadUrlTemplate.replace("{YEAR}", String(entry.year)) },
    payload: { year: entry.year, originalFilename: entry.originalFilename, byteLength: entry.byteLength, sha256: entry.sha256, crc64nvme: entry.crc64nvme, key: entry.remote.payloadKey, versionId: entry.remote.versionId, s3Checksum: { type: entry.remote.checksumType, crc64nvmeBase64: entry.remote.checksumCrc64nvmeBase64 } },
    licence: { id: plan.source.licence.id, url: plan.source.licence.url, attribution: plan.source.licence.requiredAttribution },
    metadataRetention: { state: "rebuildable-not-locked", en: "This sidecar is intentionally rebuildable metadata; only its named payload version receives compliance retention.", fr: "Ce fichier d’accompagnement est une métadonnée volontairement reconstruisible; seule la version de charge utile nommée reçoit une rétention de conformité." }
  }, null, 2)}\n`;
}

export function validateWorkflow(plan, options) {
  validateVlce2PromotionPreparation(plan);
  assert.equal(plan.entries.length, 39);
  assert.equal(options.bucket, BUCKET, "Wrong bucket: this workflow is pinned to the Canadian raw-archive bucket.");
  assert.equal(options.region, REGION, "Wrong region: this workflow is pinned to ca-central-1.");
  if (!options.execute) return { mode: "dry-run", retain: 38 };
  assert.equal(options.approve, true, `Execution requires ${RETENTION_FLAG}.`);
  assert.ok(utc(options.retentionUntil), "Execution requires a fixed UTC --retention-until date.");
  assert.ok(new Date(options.retentionUntil) > new Date(), "Retention date must be in the future.");
  assert.ok(options.sidecarDir, "Execution requires a controlled --sidecar-dir.");
  return { mode: "execute", retain: 38 };
}

function aws(args) { return JSON.parse(execFileSync("aws", args, { encoding: "utf8" })); }
function head(entry) {
  const response = aws(["s3api", "head-object", "--bucket", BUCKET, "--key", entry.remote.payloadKey, "--version-id", entry.remote.versionId, "--checksum-mode", "ENABLED", "--region", REGION, "--output", "json"]);
  assert.equal(response.ContentLength, entry.byteLength, `${entry.year} remote byte length mismatch.`);
  assert.equal(response.VersionId, entry.remote.versionId, `${entry.year} remote VersionId mismatch.`);
  assert.equal(response.ChecksumType, "FULL_OBJECT", `${entry.year} lacks FULL_OBJECT checksum evidence.`);
  assert.equal(response.ChecksumCRC64NVME, entry.remote.checksumCrc64nvmeBase64, `${entry.year} remote CRC64 mismatch.`);
}

export function dryRunLines(plan, options) {
  validateWorkflow(plan, options);
  return plan.entries.flatMap((entry) => {
    const sidecar = sidecarFor(plan, entry);
    return [
      `HEAD ${entry.year} s3://${BUCKET}/${entry.remote.payloadKey} version=${entry.remote.versionId}`,
      `SIDECAR ${entry.year} key=${entry.remote.manifestKey} sha256=${sha256(sidecar)}`,
      ...(entry.year === 1984 ? [] : [`RETAIN ${entry.year} version=${entry.remote.versionId} mode=COMPLIANCE until=<approved UTC date>`])
    ];
  });
}

export function execute(plan, options) {
  validateWorkflow(plan, options);
  for (const entry of plan.entries) head(entry); // Every payload head succeeds before any write.
  mkdirSync(options.sidecarDir, { recursive: true });
  const sidecarEvidence = [];
  for (const entry of plan.entries) {
    const sidecar = sidecarFor(plan, entry);
    const file = join(options.sidecarDir, `vlce2-${entry.year}.manifest.json`);
    writeFileSync(file, sidecar, { flag: "wx" });
    aws(["s3api", "put-object", "--bucket", BUCKET, "--key", entry.remote.manifestKey, "--body", file, "--checksum-algorithm", "CRC64NVME", "--region", REGION, "--output", "json"]);
    const remote = aws(["s3api", "head-object", "--bucket", BUCKET, "--key", entry.remote.manifestKey, "--checksum-mode", "ENABLED", "--region", REGION, "--output", "json"]);
    assert.equal(remote.ContentLength, Buffer.byteLength(sidecar), `${entry.year} sidecar read-back bytes mismatch.`);
    assert.ok(remote.VersionId, `${entry.year} sidecar read-back VersionId missing.`);
    assert.equal(remote.ChecksumType, "FULL_OBJECT", `${entry.year} sidecar lacks provider FULL_OBJECT checksum evidence.`);
    assert.ok(remote.ChecksumCRC64NVME, `${entry.year} sidecar CRC64 evidence missing.`);
    sidecarEvidence.push({ year: entry.year, key: entry.remote.manifestKey, versionId: remote.VersionId, byteLength: remote.ContentLength, checksumType: remote.ChecksumType, checksumCrc64nvmeBase64: remote.ChecksumCRC64NVME });
  }
  for (const entry of plan.entries.filter((entry) => entry.year !== 1984)) aws(["s3api", "put-object-retention", "--bucket", BUCKET, "--key", entry.remote.payloadKey, "--version-id", entry.remote.versionId, "--retention", JSON.stringify({ Mode: "COMPLIANCE", RetainUntilDate: options.retentionUntil }), "--region", REGION]);
  return { sidecarEvidence };
}

if (process.argv[1]?.endsWith("vlce2-remote-promotion.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
  const option = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
  const options = { execute: process.argv.includes("--execute"), approve: process.argv.includes(RETENTION_FLAG), retentionUntil: option("--retention-until"), sidecarDir: option("--sidecar-dir"), bucket: option("--bucket") ?? BUCKET, region: option("--region") ?? REGION };
  if (!options.execute) console.log(dryRunLines(plan, options).join("\n"));
  else execute(plan, options);
}
