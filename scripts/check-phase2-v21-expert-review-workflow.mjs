import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRecordedDataPath } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const resolveInputPath = (path) => resolveRecordedDataPath(path) ?? resolve(root, path);
const readJson = (path) => JSON.parse(readFileSync(resolveInputPath(path), "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const nonempty = (value, label) => assert.equal(typeof value === "string" && value.trim().length > 0, true, `${label} is required`);
const timestamp = (value, label) => {
  nonempty(value, label);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${label} must be a whole-second UTC timestamp`);
  assert.equal(new Date(value).toISOString(), value.replace("Z", ".000Z"), `${label} must be a real UTC instant`);
};

const workflow = readJson(`${root}/data/phase2-v21-expert-review-workflow.json`);
const template = readJson(`${root}/data/phase2-v21-expert-review-results.template.json`);
const rosterTemplate = readJson(`${root}/data/phase2-v21-expert-reviewer-roster.template.json`);
const workflowPath = "data/phase2-v21-expert-review-workflow.json";
const workflowBytes = readFileSync(`${root}/${workflowPath}`);
// The workflow declares the packet against the archive, not the repository. Joining it to the
// repository made it missing from any worktree, and the checker then ran in control-plane-only
// mode and never verified the packet at all, while reporting a status that reads like a
// deliberate scope rather than a path that failed to resolve.
const packetPath = resolveInputPath(workflow.packet.path);
const packetAvailable = existsSync(packetPath);
const packetBytes = packetAvailable ? readFileSync(packetPath) : null;
const packet = packetBytes ? JSON.parse(packetBytes) : null;
const provinces = ["BC", "AB", "ON", "QC"];
const resultSchema = "witness-tree/phase2-v21-expert-review-results/1";
const rosterSchema = "witness-tree/phase2-v21-expert-reviewer-roster/1";
const requiredOutcomes = new Set(workflow.reviewerResultSchema.allowedOutcomes);
const determinateOutcomes = new Set(["confirmed", "not-confirmed"]);
const minimumDeterminateOutcomesPerProvince = workflow.reviewerResultSchema.minimumDeterminateOutcomesPerProvince;
const minimumSubstantiveNoteCharacters = workflow.reviewerResultSchema.minimumSubstantiveNoteCharacters;
const placeholderOnly = /^(?:n\/?a|na|none|null|unknown|tbd|todo|placeholder|dummy|fake|test|example)$/i;
const syntheticMarker = /\b(?:synthetic|validator\s+fixture|test\s+(?:fixture|only)|not\s+(?:a\s+)?human\s+review|pas\s+une\s+preuve\s+d['’]examen|essai\s+synth[ée]tique)\b/i;

const assigned = new Map();
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} fields differ`);

function assertSubstantiveText(value, label) {
  nonempty(value, label);
  const text = value.trim();
  assert.equal(placeholderOnly.test(text), false, `${label} is a placeholder`);
  assert.equal(syntheticMarker.test(text), false, `${label} is synthetic or test-only`);
  assert.equal(text.length >= minimumSubstantiveNoteCharacters, true, `${label} must be substantive`);
  assert.equal((text.match(/[\p{L}\p{N}]/gu) ?? []).length >= 12, true, `${label} must contain substantive inspection detail`);
}

function assertReviewerText(value, label, minimumLength = 3) {
  nonempty(value, label);
  const text = value.trim();
  assert.equal(placeholderOnly.test(text), false, `${label} is a placeholder`);
  assert.equal(syntheticMarker.test(text), false, `${label} is synthetic or test-only`);
  assert.equal(text.length >= minimumLength, true, `${label} is too short to identify a qualified reviewer`);
  assert.equal((text.match(/[\p{L}]/gu) ?? []).length >= 2, true, `${label} must contain a human-readable identity or role`);
}

function validateBilingualNotes(notes, label) {
  assert(notes && typeof notes === "object", `${label} are required`);
  exactKeys(notes, ["en", "fr"], label);
  assertSubstantiveText(notes.en, `${label} English notes`);
  assertSubstantiveText(notes.fr, `${label} French notes`);
}

function validateIndeterminateReasons(result, label) {
  const reasons = result.indeterminateReasons;
  if (reasons !== undefined) {
    assert(reasons && typeof reasons === "object", `${label} indeterminate reasons must be an object`);
    assert.equal(Object.keys(reasons).every((key) => key === "year" || key === "attribution"), true, `${label} indeterminate reason fields differ`);
  }
  if (result.yearOutcome === "indeterminate") {
    assert(reasons?.year && typeof reasons.year === "object", `${label} indeterminate year reason is required`);
    validateBilingualNotes(reasons.year, `${label} indeterminate year reason`);
  }
  if (result.attributionOutcome === "indeterminate") {
    assert(reasons?.attribution && typeof reasons.attribution === "object", `${label} indeterminate attribution reason is required`);
    validateBilingualNotes(reasons.attribution, `${label} indeterminate attribution reason`);
  }
}

function validateIndependenceAttestation(attestation, label, reviewerId) {
  assert(attestation && typeof attestation === "object", `${label} is required`);
  exactKeys(attestation, ["independent", "noConflict", "attestedBy", "attestedAt"], label);
  assert.equal(attestation.independent, true, `${label} must state independent review`);
  assert.equal(attestation.noConflict, true, `${label} must attest no conflict of interest`);
  assert.equal(attestation.attestedBy, reviewerId, `${label} must identify the attesting reviewer`);
  timestamp(attestation.attestedAt, `${label} timestamp`);
}

function validateCanonicalWorkflow({ verifyPacket = true } = {}) {
  assert.equal(workflow.schemaVersion, "witness-tree/phase2-v21-expert-review-workflow/1");
  assert.equal(workflow.status, "ready-no-review-results");
  assert.deepEqual(workflow.assignment.provinces, provinces);
  assert.equal(workflow.assignment.requiredCandidatesPerProvince, 100);
  assert.equal(workflow.assignment.totalCandidates, 400);
  assert.equal(Number.isSafeInteger(minimumDeterminateOutcomesPerProvince) && minimumDeterminateOutcomesPerProvince > 0, true, "workflow must require determinate outcomes per province");
  assert.equal(Number.isSafeInteger(minimumSubstantiveNoteCharacters) && minimumSubstantiveNoteCharacters >= 1, true, "workflow must require substantive notes");
  assert.match(workflow.packet.sha256, /^[a-f0-9]{64}$/, "workflow packet checksum is invalid");
  assert.equal(Number.isSafeInteger(workflow.packet.byteLength) && workflow.packet.byteLength > 0, true, "workflow packet byte length is invalid");
  assert.deepEqual(template.packet, workflow.packet);
  assert.equal(template.schemaVersion, resultSchema); assert.equal(template.status, "not-started"); assert.deepEqual(template.results, []);
  assert.equal(rosterTemplate.schemaVersion, rosterSchema); assert.equal(rosterTemplate.status, "not-approved"); assert.deepEqual(rosterTemplate.reviewers, []);
  if (!verifyPacket) return { assigned: workflow.assignment.totalCandidates, perProvince: Object.fromEntries(provinces.map((province) => [province, workflow.assignment.requiredCandidatesPerProvince])), verificationMode: "control-plane-only" };
  // Naming only the recorded relative path left the failure unattributable: a
  // reader could not tell an absent archive from a missing repository file, and
  // the data-root sweep classified it "other" for that reason alone.
  assert.equal(packetAvailable, true, `review packet is required for artifact verification, and no such file or directory exists at ${packetPath} (recorded as ${workflow.packet.path})`);
  assert.equal(digest(packetBytes), workflow.packet.sha256, "workflow packet checksum differs");
  assert.equal(packetBytes.length, workflow.packet.byteLength, "workflow packet byte length differs");
  assert.equal(packet.samples.length, 400);
  assigned.clear();
  for (const province of provinces) {
    const samples = packet.samples.filter((sample) => sample.province === province).sort((a, b) => a.selectionRank - b.selectionRank || a.id.localeCompare(b.id));
    assert.equal(samples.length, 100, `${province} must have exactly 100 assigned candidates`);
    for (const stratum of packet.selection.strata) assert.equal(samples.filter((sample) => sample.stratum === stratum).length, 25, `${province}/${stratum} must have exactly 25 assigned candidates`);
    for (const sample of samples) assigned.set(sample.id, sample);
  }
  assert.equal(assigned.size, 400, "assignment IDs must be unique");
  return { assigned: 400, perProvince: Object.fromEntries(provinces.map((province) => [province, 100])), verificationMode: "artifact-readback" };
}

function validateApprovedRoster(document) {
  exactKeys(document, ["schemaVersion", "status", "approval", "reviewers"], "reviewer roster");
  assert.equal(document.schemaVersion, rosterSchema, "reviewer roster schema version differs");
  assert.equal(document.status, "approved", "reviewer roster must be owner-approved");
  assert.equal(document.approval?.approvedBy, "Chinonso Obeta", "reviewer roster must be approved by the named content/data owner");
  assert.equal(document.approval?.approvedRole, "content/data owner", "reviewer roster approval role differs");
  exactKeys(document.approval, ["approvedBy", "approvedRole", "approvedAt", "workflow", "packet"], "reviewer roster approval");
  timestamp(document.approval?.approvedAt, "roster approval timestamp");
  assert.deepEqual(document.approval?.workflow, {
    path: workflowPath,
    sha256: digest(workflowBytes),
    byteLength: workflowBytes.length,
  }, "reviewer roster approval must bind the exact workflow contract");
  assert.deepEqual(document.approval?.packet, workflow.packet, "reviewer roster approval must bind the exact real review packet");
  assert.equal(Array.isArray(document.reviewers), true, "reviewer roster must contain reviewers");
  const reviewers = new Map();
  for (const reviewer of document.reviewers) {
    exactKeys(reviewer, ["id", "name", "affiliation", "role", "qualifications", "isHuman", "provinces", "approvalStatus", "approvedAt", "independenceAttestation"], "reviewer");
    nonempty(reviewer.id, "reviewer ID"); assert.equal(reviewers.has(reviewer.id), false, `duplicate reviewer ID ${reviewer.id}`);
    assert.equal(reviewer.isHuman, true, `${reviewer.id} must identify a human reviewer`);
    assertReviewerText(reviewer.name, `${reviewer.id} name`, 5);
    assertReviewerText(reviewer.affiliation, `${reviewer.id} affiliation`, 5);
    assertReviewerText(reviewer.role, `${reviewer.id} role`, 5);
    assertReviewerText(reviewer.qualifications, `${reviewer.id} qualifications`, 20);
    assert.equal(reviewer.approvalStatus, "approved", `${reviewer.id} must be approved`); timestamp(reviewer.approvedAt, `${reviewer.id} approval timestamp`);
    validateIndependenceAttestation(reviewer.independenceAttestation, `${reviewer.id} independence attestation`, reviewer.id);
    assert.equal(Array.isArray(reviewer.provinces) && reviewer.provinces.length > 0, true, `${reviewer.id} province coverage is required`);
    for (const province of reviewer.provinces) assert(provinces.includes(province), `${reviewer.id} has invalid province coverage ${province}`);
    reviewers.set(reviewer.id, reviewer);
  }
  for (const province of provinces) assert([...reviewers.values()].some((reviewer) => reviewer.provinces.includes(province)), `no approved qualified reviewer covers ${province}`);
  return reviewers;
}

function validateCompletedResults(document, rosterPath) {
  exactKeys(document, ["schemaVersion", "status", "packet", "reviewerRoster", "results"], "completed result document");
  assert.equal(document.schemaVersion, resultSchema, "result schema version differs");
  assert.equal(document.status, "completed", "only a completed result document may be validated as review completion");
  assert.deepEqual(document.packet, workflow.packet, "results must bind the exact assigned packet");
  assert(document.reviewerRoster && typeof document.reviewerRoster === "object", "results must bind an approved reviewer roster");
  const rosterBytes = readFileSync(resolveInputPath(rosterPath)); const roster = readJson(rosterPath);
  assert.deepEqual(document.reviewerRoster, { path: rosterPath, sha256: digest(rosterBytes), byteLength: rosterBytes.length }, "results must bind the exact provided reviewer roster");
  const reviewers = validateApprovedRoster(roster);
  assert.equal(Array.isArray(document.results), true, "results must be an array");
  assert.equal(document.results.length, 400, "exactly one result per assigned candidate is required");
  const seen = new Set();
  const counts = Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: 0, yearOutcomes: {}, attributionOutcomes: {} }]));
  for (const result of document.results) {
    const resultKeys = ["sampleId", "province", "sourceRecord", "reviewer", "yearOutcome", "attributionOutcome", "notes", ...(Object.hasOwn(result, "indeterminateReasons") ? ["indeterminateReasons"] : [])];
    exactKeys(result, resultKeys, `${result.sampleId ?? "result"}`);
    const sample = assigned.get(result.sampleId);
    assert(sample, `result ${result.sampleId} is not assigned`);
    assert.equal(seen.has(result.sampleId), false, `duplicate result ${result.sampleId}`);
    seen.add(result.sampleId);
    assert.equal(result.province, sample.province, `${result.sampleId} province differs from assignment`);
    assert.deepEqual(result.sourceRecord, {
      rasterSha256: sample.raster.sha256,
      boundaryGeometrySha256: sample.boundary.boundaryGeometrySha256,
      verifiedAgainstPacketSourceRecords: true
    }, `${result.sampleId} must attest to its exact raster and boundary source records`);
    exactKeys(result.reviewer, ["id", "role", "reviewedAt", "independenceAttestation"], `${result.sampleId} reviewer`);
    nonempty(result.reviewer?.id, `${result.sampleId} reviewer ID`); timestamp(result.reviewer?.reviewedAt, `${result.sampleId} reviewer timestamp`);
    const reviewer = reviewers.get(result.reviewer.id); assert(reviewer, `${result.sampleId} reviewer is absent from approved roster`); assert(reviewer.provinces.includes(result.province), `${result.sampleId} reviewer is not approved for ${result.province}`);
    assert.equal(result.reviewer?.role, reviewer.role, `${result.sampleId} reviewer role must match the approved roster`);
    validateIndependenceAttestation(result.reviewer?.independenceAttestation, `${result.sampleId} reviewer independence attestation`, result.reviewer.id);
    assert.equal(result.reviewer.independenceAttestation.attestedAt, result.reviewer.reviewedAt, `${result.sampleId} attestation and review timestamps must match`);
    assert(requiredOutcomes.has(result.yearOutcome), `${result.sampleId} year outcome is invalid`);
    assert(requiredOutcomes.has(result.attributionOutcome), `${result.sampleId} attribution outcome is invalid`);
    validateBilingualNotes(result.notes, result.sampleId);
    validateIndeterminateReasons(result, result.sampleId);
    const count = counts[result.province]; count.completed += 1;
    count.yearOutcomes[result.yearOutcome] = (count.yearOutcomes[result.yearOutcome] ?? 0) + 1;
    count.attributionOutcomes[result.attributionOutcome] = (count.attributionOutcomes[result.attributionOutcome] ?? 0) + 1;
  }
  assert.equal(seen.size, assigned.size, "every assigned candidate requires one completed result");
  for (const province of provinces) {
    assert.equal(counts[province].completed, 100, `${province} must have 100 completed results`);
    const determinateYear = [...determinateOutcomes].reduce((sum, outcome) => sum + (counts[province].yearOutcomes[outcome] ?? 0), 0);
    const determinateAttribution = [...determinateOutcomes].reduce((sum, outcome) => sum + (counts[province].attributionOutcomes[outcome] ?? 0), 0);
    assert.equal(determinateYear >= minimumDeterminateOutcomesPerProvince, true, `${province} cannot complete with all-indeterminate year outcomes`);
    assert.equal(determinateAttribution >= minimumDeterminateOutcomesPerProvince, true, `${province} cannot complete with all-indeterminate attribution outcomes`);
  }
  return { status: "completed", totalAssigned: 400, totalCompleted: 400, provinces: counts };
}

