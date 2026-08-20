import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1BecCustomDownloadRouteAudit } from "../scripts/check-phase1-bec-custom-download-route-audit.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const audit = read("phase1-bec-custom-download-route-audit");

test("BEC custom-download route records official metadata and remains blocked before order", () => {
  assert.equal(validatePhase1BecCustomDownloadRouteAudit(audit), audit);
  assert.equal(audit.official.resource.projection, "epsg3005");
  assert.equal(audit.artifact.acquired, false);
  assert.equal(audit.terms.accepted, false);
  assert.equal(audit.officialAlternativeExhaustionFile, "data/phase1-bec-public-alternative-exhaustion.json");
});
test("BEC route audit rejects invented package evidence or terms acceptance", () => {
  const packageEvidence = structuredClone(audit);
  packageEvidence.artifact.sha256 = "a".repeat(64);
  assert.throws(() => validatePhase1BecCustomDownloadRouteAudit(packageEvidence), /null/);
  const accepted = structuredClone(audit);
  accepted.terms.accepted = true;
  assert.throws(() => validatePhase1BecCustomDownloadRouteAudit(accepted), /false/);
});
