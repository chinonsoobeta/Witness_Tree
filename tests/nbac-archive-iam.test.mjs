import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { desiredPolicy, validateNbacArchiveIamDelta } from "../scripts/provision-nbac-archive-iam.mjs";

const delta = JSON.parse(readFileSync(new URL("../data/nbac-archive-iam-delta.json", import.meta.url), "utf8"));
const baseline = JSON.parse(readFileSync(new URL("./fixtures/nbac-archive-iam-baseline.json", import.meta.url), "utf8"));

test("NBAC IAM delta adds only two exact-key statements", () => {
  validateNbacArchiveIamDelta(delta);
  const desired = desiredPolicy(baseline, delta);
  assert.equal(desired.Statement.length, baseline.Statement.length + 2);
});

test("NBAC IAM delta rejects prohibited permissions and baseline drift", () => {
  const unsafe = structuredClone(delta);
  unsafe.statements[0].Action.push("s3:DeleteObject");
  assert.throws(() => validateNbacArchiveIamDelta(unsafe));
  const drift = structuredClone(baseline);
  drift.Statement[0].Action.push("s3:ListAllMyBuckets");
  assert.throws(() => desiredPolicy(drift, delta));
});

test("NBAC IAM delta rejects wildcard keys, extra actions and effect drift", () => {
  for (const mutate of [
    (value) => { value.statements[0].Resource[0] = value.statements[0].Resource[0].replace(/payload\/.+$/, "*"); },
    (value) => { value.statements[0].Action.push("s3:PutBucketPolicy"); },
    (value) => { value.statements[0].Effect = "Deny"; },
    (value) => { value.prohibitedActions = []; },
  ]) {
    const candidate = structuredClone(delta);
    mutate(candidate);
    assert.throws(() => validateNbacArchiveIamDelta(candidate));
  }
});
