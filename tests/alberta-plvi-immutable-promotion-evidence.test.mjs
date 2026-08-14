import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAlbertaPlviImmutablePromotionEvidence } from "../scripts/check-alberta-plvi-immutable-promotion-evidence.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/alberta-plvi-immutable-promotion-evidence.json", import.meta.url), "utf8"));
const preparation = JSON.parse(readFileSync(new URL("../data/alberta-plvi-immutable-promotion-preparation.json", import.meta.url), "utf8"));

test("PLVI immutable evidence pins exact raw and derived payload and sidecar versions without source admission", () => {
  assert.equal(validateAlbertaPlviImmutablePromotionEvidence(evidence, preparation), evidence);
  assert.equal(evidence.payloads.every((payload) => payload.providerChecksum.type === "FULL_OBJECT" && payload.retention.mode === "COMPLIANCE"), true);
  assert.equal(evidence.claims.ownerSourceLedgerAdmission, false);
  assert.equal(evidence.claims.productionEligible, false);
});

test("PLVI immutable evidence rejects checksum, retention, lineage, and admission drift", () => {
  assert.throws(() => validateAlbertaPlviImmutablePromotionEvidence({...evidence, payloads: [{...evidence.payloads[0], byteLength: 1}, evidence.payloads[1]]}, preparation));
  assert.throws(() => validateAlbertaPlviImmutablePromotionEvidence({...evidence, payloads: [{...evidence.payloads[0], retention: {...evidence.payloads[0].retention, mode: "GOVERNANCE"}}, evidence.payloads[1]]}, preparation));
  assert.throws(() => validateAlbertaPlviImmutablePromotionEvidence({...evidence, payloads: [evidence.payloads[0], {...evidence.payloads[1], rawSourceSha256: "0".repeat(64)}]}, preparation));
  assert.throws(() => validateAlbertaPlviImmutablePromotionEvidence({...evidence, claims: {...evidence.claims, productionAdmission: true}}, preparation));
});
