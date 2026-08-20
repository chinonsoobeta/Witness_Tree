import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1OntarioFriTerm2RouteExhaustion } from "../scripts/check-phase1-ontario-fri-term2-route-exhaustion.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-ontario-fri-term2-route-exhaustion.json", import.meta.url), "utf8"));

test("Ontario FRI Term 2 official routes remain no-complete-package and sample-only", () => {
  assert.equal(validatePhase1OntarioFriTerm2RouteExhaustion(record), record);
  assert.equal(record.officialSources.catalogueApi.resourceCount, 2);
  assert.equal(record.coverage.fmuIndex.featureCount, 39);
  assert.equal(record.coverage.pilotBoundary.fmuCode, "930");
  assert.equal(record.findings.completeTerm2PackageAvailable, false);
  assert.equal(record.phase1Impact.rawEvidenceCreditImpact, 0);
});

test("Ontario FRI route gate rejects fabricated package, checksum, rights, or promotion", () => {
  const complete = structuredClone(record);
  complete.findings.completeTerm2PackageAvailable = true;
  assert.throws(() => validatePhase1OntarioFriTerm2RouteExhaustion(complete), /must be false/);

  const checksum = structuredClone(record);
  checksum.artifacts[0].sha256 = "a".repeat(64);
  assert.throws(() => validatePhase1OntarioFriTerm2RouteExhaustion(checksum), /SHA-256/);

  const rights = structuredClone(record);
  rights.rights.exactPackageReuseConfirmed = true;
  assert.throws(() => validatePhase1OntarioFriTerm2RouteExhaustion(rights), /must be false/);

  const promoted = structuredClone(record);
  promoted.phase1Impact.sourceLedgerChanged = true;
  assert.throws(() => validatePhase1OntarioFriTerm2RouteExhaustion(promoted), /must be false/);
});
