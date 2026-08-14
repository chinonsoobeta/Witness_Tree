import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAlbertaPlviFullReleaseReadiness } from "../scripts/check-alberta-plvi-full-release-readiness.mjs";

const record = JSON.parse(readFileSync(new URL("../data/alberta-plvi-full-release-readiness.json", import.meta.url), "utf8"));

test("PLVI full release preserves the closed join and stays local", () => {
  assert.equal(validateAlbertaPlviFullReleaseReadiness(record), record);
  assert.equal(record.closedJoin.outputFeatureCount, record.closedJoin.inputFeatureCount);
  assert.equal(record.derivedOutput.invalidGeometryCount, 0);
});

test("PLVI full release fails closed on loss, repair drift, or premature promotion", () => {
  assert.throws(() => validateAlbertaPlviFullReleaseReadiness({...record, closedJoin: {...record.closedJoin, outputFeatureCount: 1}}), /closed join/);
  assert.throws(() => validateAlbertaPlviFullReleaseReadiness({...record, derivedOutput: {...record.derivedOutput, invalidGeometryCount: 1}}), /complete, valid/);
  assert.throws(() => validateAlbertaPlviFullReleaseReadiness({...record, immutableObjectStorage: true}), /must not claim/);
  assert.throws(() => validateAlbertaPlviFullReleaseReadiness({...record, ownerAdmission: {...record.ownerAdmission, admitted: true}}), /must not claim/);
});
