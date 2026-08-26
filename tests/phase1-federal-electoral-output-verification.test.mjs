import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_DATA_ROOT,
  OUTPUT_RELATIVE_PATH,
  REPO_ROOT,
  SPEC_PATH,
  canonicalJson,
  validateSidecarDocument,
} from "../scripts/check-phase1-federal-electoral-output.mjs";

const outputPath = path.resolve(DEFAULT_DATA_ROOT, OUTPUT_RELATIVE_PATH);
const sidecarPath = outputPath + ".sidecar.json";
const outputBytes = readFileSync(outputPath);
const sidecarRaw = readFileSync(sidecarPath, "utf8");
const sidecar = JSON.parse(sidecarRaw);
const spec = JSON.parse(readFileSync(path.join(REPO_ROOT, SPEC_PATH), "utf8")).specifications.find(({ id }) => id === "federal-electoral-districts-2023-v1");
const contract = {
  outputSha256: sidecar.outputSha256,
  outputByteLength: outputBytes.length,
  expectedInputBindings: spec.inputBindings,
  expectedOutputPath: sidecar.output.path,
};

test("completed sidecar is canonical and output-bound", () => {
  assert.doesNotThrow(() => validateSidecarDocument(sidecar, sidecarRaw, contract));
  assert.equal(sidecarRaw, canonicalJson(sidecar) + "\n");
});

test("tampered sidecar output hash is rejected", () => {
  const tampered = { ...sidecar, outputSha256: "0".repeat(64) };
  assert.throws(() => validateSidecarDocument(tampered, canonicalJson(tampered) + "\n", contract), /hash\/length/);
});

test("tampered sidecar bytes are rejected even when parsed values are unchanged", () => {
  const tamperedRaw = sidecarRaw.replace("\n", " \n");
  assert.throws(() => validateSidecarDocument(sidecar, tamperedRaw, contract), /canonical deterministic JSON/);
});

test("tampered feature-count contract is rejected", () => {
  const tampered = { ...sidecar, output: { ...sidecar.output, featureCount: 351 } };
  assert.throws(() => validateSidecarDocument(tampered, canonicalJson(tampered) + "\n", contract), /output contract/);
});
