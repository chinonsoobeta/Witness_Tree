import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateQcProductionTransformationSpecs } from "../scripts/check-qc-production-transformation-specs.mjs";

const files = ["qc-current-ecoforest-stand-copy-v1.json", "qc-original-current-inventory-stand-copy-v1.json", "qc-fourth-inventory-preflight-v1.json"];
const specs = files.map((file) => ({ file, value: JSON.parse(readFileSync(new URL(`../data/transformation-specs/${file}`, import.meta.url), "utf8")) }));

test("Québec production transformation specifications are checksum-bound and not admitted", () => {
  assert.equal(validateQcProductionTransformationSpecs(specs), specs);
});
test("Québec specifications fail closed for source drift, unapproved joins, fourth-inventory selection, or admission", () => {
  const checksum = structuredClone(specs); checksum[0].value.sourceBinding.rawArchiveSha256 = "0".repeat(64);
  assert.throws(() => validateQcProductionTransformationSpecs(checksum), /exact source bytes/i);
  const joined = structuredClone(specs); joined[0].value.operation.joins = "join anything";
  assert.throws(() => validateQcProductionTransformationSpecs(joined), /prohibit unapproved joins/i);
  const crs = structuredClone(specs); crs[1].value.input.crs = "EPSG:4326";
  assert.throws(() => validateQcProductionTransformationSpecs(crs), /input schema drifted/i);
  const geometry = structuredClone(specs); geometry[0].value.operation.geometry = "Repair and reproject every geometry.";
  assert.throws(() => validateQcProductionTransformationSpecs(geometry), /prohibit every geometry alteration/i);
  const decision = structuredClone(specs); decision[1].value.ownerDecision.doesNotDecide = ["ingestion"];
  assert.throws(() => validateQcProductionTransformationSpecs(decision), /owner-decision-ready/i);
  const selection = structuredClone(specs); selection[2].value.preflightOnly.forbidden = selection[2].value.preflightOnly.forbidden.filter((value) => value !== "selecting a result view");
  assert.throws(() => validateQcProductionTransformationSpecs(selection), /prohibit semantic selection/i);
  const fourthOutput = structuredClone(specs); fourthOutput[2].value.output = { layer: "selected_result" };
  assert.throws(() => validateQcProductionTransformationSpecs(fourthOutput), /must not select or define a transformation output/i);
  const admitted = structuredClone(specs); admitted[1].value.admission.productionEligible = true;
  assert.throws(() => validateQcProductionTransformationSpecs(admitted), /must not imply admission/i);
});
