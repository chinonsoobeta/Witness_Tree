import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const workflowPath = "data/phase2-v21-expert-review-workflow.json";
const workflowBytes = readFileSync(`${root}/${workflowPath}`);
const workflow = JSON.parse(workflowBytes);
const packetAvailable = existsSync(`${root}/${workflow.packet.path}`);
const packet = packetAvailable ? JSON.parse(readFileSync(`${root}/${workflow.packet.path}`, "utf8")) : { samples: [] };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const workflowBinding = { path: workflowPath, sha256: digest(workflowBytes), byteLength: workflowBytes.length };
const reviewedAt = "2026-08-25T12:00:00Z";
const provinces = ["BC", "AB", "ON", "QC"];

function reviewerFor(province) {
  const id = `reviewer-${province.toLowerCase()}`;
  return {
    id,
    name: `${province} Forest Scientist`,
    affiliation: "Canadian independent forest research unit",
    role: "provincial remote-sensing reviewer",
    qualifications: "Forest inventory and remote-sensing specialist with documented provincial review experience",
    isHuman: true,
    provinces: [province],
    approvalStatus: "approved",
    approvedAt: reviewedAt,
    independenceAttestation: {
      independent: true,
      noConflict: true,
      attestedBy: id,
      attestedAt: reviewedAt,
    },
  };
}

const roster = {
  schemaVersion: "witness-tree/phase2-v21-expert-reviewer-roster/1",
  status: "approved",
  approval: {
    approvedBy: "Chinonso Obeta",
    approvedRole: "content/data owner",
    approvedAt: reviewedAt,
    workflow: workflowBinding,
    packet: workflow.packet,
  },
  reviewers: provinces.map(reviewerFor),
};

function notesFor(sample) {
  return {
    en: `Inspected ${sample.id} for interval ${sample.interval}; the packet cell and source references were consulted before recording this review outcome.`,
    fr: `Échantillon ${sample.id} inspecté pour l’intervalle ${sample.interval}; la cellule du paquet et les références sources ont été consultées avant cette conclusion.`,
  };
}

function reasonsFor(sample) {
  return {
    year: {
      en: `The available evidence for ${sample.id} does not resolve the calendar year more precisely than the assigned interval, so the year remains indeterminate pending corroboration.`,
      fr: `Les éléments disponibles pour ${sample.id} ne permettent pas de préciser l’année au-delà de l’intervalle assigné; l’année demeure indéterminée en attendant une corroboration.`,
    },
    attribution: {
      en: `The interval raster and boundary record for ${sample.id} do not identify a causal agent, so attribution remains indeterminate pending independent evidence.`,
      fr: `Le raster d’intervalle et la limite pour ${sample.id} n’identifient pas d’agent causal; l’attribution demeure indéterminée en attendant une preuve indépendante.`,
    },
  };
}

function resultFor(sample) {
  const reviewer = reviewerFor(sample.province);
  const determinate = sample.selectionRank === 1;
  return {
    sampleId: sample.id,
    province: sample.province,
    sourceRecord: {
      rasterSha256: sample.raster.sha256,
      boundaryGeometrySha256: sample.boundary.boundaryGeometrySha256,
      verifiedAgainstPacketSourceRecords: true,
    },
    reviewer: {
      id: reviewer.id,
      role: reviewer.role,
      reviewedAt,
      independenceAttestation: {
        independent: true,
        noConflict: true,
        attestedBy: reviewer.id,
        attestedAt: reviewedAt,
      },
    },
    yearOutcome: determinate ? "confirmed" : "indeterminate",
    attributionOutcome: determinate ? "not-confirmed" : "indeterminate",
    indeterminateReasons: reasonsFor(sample),
    notes: notesFor(sample),
  };
}

function resultsFor(rosterPath, rosterBytes) {
  return {
    schemaVersion: "witness-tree/phase2-v21-expert-review-results/1",
    status: "completed",
    packet: workflow.packet,
    reviewerRoster: { path: rosterPath, sha256: digest(rosterBytes), byteLength: rosterBytes.length },
    results: packet.samples.map(resultFor),
  };
}

function invoke({ mutateDocument = () => {}, mutateRoster = () => {}, omitRoster = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wt-phase2-review-"));
  const rosterPath = join(dir, "roster.json");
  const syntheticRoster = structuredClone(roster);
  mutateRoster(syntheticRoster);
  const rosterBytes = Buffer.from(JSON.stringify(syntheticRoster));
  writeFileSync(rosterPath, rosterBytes);
  const document = resultsFor(rosterPath, rosterBytes);
  mutateDocument(document);
  const resultPath = join(dir, "results.json");
  writeFileSync(resultPath, JSON.stringify(document));
  try {
    const args = ["scripts/check-phase2-v21-expert-review-workflow.mjs", "--results", resultPath];
    if (!omitRoster) args.push("--roster", rosterPath);
    return execFileSync("node", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("canonical workflow is ready with exactly 100 assignments per province and no approved roster", { skip: !packetAvailable }, () => {
  const output = execFileSync("node", ["scripts/check-phase2-v21-expert-review-workflow.mjs"], { cwd: root, encoding: "utf8" });
  const summary = JSON.parse(output);
  assert.equal(summary.totalAssigned, 400);
  assert.equal(summary.totalCompleted, 0);
  for (const province of provinces) assert.deepEqual(summary.provinces[province], { assigned: 100, completed: 0 });
  assert.throws(() => execFileSync("node", ["scripts/check-phase2-v21-expert-review-workflow.mjs", "--results", "data/phase2-v21-expert-review-results.template.json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
});

test("only checksum-bound approved human roster coverage can aggregate all provincial assignments", { skip: !packetAvailable }, () => {
  const summary = JSON.parse(invoke());
  assert.equal(summary.totalCompleted, 400);
  for (const province of provinces) assert.equal(summary.provinces[province].completed, 100);
});

test("400 all-indeterminate rows cannot complete even with per-row reasons", { skip: !packetAvailable }, () => {
  assert.throws(() => invoke({
    mutateDocument: (document) => {
      for (const result of document.results) {
        result.yearOutcome = "indeterminate";
        result.attributionOutcome = "indeterminate";
      }
    },
  }), /all-indeterminate/);
});

test("workflow fails closed on omitted roster, unqualified identity, independence, notes, evidence, source binding, and incomplete assignment", { skip: !packetAvailable }, () => {
  assert.throws(() => invoke({ omitRoster: true }));
  for (const mutateDocument of [
    (document) => { document.results[0].sourceRecord.rasterSha256 = "0".repeat(64); },
    (document) => { document.results[0].notes.en = "placeholder"; },
    (document) => { delete document.results[1].indeterminateReasons.attribution; },
    (document) => { document.results[0].reviewer.independenceAttestation.independent = false; },
    (document) => { document.results[0].reviewer.role = "different reviewer role"; },
    (document) => { document.results.pop(); },
  ]) assert.throws(() => invoke({ mutateDocument }));
  for (const mutateRoster of [
    (document) => { document.reviewers[0].isHuman = false; },
    (document) => { document.reviewers[0].role = ""; },
    (document) => { delete document.reviewers[0].independenceAttestation; },
    (document) => { document.approval.workflow.sha256 = "0".repeat(64); },
    (document) => { document.reviewers = document.reviewers.filter((reviewer) => reviewer.provinces[0] !== "BC"); },
  ]) assert.throws(() => invoke({ mutateRoster }));
});
