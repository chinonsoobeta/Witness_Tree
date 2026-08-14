import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateElectionsCanadaFed2025PromotionPreparation } from "../scripts/check-elections-canada-fed-2025-promotion-preparation.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const plan = read("elections-canada-fed-2025-promotion-preparation.json");
const ledger = read("elections-canada-fed-2025-source-ledger.json");
const profile = read("elections-canada-fed-2025-profile.json");
const readiness = read("archive-operations-readiness.json");

test("Elections Canada promotion preparation stays local-only and blocked", () => {
  assert.equal(validateElectionsCanadaFed2025PromotionPreparation(plan, ledger, profile, readiness), plan);
});

test("promotion preparation fails closed on a remote, retention, readiness, or identity claim", () => {
  assert.throws(() => validateElectionsCanadaFed2025PromotionPreparation({ ...plan, claims: { ...plan.claims, remoteObjectExists: true } }, ledger, profile, readiness));
  assert.throws(() => validateElectionsCanadaFed2025PromotionPreparation({ ...plan, deterministicRemoteNames: { ...plan.deterministicRemoteNames, payloadKey: "raw/current/payload.zip" } }, ledger, profile, readiness));
  assert.throws(() => validateElectionsCanadaFed2025PromotionPreparation(plan, ledger, profile, { ...readiness, status: "ready" }));
  assert.throws(() => validateElectionsCanadaFed2025PromotionPreparation({ ...plan, snapshot: { ...plan.snapshot, sha256: "a".repeat(64) } }, ledger, profile, readiness));
});
