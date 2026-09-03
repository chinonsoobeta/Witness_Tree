import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateExpertReviewEvidence } from "../scripts/check-phase2-v21-expert-review-evidence.mjs";
import { resolveRecordedDataPath } from "../scripts/data-root.mjs";

const root = new URL("..", import.meta.url).pathname;
const workflowPath = "data/phase2-v21-expert-review-workflow.json";
const workflowBytes = readFileSync(`${root}/${workflowPath}`);
const workflow = JSON.parse(workflowBytes);
const packetPath = resolveRecordedDataPath(workflow.packet.path) ?? `${root}/${workflow.packet.path}`;
const packet = JSON.parse(readFileSync(packetPath, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const binding = (path, bytes) => ({ path, sha256: digest(bytes), byteLength: bytes.length });
const workflowBinding = binding(workflowPath, workflowBytes);
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
    independenceAttestation: { independent: true, noConflict: true, attestedBy: id, attestedAt: reviewedAt },
  };
}

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
      independenceAttestation: { independent: true, noConflict: true, attestedBy: reviewer.id, attestedAt: reviewedAt },
    },
    yearOutcome: determinate ? "confirmed" : "indeterminate",
    attributionOutcome: determinate ? "not-confirmed" : "indeterminate",
    indeterminateReasons: reasonsFor(sample),
    notes: notesFor(sample),
  };
}

function createFixture({ mutateRoster = () => {}, mutateResults = () => {}, mutateEvidence = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wt-phase2-review-evidence-"));
  const rosterPath = join(dir, "approved-roster.json");
  const resultsPath = join(dir, "completed-results.json");
  const evidencePath = join(dir, "review-evidence.json");
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
  mutateRoster(roster);
  const rosterBytes = Buffer.from(JSON.stringify(roster));
  writeFileSync(rosterPath, rosterBytes);
  const rosterBinding = binding(rosterPath, rosterBytes);
  const results = {
    schemaVersion: "witness-tree/phase2-v21-expert-review-results/1",
    status: "completed",
    packet: workflow.packet,
    reviewerRoster: rosterBinding,
    results: packet.samples.map(resultFor),
  };
  mutateResults(results);
  const resultsBytes = Buffer.from(JSON.stringify(results));
  writeFileSync(resultsPath, resultsBytes);
  const evidence = {
    schemaVersion: "witness-tree/phase2-v21-expert-review-evidence/1",
    status: "completed",
    workflow: workflowBinding,
    packet: workflow.packet,
    reviewerRoster: rosterBinding,
    results: binding(resultsPath, resultsBytes),
    counts: {
      assigned: 400,
      completed: 400,
      perProvince: Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: 100 }])),
    },
    claims: {
      expertReviewCompleted: true,
      productAccuracyClaim: false,
      admittedInputs: false,
      productionEligible: false,
      released: false,
    },
  };
  mutateEvidence(evidence);
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return { dir, evidencePath };
}

function runFixture(options) {
  const fixture = createFixture(options);
  try {
    return execFileSync("node", ["scripts/check-phase2-v21-expert-review-evidence.mjs", "--evidence", fixture.evidencePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
}

test("default evidence check is incomplete without inventing a completed review", () => {
  const output = execFileSync("node", ["scripts/check-phase2-v21-expert-review-evidence.mjs"], { cwd: root, encoding: "utf8" });
  const summary = JSON.parse(output);
  assert.deepEqual(summary, {
    status: "ready-no-completion-evidence",
    totalAssigned: 400,
    totalCompleted: 0,
    provinces: {
      BC: { assigned: 100, completed: 0 },
      AB: { assigned: 100, completed: 0 },
      ON: { assigned: 100, completed: 0 },
      QC: { assigned: 100, completed: 0 },
    },
  });
});

test("checksum-bound evidence validates the real packet, approved human roster, results, and provincial counts", () => {
  const summary = JSON.parse(runFixture());
  assert.equal(summary.status, "completed");
  assert.equal(summary.totalAssigned, 400);
  assert.equal(summary.totalCompleted, 400);
  for (const province of provinces) assert.deepEqual(summary.provinces[province], { assigned: 100, completed: 100 });
  assert.deepEqual(summary.claims, { expertReviewCompleted: true, productAccuracyClaim: false, admittedInputs: false, productionEligible: false, released: false });
});

test("formal-gate validation requires durable repository evidence paths", () => {
  const fixture = createFixture();
  try {
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    assert.throws(() => validateExpertReviewEvidence(evidence, { requireRepositoryEvidence: true }), /durable repository data evidence/i);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("evidence rejects 400 all-indeterminate rows and indeterminate rows without substantive reasons", () => {
  assert.throws(() => runFixture({
    mutateResults: (results) => {
      for (const result of results.results) {
        result.yearOutcome = "indeterminate";
        result.attributionOutcome = "indeterminate";
      }
    },
  }), /all-indeterminate/);
  assert.throws(() => runFixture({ mutateResults: (results) => { delete results.results[1].indeterminateReasons.year; } }));
});

test("completion evidence fails closed on exact bindings, roster identity, notes, counts, and claim drift", () => {
  assert.throws(() => runFixture({ mutateEvidence: (evidence) => { evidence.counts.perProvince.BC.completed = 99; } }));
  assert.throws(() => runFixture({ mutateEvidence: (evidence) => { evidence.workflow.sha256 = "0".repeat(64); } }));
  assert.throws(() => runFixture({ mutateEvidence: (evidence) => { evidence.results.sha256 = "0".repeat(64); } }));
  assert.throws(() => runFixture({ mutateRoster: (roster) => { roster.reviewers[0].qualifications = ""; } }));
  assert.throws(() => runFixture({ mutateRoster: (roster) => { roster.reviewers[0].isHuman = false; } }));
  assert.throws(() => runFixture({ mutateRoster: (roster) => { roster.approval.approvedBy = "Unapproved owner"; } }));
  assert.throws(() => runFixture({ mutateRoster: (roster) => { roster.approval.approvedAt = "August 25, 2026"; } }));
  assert.throws(() => runFixture({ mutateResults: (results) => { results.results[1].notes.fr = "placeholder"; } }));
  assert.throws(() => runFixture({ mutateEvidence: (evidence) => { evidence.claims.admittedInputs = true; } }));
  assert.throws(() => runFixture({ mutateEvidence: (evidence) => { evidence.unboundedClaim = true; } }));
});
