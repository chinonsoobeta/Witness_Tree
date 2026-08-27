import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { manifestFor, validateNbacImmutablePromotionPreparation } from "../scripts/prepare-nbac-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/nbac-immutable-promotion-preparation.json", import.meta.url), "utf8"));

test("NBAC immutable preparation binds exact payload and deletion-free role scope", () => {
  assert.equal(validateNbacImmutablePromotionPreparation(plan), plan);
  assert.match(manifestFor(plan), /c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/);
});

test("preparation rejects payload drift and premature archive claims", () => {
  const drift = structuredClone(plan);
  drift.artifact.sha256 = "0".repeat(64);
  assert.throws(() => validateNbacImmutablePromotionPreparation(drift));
  const claim = structuredClone(plan);
  claim.claims.immutableArchive = true;
  assert.throws(() => validateNbacImmutablePromotionPreparation(claim));
});

test("preparation rejects provenance and exact-key drift", () => {
  for (const mutate of [
    (value) => { value.artifact.payloadKey = `raw/other/${value.artifact.payloadKey}`; value.rolePolicyDelta.objectKeys[0] = value.artifact.payloadKey; },
    (value) => { value.artifact.sourceVersion = "latest"; },
    (value) => { value.artifact.capturedAt = "2026-08-27T18:17:42Z"; },
    (value) => { value.artifact.localPath = "raw/elsewhere.zip"; },
  ]) {
    const candidate = structuredClone(plan);
    mutate(candidate);
    assert.throws(() => validateNbacImmutablePromotionPreparation(candidate));
  }
});

test("role scope cannot gain delete or bypass permission", () => {
  for (const action of ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "iam:*"]) {
    const candidate = structuredClone(plan);
    candidate.rolePolicyDelta.actions.push(action);
    assert.throws(() => validateNbacImmutablePromotionPreparation(candidate));
  }
});
