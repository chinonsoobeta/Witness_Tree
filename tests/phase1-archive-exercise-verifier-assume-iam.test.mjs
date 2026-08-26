import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT, POLICY, ROLES, USER, policyFor, provision } from "../scripts/provision-phase1-archive-exercise-verifier-assume-iam.mjs";

function mock(initial = policyFor(ROLES.slice(0, 2))) {
  let live = structuredClone(initial);
  const writes = [];
  const aws = async (args) => {
    const [service, action] = args;
    if (`${service} ${action}` === "sts get-caller-identity") return { Account: ACCOUNT, Arn: `arn:aws:iam::${ACCOUNT}:root` };
    if (`${service} ${action}` === "iam get-user-policy") return { PolicyDocument: structuredClone(live) };
    if (`${service} ${action}` === "accessanalyzer validate-policy") return { findings: [] };
    if (`${service} ${action}` === "iam simulate-custom-policy") {
      const resource = args[args.indexOf("--resource-arns") + 1];
      return { EvaluationResults: [{ EvalDecision: resource.endsWith("/NotApproved") ? "implicitDeny" : "allowed" }] };
    }
    if (`${service} ${action}` === "iam put-user-policy") {
      assert.equal(args[args.indexOf("--user-name") + 1], USER);
      assert.equal(args[args.indexOf("--policy-name") + 1], POLICY);
      live = JSON.parse(args[args.indexOf("--policy-document") + 1]);
      writes.push(structuredClone(live));
      return {};
    }
    throw new Error(`unexpected ${service} ${action}`);
  };
  return { aws, writes, live: () => live };
}

test("dry-run proves only the missing verifier role and does not mutate", async () => {
  const state = mock();
  const result = await provision({ aws: state.aws });
  assert.equal(result.change, "add-verifier-role-only");
  assert.equal(state.writes.length, 0);
  assert.deepEqual(result.exactRoles, ROLES);
});

test("apply adds only the verifier role and reads back", async () => {
  const state = mock();
  const result = await provision({ aws: state.aws, apply: true });
  assert.equal(result.status, "applied-and-read-back");
  assert.equal(state.writes.length, 1);
  assert.deepEqual(state.live(), policyFor(ROLES));
});

test("unexpected live widening fails before mutation", async () => {
  const widened = policyFor([...ROLES, "UnexpectedRole"]);
  const state = mock(widened);
  await assert.rejects(provision({ aws: state.aws, apply: true }), /not the exact preserved/);
  assert.equal(state.writes.length, 0);
});
