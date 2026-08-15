import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1ImmutablePromotionReadiness } from "../scripts/check-phase1-immutable-promotion-readiness.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const args = [read("data/phase1-immutable-promotion-readiness.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-local-profiled-promotion-preparation.json"), read("data/current-wildfire-immutable-promotion-preparation.json"), read("data/qc-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-evidence.json")];

test("immutable-promotion readiness accounts for every local-profiled row without duplicate work", () => {
  assert.equal(validatePhase1ImmutablePromotionReadiness(...args), args[0]);
  assert.equal(args[0].coveredProductionRowIds.length, 11);
  assert.equal(args[0].physicalArtifactGroups.find((group) => group.id === "national-three-artifacts").physicalArtifactCount, 3);
});

test("the fourth-inventory archive remains fail-closed until every sheet has exact promotion inputs", () => {
  const missing = structuredClone(args[0]); missing.physicalArtifactGroups.at(-1).status = "already-prepared";
  assert.throws(() => validatePhase1ImmutablePromotionReadiness(missing, ...args.slice(1)));
  const claim = structuredClone(args[0]); claim.claims.immutableObjectStorage = true;
  assert.throws(() => validatePhase1ImmutablePromotionReadiness(claim, ...args.slice(1)));
});
