import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateCurrentWildfireProductionEligibility, remoteEvidenceSatisfiesCurrentWildfireGate, requiredCurrentWildfireObjects, validateCurrentWildfireOwnerAdmission } from "../scripts/check-current-wildfire-owner-admission.mjs";
import { validate as validateDerivedPromotionPlan } from "../scripts/prepare-wildfire-derived-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../data/current-wildfire-owner-admission.json");
const ledger = read("../data/phase1-production-source-ledger.json");
const profiles = {"cwfis-current":read("../data/cwfis-current-active-fires-profile.json"),"bc-wildfire":read("../data/bc-wildfire-current-perimeters-profile.json"),"ab-wildfire":read("../data/alberta-wildfire-locations-profile.json"),"on-fire-disturbance":read("../data/ontario-in-year-fire-perimeters-profile.json")};
const policies = {bc:read("../data/bc-wildfire-geometry-policy-2026-08-14.json"),ontario:read("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json")};

test("owner approves the exact four-source scope while immutable evidence keeps production blocked", () => {
  assert.equal(validateCurrentWildfireOwnerAdmission(record, ledger, profiles, policies), record);
  assert.equal(record.archiveGate.verifiedObjectCount, 4);
  assert.equal(record.pipeline.productionEligible, false);
});

test("BC admits 216 geometries, permanently quarantines V10755 and never claims 217 coverage", () => {
  const bc = record.sources.find(({id}) => id === "bc-wildfire");
  assert.deepEqual(bc.derived.repaired, ["G70362"]);
  assert.deepEqual(bc.derived.excludedAndQuarantined, ["V10755"]);
  assert.equal(bc.derived.excludedRelativeAreaDelta, 0.03167100456325357);
  assert.match(bc.release, /never claim 217-feature geometry coverage/i);
});

test("Ontario admits all 188 derived geometries with nine repairs and no exclusion", () => {
  const ontario = record.sources.find(({id}) => id === "on-fire-disturbance");
  assert.equal(ontario.derived.unchanged, 179);
  assert.equal(ontario.derived.repairedCount, 9);
  assert.deepEqual(ontario.derived.excludedAndQuarantined, []);
});

test("operational semantics keep point sources snapshot-only and provincial sources authoritative", () => {
  assert.match(record.sources.find(({id}) => id === "cwfis-current").release, /not real-time.*not a complete incident or perimeter inventory/i);
  assert.match(record.sources.find(({id}) => id === "ab-wildfire").release, /not real-time.*not a complete perimeter dataset/i);
  assert.match(record.refreshAndAuthority.precedence, /provincial.*prevails over CWFIS/i);
});

test("only six exact immutable readbacks can satisfy the archive prerequisite", () => {
  const evidence = {
    schemaVersion: "witness-tree/current-wildfire-immutable-readbacks/1",
    region: "ca-central-1",
    objects: requiredCurrentWildfireObjects.map((object, index) => ({...object,versionId:`version-${index}-exact`,fullObjectChecksumVerified:true,exactVersionReadback:true,retention:{mode:"COMPLIANCE",retainUntil:"2033-08-12T00:00:00Z",readbackVerified:true}}))
  };
  assert.equal(remoteEvidenceSatisfiesCurrentWildfireGate(evidence), true);
  assert.equal(evaluateCurrentWildfireProductionEligibility(record, evidence), true);
  for (const mutation of [
    (candidate) => { candidate.objects[0].bytes += 1; },
    (candidate) => { candidate.objects[1].sha256 = "0".repeat(64); },
    (candidate) => { candidate.objects[2].exactVersionReadback = false; },
    (candidate) => { candidate.objects[3].retention.mode = "GOVERNANCE"; },
    (candidate) => { candidate.objects[4].retention.retainUntil = "2033-08-11T23:59:59Z"; },
    (candidate) => { candidate.objects.pop(); }
  ]) {
    const changed = structuredClone(evidence); mutation(changed);
    assert.equal(remoteEvidenceSatisfiesCurrentWildfireGate(changed), false);
    assert.equal(evaluateCurrentWildfireProductionEligibility(record, changed), false);
  }
});

test("the six-object gate recognizes only the timestamped derived promotion keys", () => {
  const plan = validateDerivedPromotionPlan();
  const expectedKeys = new Map(plan.artifacts.map(({sourceId, payloadKey}) => [sourceId, payloadKey]));
  const derived = requiredCurrentWildfireObjects.filter(({id}) => id.endsWith("-derived"));
  assert.deepEqual(derived.map(({id, key}) => [id.replace(/-derived$/, ""), key]), [...expectedKeys.entries()]);

  const evidence = {
    schemaVersion: "witness-tree/current-wildfire-immutable-readbacks/1",
    region: "ca-central-1",
    objects: requiredCurrentWildfireObjects.map((object, index) => ({...object,versionId:`version-${index}-exact`,fullObjectChecksumVerified:true,exactVersionReadback:true,retention:{mode:"COMPLIANCE",retainUntil:"2033-08-12T00:00:00Z",readbackVerified:true}}))
  };
  assert.equal(remoteEvidenceSatisfiesCurrentWildfireGate(evidence), true);

  for (const [id, key] of [
    ["bc-wildfire-derived", "derived/bc-wildfire/geometry-policy-v1/2026-08-14/8ee36cc6bdfb5ef267340537e4cf822df7cc886873c7fcf65a1b2b12006d34ce/payload/bc-wildfire-216-feature-release.gpkg"],
    ["on-fire-disturbance-derived", "derived/on-fire-disturbance/geometry-policy-v1/2026-08-14/5e55c5d47559c350d9b31ffeda6bd39cfce64a3c57169098fff66341cd8ead31/payload/ontario-in-year-fire-perimeters-188-feature-derived.gpkg"]
  ]) {
    const shorterVariant = structuredClone(evidence);
    shorterVariant.objects.find((object) => object.id === id).key = key;
    assert.equal(remoteEvidenceSatisfiesCurrentWildfireGate(shorterVariant), false);
  }
});

test("approval drift or premature eligibility fails closed", () => {
  const changed = structuredClone(record); changed.ownerDecision.geometryApproved = false;
  assert.throws(() => validateCurrentWildfireOwnerAdmission(changed, ledger, profiles, policies));
  const eligible = structuredClone(record); eligible.pipeline.productionEligible = true;
  assert.throws(() => validateCurrentWildfireOwnerAdmission(eligible, ledger, profiles, policies));
});
