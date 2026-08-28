import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED, githubActionsReceipt, RELEASE_ID } from "../scripts/check-phase8-bulk-download-independent-retrieval.mjs";
import { validateIndependentReceipt } from "../scripts/check-phase8-bulk-download-publication.mjs";

const artifacts = Object.fromEntries(Object.entries(EXPECTED).map(([name, expected]) => [name, {
  ...expected,
  retrievedByteLength: expected.byteLength,
  retrievedSha256: expected.sha256,
  publicStatus: 200,
  accessControlAllowOrigin: "*",
}]));

const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "chinonsoobeta/Witness_Tree",
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_WORKFLOW: "CI",
  RUNNER_OS: "Linux",
  RUNNER_ARCH: "X64",
};

test("only a separate GitHub Actions runner can issue the independent receipt", () => {
  assert.throws(() => githubActionsReceipt(artifacts, { ...env, GITHUB_ACTIONS: "false" }), /GitHub Actions/);
  const receipt = githubActionsReceipt(artifacts, env);
  assert.equal(receipt.releaseId, RELEASE_ID);
  assert.equal(validateIndependentReceipt(receipt), receipt);
});

test("the independent receipt rejects producer context and artifact drift", () => {
  const receipt = githubActionsReceipt(artifacts, env);
  assert.throws(() => validateIndependentReceipt({ ...receipt, retrievalContext: "owner-local-producing-machine" }), /github-hosted-runner/);
  const changed = structuredClone(receipt);
  changed.artifacts.csv.retrievedSha256 = "0".repeat(64);
  assert.throws(() => validateIndependentReceipt(changed));
});
