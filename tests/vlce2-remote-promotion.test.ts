import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dryRunLines, execute, sidecarFor, validateWorkflow } from "../scripts/vlce2-remote-promotion.mjs";
const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
type PayloadEntry = { byteLength: number; remote: { payloadKey: string; manifestKey: string; versionId: string; checksumCrc64nvmeBase64: string } };
const dry = { execute: false, approve: false, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1" };
test("dry run covers all exact heads, deterministic bilingual sidecars, and 38 retention actions", () => { const lines = dryRunLines(plan, dry); assert.equal(lines.filter((x: string) => x.startsWith("HEAD")).length, 39); assert.equal(lines.filter((x: string) => x.startsWith("RETAIN")).length, 38); assert.equal(sidecarFor(plan, plan.entries[0]), sidecarFor(plan, plan.entries[0])); assert.match(sidecarFor(plan, plan.entries[0]), /rebuildable-not-locked/); });
test("execution fails closed without exact bucket, region, approval, future date, sidecar directory, or complete series", () => { assert.throws(() => validateWorkflow(plan, { ...dry, bucket: "wrong" }), /Wrong bucket/); assert.throws(() => validateWorkflow(plan, { ...dry, region: "us-east-1" }), /Wrong region/); assert.throws(() => validateWorkflow(plan, { ...dry, execute: true, retentionUntil: "2033-08-12T00:00:00Z", sidecarDir: "/tmp/x" }), /approve/); assert.throws(() => validateWorkflow(plan, { ...dry, execute: true, approve: true, retentionUntil: "2000-01-01T00:00:00Z", sidecarDir: "/tmp/x" }), /future/); const partial = structuredClone(plan); partial.entries.pop(); assert.throws(() => dryRunLines(partial, dry), /39/); });

test("a successful retention request without a COMPLIANCE read-back fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "vlce2-retention-test-"));
  const options = { ...dry, execute: true, approve: true, retentionUntil: "2033-08-12T00:00:00Z", sidecarDir: directory };
  const invoke = (args: string[]) => {
    const operation = args[1];
    const key = args[args.indexOf("--key") + 1];
    const payload = plan.entries.find((entry: PayloadEntry) => entry.remote.payloadKey === key);
    if (operation === "head-object" && payload) return { ContentLength: payload.byteLength, VersionId: payload.remote.versionId, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: payload.remote.checksumCrc64nvmeBase64 };
    if (operation === "head-object") return { ContentLength: Buffer.byteLength(sidecarFor(plan, plan.entries.find((entry: PayloadEntry) => entry.remote.manifestKey === key))), VersionId: "x".repeat(32), ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=" };
    if (operation === "get-object-retention") return {}; // Models the real silent no-op: PUT appeared successful, lock was absent.
    return {};
  };
  try {
    assert.throws(() => execute(plan, options, invoke), /1985 retention read-back is not COMPLIANCE/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
