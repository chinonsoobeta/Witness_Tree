import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sidecarFor } from "../scripts/prepare-current-wildfire-immutable-promotion.mjs";
import { captureCurrentWildfireRawArchiveEvidence } from "../scripts/capture-current-wildfire-raw-archive-evidence.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const plan = read("current-wildfire-immutable-promotion-preparation.json");
const staged = read("staged-acquisitions.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const expected = new Map(); const payloads = new Map();
for (const artifact of plan.artifacts) {
  const source = staged.entries.find((entry) => entry.id === artifact.id);
  const payload = plan.proposedRoleScope.objectKeys.find((key) => key.startsWith(`raw/${source.sourceId}/`) && key.includes("/payload/"));
  payloads.set(source.sourceId, Buffer.alloc(source.byteLength, source.sourceId.at(0)));
  expected.set(payload.replace(/\/payload\/[^/]+$/, "/manifest.json"), Buffer.from(sidecarFor(plan, source, artifact)));
}

function makeTransport({ drift = null } = {}) {
  const calls = [];
  const sources = new Map(staged.entries.map((source) => [source.sourceId, source]));
  const transport = async (operation, request) => {
    calls.push({ operation, request });
    assert.ok(["head-object", "get-object", "get-object-retention"].includes(operation));
    assert.equal(request.bucket, plan.destination.bucket);
    const manifest = request.key.endsWith("/manifest.json");
    const spec = manifest ? { body: expected.get(request.key) } : { body: payloads.get([...sources.keys()].find((sourceId) => request.key.startsWith(`raw/${sourceId}/`))) };
    if (operation === "head-object") return { VersionId: `version-${calls.length}`, ContentLength: spec.body.byteLength, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: drift === "checksum" ? "" : "mock-crc64" };
    if (operation === "get-object") {
      if (manifest) return drift === "manifest" ? Buffer.from("drift") : spec.body;
      return spec.body;
    }
    return { Retention: { Mode: drift === "retention" ? "GOVERNANCE" : "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
  };
  return { transport, calls };
}

test("capture accepts only the three read-only APIs and records all eight exact versions", async () => {
  const { calls, transport } = makeTransport();
  const digest = (body) => {
    for (const [sourceId, bytes] of payloads) if (body === bytes) return staged.entries.find((entry) => entry.sourceId === sourceId).sha256;
    return sha(body);
  };
  const evidence = await captureCurrentWildfireRawArchiveEvidence({ plan, staged, aws: transport, capturedAt: "2026-08-25T00:00:00Z", digest });
  assert.equal(evidence.entries.length, 4);
  assert.equal(calls.length, 24);
  assert.deepEqual([...new Set(calls.map(({ operation }) => operation))].sort(), ["get-object", "get-object-retention", "head-object"]);
  assert.equal(calls.filter(({ operation }) => operation === "get-object").every(({ request }) => typeof request.versionId === "string"), true);
  assert.equal(evidence.entries.every((entry) => entry.payload.retention.mode === "COMPLIANCE" && entry.manifest.retention.until === "2033-08-12T00:00:00Z"), true);
  assert.deepEqual(evidence.claims, { ownerAdmission: false, transformed: false, ingested: false, productionEligible: false });
});

test("the CLI contains no mutation, listing, or credential operation", () => {
  const script = readFileSync(new URL("../scripts/capture-current-wildfire-raw-archive-evidence.mjs", import.meta.url), "utf8");
  assert.match(script, /head-object/); assert.match(script, /get-object-retention/); assert.match(script, /get-object/);
  assert.doesNotMatch(script, /put-object|delete-object|copy-object|restore-object|list-objects|assume-role|AWS_SECRET|AWS_ACCESS/i);
});

test("capture fails closed on checksum, deterministic manifest, or retention drift", async () => {
  const digest = (body) => {
    for (const [sourceId, bytes] of payloads) if (body === bytes) return staged.entries.find((entry) => entry.sourceId === sourceId).sha256;
    return sha(body);
  };
  for (const drift of ["checksum", "manifest", "retention"]) {
    const { transport } = makeTransport({ drift });
    await assert.rejects(captureCurrentWildfireRawArchiveEvidence({ plan, staged, aws: transport, digest }), /refused|drift|checksum|retention/i);
  }
});
