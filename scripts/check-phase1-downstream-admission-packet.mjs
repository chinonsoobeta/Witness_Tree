import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IDS = ["ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height", "cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance", "qc-current-ecoforest", "qc-original-current-inventory", "qc-fourth-inventory", "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation", "fed-2023-ridings", "elections-canada-45th-files"];
const READY = ["ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height", "federal-electoral", "qc-current-ecoforest", "qc-original-current-inventory"];
const BLOCKED = ["qc-fourth-inventory", "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation", "cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"];
const claims = { ownerDecisionCreated: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false };
const sha256 = async (root, relativePath) => createHash("sha256").update(await readFile(path.join(root, relativePath))).digest("hex");
const HISTORICAL_IMMUTABLE_PREFLIGHT_PATH = "data/phase1-immutable-downstream-preflight.json";
const HISTORICAL_IMMUTABLE_PREFLIGHT_SHA256 = "215314493e5c0c5fb4ced7ab667f4ee9eb0bede9ed6bd3f5ca832b96d8919319";

export async function validateHistoricalImmutablePreflightBinding(root, expected = HISTORICAL_IMMUTABLE_PREFLIGHT_SHA256) {
  const bytes = await readFile(path.join(root, HISTORICAL_IMMUTABLE_PREFLIGHT_PATH), "utf8");
  const historicalBaselineOpening = '  "baseline": {\n';
  const qualifiedBaselineOpening = `${historicalBaselineOpening}    "asOf": "2026-08-22",\n`;
  assert.equal(bytes.split(qualifiedBaselineOpening).length, 2, "The immutable preflight must retain exactly one established date qualifier inside its baseline.");
  const record = JSON.parse(bytes);
  assert.equal(record.asOf, "2026-08-22", "The immutable preflight record date changed.");
  assert.equal(record.baseline?.asOf, record.asOf, "The immutable preflight baseline must carry its established record date.");
  assert.equal(
    createHash("sha256").update(bytes.replace(qualifiedBaselineOpening, historicalBaselineOpening)).digest("hex"),
    expected,
    "The immutable preflight may differ from the owner-bound historical bytes only by its established baseline date qualifier.",
  );
}

function specFor(record, specId) {
  const [fileId, rowId] = specId.split("#");
  if (rowId) {
    assert.equal(record.id, fileId, `Wrong specification file id for ${specId}`);
    return record.rows?.find((row) => row.sourceId === rowId);
  }
  return record.id === specId ? record : record.specifications?.find((spec) => spec.id === specId);
}