function main() {
  const assignment = validateCanonicalWorkflow({ verifyPacket: packetAvailable });
  const resultFlag = process.argv.indexOf("--results");
  if (resultFlag === -1) {
    console.log(JSON.stringify({ status: packetAvailable ? "ready-no-review-results" : "ready-no-review-results-control-plane-only", verificationMode: assignment.verificationMode, totalAssigned: assignment.assigned, totalCompleted: 0, provinces: Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: 0 }])) }, null, 2));
  } else {
    assert(resultFlag + 1 < process.argv.length, "--results requires a JSON path");
    const rosterFlag = process.argv.indexOf("--roster"); assert(rosterFlag >= 0 && rosterFlag + 1 < process.argv.length, "--results requires a separate --roster JSON path");
    const summary = validateCompletedResults(readJson(process.argv[resultFlag + 1]), process.argv[rosterFlag + 1]);
    console.log(JSON.stringify(summary, null, 2));
  }
}

export {
  determinateOutcomes,
  digest,
  minimumDeterminateOutcomesPerProvince,
  resolveInputPath,
  validateApprovedRoster,
  validateCanonicalWorkflow,
  validateCompletedResults,
  workflow,
};

if (process.argv[1] && resolve(process.argv[1]) === resolveInputPath("scripts/check-phase2-v21-expert-review-workflow.mjs")) main();
