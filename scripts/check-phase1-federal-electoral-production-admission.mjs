import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = "data/phase1-federal-electoral-production-admission.json";
const OUTPUT = "../Witness_Tree-data/derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg";
const OUTPUT_SHA = "ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05";
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const read = (root, relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));

export function validate(record, root = ROOT) {
  assert.equal(record.schemaVersion, "witness-tree/phase1-production-admission/1");
  assert.equal(record.status, "owner-approved-admitted-and-release-approved");
  assert.equal(record.decisionId, "phase1-federal-electoral-2023-production-admission-v1");
  assert.deepEqual(record.ownerAuthorization, {
    ownerName: "Chinonso Obeta",
    statement: "I explicitly authorize ingestion, release, production admission, and deployment.",
    decision: "approve",
  });
  assert.deepEqual(record.rows, ["fed-2023-ridings", "elections-canada-45th-files"]);
  for (const binding of record.evidenceBindings) {
    assert.match(binding.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha(path.join(root, binding.path)), binding.sha256, `evidence drift: ${binding.path}`);
  }
  const source = read(root, "data/elections-canada-fed-2025-source-ledger.json").source;
  assert.equal(source.representationOrder, "2023");
  assert.match(source.currentEditionBasis, /came into effect on 2025-03-23/);
  assert.equal(source.licence.id, "ogl-canada-2.0");
  assert.equal(source.licence.requiredAttribution, record.requiredAttribution);
  const output = path.resolve(root, "../../Witness_Tree-data", record.sharedArtifact.path.replace(/^\.\.\/Witness_Tree-data\//, ""));
  assert.equal(record.sharedArtifact.path, OUTPUT);
  assert.equal(record.sharedArtifact.sha256, OUTPUT_SHA);
  assert.equal(statSync(output).size, record.sharedArtifact.byteLength);
  assert.equal(sha(output), OUTPUT_SHA);
  assert.equal(record.sharedArtifact.layer, "federal_electoral_districts_2023");
  assert.equal(record.sharedArtifact.featureCount, 352);
  assert.equal(record.sharedArtifact.distinctDistrictCount, 343);
  assert.equal(record.ledgerFields.editionEffectiveDate, "2025-03-23");
  assert.equal(record.ledgerFields.transformations.methodVersion, "phase1-federal-electoral-districts-2023-v1");
  assert.equal(record.ledgerFields.transformations.outputSha256, OUTPUT_SHA);
  assert.match(record.ledgerFields.redistributionStatus, /ogl-canada-2\.0.*attribution/);
  assert.ok(record.ledgerFields.plainLanguageExplanation.en);
  assert.ok(record.ledgerFields.plainLanguageExplanation.fr);
  assert.match(record.ledgerFields.updateCadence, /no fixed calendar cadence/);
  assert.equal(record.ledgerFields.nextExpectedRefresh.status, "unknown");
  assert.ok(record.ledgerFields.nextExpectedRefresh.reason);
  assert.equal(record.ledgerFields.bulkRedistributionAllowed, true);
  assert.equal(record.ledgerFields.correctionContactRoute.internalEn, "/en/corrections");
  assert.equal(record.ledgerFields.correctionContactRoute.internalFr, "/fr/corrections");
  assert.equal(record.ledgerFields.admissionState, true);
  assert.deepEqual(record.decisions, {
    ingestionApproved: true,
    releaseApproved: true,
    productionAdmission: true,
    productionEligible: true,
    deploymentAuthorized: true,
  });
  assert.ok(record.limits.some((value) => /separate French publisher archive remains an open/i.test(value)));
  assert.doesNotMatch(JSON.stringify(record), /traditional territory dataset is admitted|electoral result is admitted/i);
  return record;
}

export function check(root = ROOT) {
  return validate(read(root, RECORD), root);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  check();
  console.log("Federal electoral production admission is exact, rights-bound, output-bound, and retains the French-archive limitation.");
}