export async function validatePhase1DownstreamAdmissionPacket(packet, root) {
  assert.equal(packet.schemaVersion, "witness-tree/phase1-downstream-admission-packet/2");
  assert.equal(packet.status, "owner-transformation-scope-decision-preparation-read-only");
  assert.deepEqual(packet.baseline, { remoteArchivedCoreRows: 16, productionAdmissionCompleteRows: 0, productionEligibleRows: 0 });
  assert.deepEqual(packet.claims, claims, "All downstream claims must remain false.");
  const rows = packet.bundles.flatMap((bundle) => bundle.rows);
  assert.deepEqual(rows.slice().sort(), IDS.slice().sort(), "Each current core row must appear exactly once.");
  assert.equal(new Set(rows).size, IDS.length, "A row must not inherit another bundle's decision.");
  assert.deepEqual(packet.bundles.filter((bundle) => bundle.technicalReadiness === "ready-for-owner-approve-reject-defer-transformation-scope").map(({ id }) => id), READY);
  assert.deepEqual(packet.bundles.filter((bundle) => bundle.technicalReadiness === "blocked-named-prerequisites").map(({ id }) => id), BLOCKED);
  for (const bundle of packet.bundles) {
    assert.ok(bundle.specId && bundle.ownerDecisionNow && bundle.restriction);
    if (READY.includes(bundle.id)) {
      assert.match(bundle.ownerDecisionNow, /^Approve, reject, or defer only/);
      assert.equal(bundle.namedPrerequisites, undefined);
    } else {
      assert.match(bundle.ownerDecisionNow, /^None:/);
      assert.ok(Array.isArray(bundle.namedPrerequisites) && bundle.namedPrerequisites.length > 0);
    }
  }
  for (const [relativePath, expected] of Object.entries(packet.evidenceBindings)) {
    if (relativePath === HISTORICAL_IMMUTABLE_PREFLIGHT_PATH) await validateHistoricalImmutablePreflightBinding(root, expected);
    else if (relativePath !== "data/phase1-production-source-ledger.json") assert.equal(await sha256(root, relativePath), expected, `Checksum binding drift: ${relativePath}`);
  }
  const evolutionPath = "data/phase1-ledger-post-scope-approval-evolution.json";
  const evolution = JSON.parse(await readFile(path.join(root, evolutionPath), "utf8"));
  assert.equal(evolution.schemaVersion, "witness-tree/phase1-ledger-evolution/1");
  assert.deepEqual(evolution.historicalDecisionPacket, { path: "data/phase1-downstream-admission-packet.json", sha256: "82c55e3bea87d1a3856b233b2e483cd9b5318afd3d998bd753867af944370520", boundLedgerPath: "data/phase1-production-source-ledger.json", boundLedgerSha256: packet.evidenceBindings["data/phase1-production-source-ledger.json"] });
  assert.equal(await sha256(root, evolution.historicalDecisionPacket.path), evolution.historicalDecisionPacket.sha256);
  assert.equal(await sha256(root, evolution.currentLedger.path), evolution.currentLedger.sha256);
  assert.equal(await sha256(root, evolution.authorizedChange.path), evolution.authorizedChange.sha256);
  // Specification checksums live in their own registry, which the packet names by
  // path and deliberately does not bind by checksum. Binding it would restore the
  // coupling the split removed: the packet's checksum is bound by every scope's
  // evidence, so any correction to any specification would again invalidate
  // unrelated scopes. The load-bearing check is unchanged and still per
  // specification, immediately below.
  assert.equal(packet.specificationRegistry?.path, "data/phase1-transformation-spec-registry.json", "Packet must name the specification registry.");
  const registry = JSON.parse(await readFile(path.join(root, packet.specificationRegistry.path), "utf8"));
  assert.equal(registry.schemaVersion, "witness-tree/phase1-transformation-spec-registry/1");
  assert.equal(registry.specificationBindings.length, packet.bundles.length, "Every scoped row requires one exact spec binding.");
  for (const binding of registry.specificationBindings) {
    assert.equal(await sha256(root, binding.path), binding.sha256, `Specification checksum binding drift: ${binding.path}`);
    const record = JSON.parse(await readFile(path.join(root, binding.path), "utf8"));
    const spec = specFor(record, binding.specId);
    assert.ok(spec, `Missing bound spec record: ${binding.specId}`);
    const specRows = spec.sourceLedgerRows ?? [spec.sourceId];
    assert.deepEqual(specRows, binding.rows, `Bound spec scope drift: ${binding.specId}`);
  }
  for (const bundle of packet.bundles) {
    const binding = registry.specificationBindings.find((candidate) => candidate.specId === bundle.specId);
    assert.ok(binding, `Bundle has no exact spec binding: ${bundle.id}`);
    assert.deepEqual(binding.rows, bundle.rows, `Bundle/spec rows differ: ${bundle.id}`);
  }
  const ledger = JSON.parse(await readFile(path.join(root, "data/phase1-production-source-ledger.json"), "utf8"));
  for (const id of IDS) {
    const row = ledger.entries.find((entry) => entry.id === id);
    assert.ok(row, `${id} is missing from the evolved ledger.`);
    if (evolution.authorizedChange.rows.includes(id)) {
      assert.equal(row.evidenceState, "production-admitted", `${id} did not follow the authorized ledger evolution.`);
      assert.equal(row.proof.productionAdmission, true, `${id} admission evidence is missing.`);
      assert.equal(row.productionEligible, true, `${id} eligibility did not follow its exact admission record.`);
    } else {
      assert.equal(row.evidenceState, "remote-verified-archived-profiled", `${id} changed outside the authorized ledger evolution.`);
      assert.equal(row.proof.productionAdmission, false, `${id} gained admission outside the authorized ledger evolution.`);
      assert.equal(row.productionEligible, false, `${id} gained eligibility outside the authorized ledger evolution.`);
    }
  }
  return packet;
}

export async function checkPhase1DownstreamAdmissionPacket(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  return validatePhase1DownstreamAdmissionPacket(JSON.parse(await readFile(path.join(root, "data/phase1-downstream-admission-packet.json"), "utf8")), root);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packet = await checkPhase1DownstreamAdmissionPacket();
  console.log(`Phase 1 historical downstream packet and its append-only ledger evolution passed for ${packet.baseline.remoteArchivedCoreRows} decision-time remote rows.`);
}
