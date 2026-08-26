import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validatePhase2RealNationalPreflight } from "../scripts/check-phase2-real-national-preflight.mjs";

const names = ["phase2-real-national-preflight.json", "phase2-real-data-owner-decision.json", "vlce2-promotion-preparation.json", "nrcan-harvest-profile.json", "nrcan-wildfire-profile.json", "phase2-method-parameters.json", "raster-grid.json"];
const files = await Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"))));
const context = { decision: files[1], preparation: files[2], harvest: files[3], wildfire: files[4], method: files[5], grid: files[6] };
const fixture = () => structuredClone(files[0]);

test("records exact source-backed local verification and bounded readiness", () => {
  const record = validatePhase2RealNationalPreflight(fixture(), context);
  assert.equal(record.sourceVerification.verifiedInputCount, 41);
  assert.equal(record.claims.realExecutionStarted, false);
});

test("rejects checksum-set drift, a removed blocker, false execution, or expanded maturity", () => {
  const checksum = fixture(); checksum.sourceVerification.inputSetSha256 = "0".repeat(64);
  assert.throws(() => validatePhase2RealNationalPreflight(checksum, context));
  const blocker = fixture(); blocker.blockers.push({id:"invented"});
  assert.throws(() => validatePhase2RealNationalPreflight(blocker, context));
  const execution = fixture(); execution.claims.realExecutionStarted = true;
  assert.throws(() => validatePhase2RealNationalPreflight(execution, context));
  const maturity = fixture(); maturity.maturity.fixedRubricPercentAfter = 44;
  assert.throws(() => validatePhase2RealNationalPreflight(maturity, context));
});
