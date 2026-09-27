#!/usr/bin/env node
// Records the owner's admission of the 2026-09-26 Phase 4 matching run, then
// its bilingual publication and its release, each binding the SHA-256 of the
// records before it, and rebinds the Phase 4 exit record to the bundle.
//
// The owner's decision is quoted as given in the working session. The outside
// provincial review was retired by the owner the same day
// (data/phase-scope-decision-2026-09-26.json), so the release names no review.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { "decided-at": { type: "string" } } });
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(values["decided-at"] ?? "")) throw new Error("--decided-at must be a UTC timestamp");
const sha = async (file) => createHash("sha256").update(await readFile(path.join(ROOT, file))).digest("hex");
const write = async (file, value) => { await writeFile(path.join(ROOT, file), `${JSON.stringify(value, null, 1)}\n`); return { path: file, sha256: await sha(file) }; };

const REPORT = "data/phase4-provincial-matching-report.json";
const ADMISSION = "data/phase4-provincial-matching-admission-2026-09-26.json";
const PUBLICATION = "data/phase4-provincial-matching-publication-2026-09-26.json";
const RELEASE = "data/phase4-provincial-matching-release-2026-09-26.json";
const METHODS = ["lib/phase4/methods-matching-en.ts", "lib/phase4/methods-matching-fr.ts"];

const report = JSON.parse(await readFile(path.join(ROOT, REPORT), "utf8"));
if (report.status !== "admitted-production") throw new Error("Build the report with --admitted first.");
const reportSha = await sha(REPORT);

const admission = await write(ADMISSION, {
  schemaVersion: "witness-tree/phase4-provincial-matching-admission/1",
  status: "recorded-production-admission",
  claims: { admitted: true, released: false, productionEligible: true },
  runId: report.runId,
  reportSha256: reportSha,
  scope: report.scope,
  inputBindings: report.inputBindings,
  sourceRightsVerified: true,
  sourceEvidenceAdmitted: true,
  sourceTransformationApproved: true,
  sourceReleaseApproved: true,
  changeGeometryMaterialized: true,
  ownerDecision: {
    decision: "approve",
    isHuman: true,
    name: "Chinonso Obeta",
    role: "Owner, Witness Tree",
    decidedAt: values["decided-at"],
    rationale: "The owner approved admission of the 2026-09-26 BC and Québec provincial matching run in the working session, in these words: \"I approve admission of the run.\"",
  },
  note: "This admits the matching run's source evidence, record transformation and release. It does not admit the underlying provincial sources as general Phase 1 production rows, and no outside provincial review took place.",
});

const publication = await write(PUBLICATION, {
  schemaVersion: "witness-tree/phase4-provincial-matching-publication/1",
  status: "published-bilingual-production",
  released: true,
  productionEligible: true,
  reportSha256: reportSha,
  admissionSha256: admission.sha256,
  methodsPagePaths: METHODS,
  methodsPageRoutes: { en: "/en/methods", fr: "/fr/methodes" },
  matchRate: report.matchRate,
  nonMatchRate: report.nonMatchRate,
  nonMatchReasonDistribution: report.nonMatchReasonDistribution,
});

const release = await write(RELEASE, {
  schemaVersion: "witness-tree/phase4-provincial-matching-release/1",
  status: "released-production",
  released: true,
  productionEligible: true,
  version: "phase4-provincial-matching-v1 (2026-09-26)",
  reportSha256: reportSha,
  admissionSha256: admission.sha256,
  publicationSha256: publication.sha256,
  outsideReview: "retired by the owner on 2026-09-26; see data/phase-scope-decision-2026-09-26.json",
});

// Rebind the Phase 4 exit record to the bundle.
const exitFile = "data/phase4-exit-status.json";
const exit = JSON.parse(await readFile(path.join(ROOT, exitFile), "utf8"));
const bundle = [
  { path: REPORT, sha256: reportSha },
  admission,
  publication,
  release,
  ...(await Promise.all(METHODS.map(async (file) => ({ path: file, sha256: await sha(file) })))),
  ...report.inputBindings,
];
const gate = exit.exitCriteria.find((c) => c.id === "published-match-and-non-match-rates");
const keep = gate.evidence.filter((e) => !bundle.some((b) => b.path === e.path));
gate.evidence = [...keep, ...bundle];
gate.status = "pass";
gate.reason = "The 2026-09-26 BC and Québec matching run is admitted, published on the methods page in both languages, and released (phase4-provincial-matching-v1). 11.1% of 100,731,284 detected changes match an official record (56% by area). The outside provincial review was retired by the owner the same day and did not take place.";
exit.checkpoints = exit.checkpoints.filter((c) => c.id !== "outside-provincial-review");
const rights = exit.checkpoints.find((c) => c.id === "rights-and-admission");
rights.status = "pass";
rights.reason = "The admission record verifies source rights and admits the source evidence, the record transformation and the release; rights are recorded in data/bc-harvest-source-rights-2026-09-26.json.";
rights.evidence = bundle;
exit.removedCheckpoints = [{ id: "outside-provincial-review", decision: "data/phase-scope-decision-2026-09-26.json" }];
exit.completedCriteria = 4;
exit.percentage = 100;
exit.status = "complete";
await writeFile(path.join(ROOT, exitFile), `${JSON.stringify(exit, null, 2)}\n`);
console.log("admission", admission.sha256, "publication", publication.sha256, "release", release.sha256);
