import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { validateVlce2PromotionPreparation } from "./check-vlce2-promotion-preparation.mjs";

const OUTPUT = new URL("../data/vlce2-remote-promotion-evidence.json", import.meta.url);
const RETAIN_UNTIL = "2033-08-12T00:00:00+00:00";
const aws = (args) => JSON.parse(execFileSync("aws", args, { encoding: "utf8" }));

/** Captures read-only S3 evidence once. It refuses to overwrite the first observed record. */
export function capture(plan, selectedEntries = plan.entries) {
  validateVlce2PromotionPreparation(plan);
  const entries = selectedEntries.map((entry) => {
    const payload = aws(["s3api", "head-object", "--bucket", entry.remote.bucket, "--key", entry.remote.payloadKey, "--version-id", entry.remote.versionId, "--checksum-mode", "ENABLED", "--region", entry.remote.region, "--output", "json"]);
    assert.equal(payload.ContentLength, entry.byteLength, `${entry.year} payload byte length mismatch.`);
    assert.equal(payload.VersionId, entry.remote.versionId, `${entry.year} payload version mismatch.`);
    assert.equal(payload.ChecksumType, "FULL_OBJECT", `${entry.year} payload is not FULL_OBJECT.`);
    assert.equal(payload.ChecksumCRC64NVME, entry.remote.checksumCrc64nvmeBase64, `${entry.year} payload CRC64 mismatch.`);
    const sidecar = aws(["s3api", "head-object", "--bucket", entry.remote.bucket, "--key", entry.remote.manifestKey, "--checksum-mode", "ENABLED", "--region", entry.remote.region, "--output", "json"]);
    assert.ok(sidecar.VersionId, `${entry.year} sidecar version is absent.`);
    assert.ok(Number.isSafeInteger(sidecar.ContentLength) && sidecar.ContentLength > 0, `${entry.year} sidecar byte length is absent.`);
    assert.equal(sidecar.ChecksumType, "FULL_OBJECT", `${entry.year} sidecar is not FULL_OBJECT.`);
    assert.ok(sidecar.ChecksumCRC64NVME, `${entry.year} sidecar CRC64 is absent.`);
    const retention = aws(["s3api", "get-object-retention", "--bucket", entry.remote.bucket, "--key", entry.remote.payloadKey, "--version-id", entry.remote.versionId, "--region", entry.remote.region, "--output", "json"]);
    assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${entry.year} retention is not COMPLIANCE.`);
    assert.equal(retention.Retention?.RetainUntilDate, RETAIN_UNTIL, `${entry.year} retention date mismatch.`);
    return { year: entry.year, payload: { key: entry.remote.payloadKey, versionId: payload.VersionId, byteLength: payload.ContentLength, checksumType: payload.ChecksumType, checksumCrc64nvmeBase64: payload.ChecksumCRC64NVME }, sidecar: { key: entry.remote.manifestKey, versionId: sidecar.VersionId, byteLength: sidecar.ContentLength, checksumType: sidecar.ChecksumType, checksumCrc64nvmeBase64: sidecar.ChecksumCRC64NVME }, retention: { mode: retention.Retention.Mode, retainUntilDate: retention.Retention.RetainUntilDate } };
  });
  return {
    schemaVersion: "witness-tree/vlce2-remote-promotion-evidence/1",
    status: "remote-verified",
    observedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    historicalPreparation: { path: "data/vlce2-promotion-preparation.json", commit: "c5c23bb", status: "preparation-only", supersededByThisRecord: true, en: "The preparation record preserves the pre-promotion observations: only 1984 was then retained. This later record is the authoritative remote observation after the approved promotion; it does not rewrite the earlier state.", fr: "Le registre de préparation conserve les observations antérieures à la promotion : seule l’année 1984 était alors retenue. Le présent registre ultérieur constitue l’observation distante faisant autorité après la promotion approuvée; il ne réécrit pas l’état antérieur." },
    source: { id: plan.source.id, publisher: plan.source.publisher, catalogueUrl: plan.source.catalogueUrl, licence: { id: plan.source.licence.id, url: plan.source.licence.url, attribution: { en: plan.source.licence.requiredAttribution, fr: "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert – Canada." } } },
    storage: { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", retentionMode: "COMPLIANCE", retainUntilDate: RETAIN_UNTIL },
    tools: { awsCli: execFileSync("aws", ["--version"], { encoding: "utf8" }).trim(), node: process.version },
    counts: { payloads: entries.length, sidecars: entries.length, retainedPayloadVersions: entries.length },
    entries
  };
}

if (process.argv[1]?.endsWith("capture-vlce2-remote-promotion-evidence.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
  const option = (name) => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1]; };
  const from = Number(option("--from") ?? 1984);
  const to = Number(option("--to") ?? 2022);
  const selected = plan.entries.filter((entry) => entry.year >= from && entry.year <= to);
  assert.ok(selected.length > 0, "Capture range has no VLCE2 entries.");
  const output = option("--output") ?? OUTPUT.pathname;
  writeFileSync(output, `${JSON.stringify(capture(plan, selected), null, 2)}\n`, { flag: "wx" });
  console.log(`Captured ${selected.length} independently read-back VLCE2 promotions in ${output}.`);
}
