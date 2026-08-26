import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";

const CRITERIA = new Map([
  ["pending-or-uncorroborated-active-not-recorded-harvest", "PENDING or uncorroborated ACTIVE never renders as recorded harvest"],
  ["quebec-north-of-52-national-baseline", "Québec north of 52 grades national baseline, not enhanced"],
  ["published-match-and-non-match-rates", "Match rate, non-match rate, and non-match-reason distribution are published on the methods page"],
  ["subtypes-distinguished-or-undetermined", "Salvage, partial cut, and thinning are distinguished where supported and undetermined otherwise"],
]);
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const REPORT_SCHEMA = "witness-tree/phase4-provincial-matching-report/1";
const ADMISSION_SCHEMA = "witness-tree/phase4-provincial-matching-admission/1";
const PUBLICATION_SCHEMA = "witness-tree/phase4-provincial-matching-publication/1";
const RELEASE_SCHEMA = "witness-tree/phase4-provincial-matching-release/1";
const REVIEW_SCHEMA = "witness-tree/phase4-provincial-matching-outside-review/1";
const CHECKPOINTS = new Map([
  ["rights-and-admission", "Rights/admission"],
  ["outside-provincial-review", "Outside provincial review"],
]);

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

function inside(root, target) {
  const child = relative(root, target);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function validSha(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function readEvidenceFile(item) {
  requiredString(item?.path, "Evidence path");
  if (isAbsolute(item.path)) throw new Error("Evidence paths must be repository-relative.");
  if (!validSha(item?.sha256)) throw new Error("Evidence SHA-256 is invalid.");
  const target = resolve(REPOSITORY_ROOT, item.path);
  if (!inside(REPOSITORY_ROOT, target)) throw new Error("Evidence must remain inside the repository.");
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    throw new Error(`Evidence file cannot be read: ${item.path}.`, { cause: error });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Evidence must be a regular non-symlink file: ${item.path}.`);
  const repositoryRealpath = await realpath(REPOSITORY_ROOT);
  const targetRealpath = await realpath(target);
  if (!inside(repositoryRealpath, targetRealpath)) throw new Error("Evidence realpath must remain inside the repository.");
  const bytes = await readFile(target);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  return { path: item.path, sha256: item.sha256, text: bytes.toString("utf8") };
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Each Phase 4 criterion requires checksum-bound evidence.");
  const seen = new Set();
  const files = [];
  for (const item of evidence) {
    if (seen.has(item?.path)) throw new Error("Phase 4 evidence paths must be unique.");
    seen.add(item?.path);
    files.push(await readEvidenceFile(item));
  }
  return files;
}

function hasEvidence(files, ...paths) {
  const byPath = new Set(files.map(({ path }) => path));
  return paths.every((path) => byPath.has(path));
}

function textFor(files, path) {
  return files.find((item) => item.path === path)?.text ?? "";
}

function parseJsonEvidence(files) {
  return files.flatMap((item) => {
    if (!item.path.endsWith(".json")) return [];
    try {
      return [{ ...item, value: JSON.parse(item.text) }];
    } catch {
      return [];
    }
  });
}

function finiteRate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function integer(value) {
  return Number.isInteger(value) && value >= 0;
}

function exactObject(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

const PLACEHOLDER_IDENTITY = /\b(?:placeholder|example|fake|dummy|unknown|test(?:ing)?|tbd|n\/a|reviewer\s*\d+|owner\s*\d+)\b/i;

function testOnlyEvidence(files) {
  return files.length > 0 && files.every(({ path }) => /^tests\/\.phase4-positive-[^/]+\//.test(path));
}

function substantiveText(value, allowTestIdentity, minimumLength = 20) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= minimumLength && trimmed.split(/\s+/).length >= 2 && (allowTestIdentity || !PLACEHOLDER_IDENTITY.test(trimmed));
}

function utcTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function exactProvinceScope(value) {
  return Array.isArray(value) && value.length === 2 && value[0] === "BC" && value[1] === "QC";
}

function validPhase4Scope(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 1 && exactProvinceScope(value.provinces);
}

function validOwnerDecision(value, allowTestIdentity) {
  return value && typeof value === "object" && !Array.isArray(value)
    && value.decision === "approve"
    && value.isHuman === true
    && substantiveText(value.name, allowTestIdentity, 8)
    && substantiveText(value.role, allowTestIdentity, 8)
    && utcTimestamp(value.decidedAt)
    && substantiveText(value.rationale, allowTestIdentity, 32);
}

function validReviewer(value, allowTestIdentity) {
  return value && typeof value === "object" && !Array.isArray(value)
    && typeof value.id === "string" && value.id.trim().length >= 3
    && value.isHuman === true
    && ["BC", "QC"].includes(value.province)
    && value.decision === "approved"
    && value.independent === true
    && value.noConflict === true
    && substantiveText(value.name, allowTestIdentity, 8)
    && substantiveText(value.role, allowTestIdentity, 16)
    && substantiveText(value.qualification, allowTestIdentity, 24)
    && substantiveText(value.affiliation, allowTestIdentity, 12)
    && utcTimestamp(value.reviewedAt)
    && substantiveText(value.findings, allowTestIdentity, 24)
    && substantiveText(value.notes, allowTestIdentity, 24);
}

function sameReasonDistribution(left, right) {
  if (!left || typeof left !== "object" || Array.isArray(left) || !right || typeof right !== "object" || Array.isArray(right)) return false;
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function bindingKeys(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const keys = value.map((binding) => {
    if (typeof binding?.path !== "string" || !validSha(binding.sha256)) return null;
    return `${binding.path}\u0000${binding.sha256}`;
  });
  if (keys.some((key) => key === null) || new Set(keys).size !== keys.length) return null;
  return keys.sort();
}

function sameBindings(left, right) {
  const leftKeys = bindingKeys(left);
  const rightKeys = bindingKeys(right);
  return leftKeys !== null && rightKeys !== null && JSON.stringify(leftKeys) === JSON.stringify(rightKeys);
}

function validNumericReport(item) {
  const report = item?.value;
  const counts = report?.counts;
  const reasons = report?.nonMatchReasonDistribution;
  if (report?.schemaVersion !== REPORT_SCHEMA || !report.runId || report.status !== "admitted-production" || report.productionEligible !== true) return false;
  if (!exactObject(report.claims, { comparisonResultsExist: true, productionEligible: true, released: false })) return false;
  if (!report.readiness || report.readiness.sourceRightsVerified !== true || report.readiness.sourceEvidenceAdmitted !== true || report.readiness.sourceTransformationApproved !== true || report.readiness.sourceReleaseApproved !== true || report.readiness.changeGeometryMaterialized !== true) return false;
  if (!counts || !integer(counts.assessedChanges) || counts.assessedChanges <= 0 || !integer(counts.matchedChanges) || !integer(counts.unmatchedChanges) || counts.matchedChanges + counts.unmatchedChanges !== counts.assessedChanges) return false;
  if (!finiteRate(report.matchRate) || !finiteRate(report.nonMatchRate) || Math.abs(report.matchRate + report.nonMatchRate - 1) > 1e-12) return false;
  if (Math.abs(report.matchRate - counts.matchedChanges / counts.assessedChanges) > 1e-12 || Math.abs(report.nonMatchRate - counts.unmatchedChanges / counts.assessedChanges) > 1e-12) return false;
  if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) return false;
  let reasonCount = 0;
  for (const [reason, count] of Object.entries(reasons)) {
    if (!reason.trim() || !integer(count)) return false;
    reasonCount += count;
  }
  return reasonCount === counts.unmatchedChanges;
}

function inspectReportingBundle(files) {
  const json = parseJsonEvidence(files);
  const byPath = new Map(files.map((item) => [item.path, item.sha256]));
  const allowTestIdentity = testOnlyEvidence(files);
  const report = json.find(validNumericReport);
  if (!report) return { valid: false };
  if (!validPhase4Scope(report.value.scope)) return { valid: false };
  if (!Array.isArray(report.value.inputBindings) || report.value.inputBindings.length === 0 || report.value.inputBindings.some((binding) => typeof binding?.path !== "string" || !validSha(binding.sha256) || byPath.get(binding.path) !== binding.sha256)) return { valid: false };
  const reportSha = report.sha256;
  const admission = json.find(({ value }) => value?.schemaVersion === ADMISSION_SCHEMA);
  const publication = json.find(({ value }) => value?.schemaVersion === PUBLICATION_SCHEMA);
  const release = json.find(({ value }) => value?.schemaVersion === RELEASE_SCHEMA);
  const review = json.find(({ value }) => value?.schemaVersion === REVIEW_SCHEMA);
  if (!admission || !publication || !release || !review) return { valid: false };

  const admissionValue = admission.value;
  const publicationValue = publication.value;
  const releaseValue = release.value;
  const reviewValue = review.value;
  if (admissionValue.status !== "recorded-production-admission" || !exactObject(admissionValue.claims, { admitted: true, released: false, productionEligible: true }) || admissionValue.reportSha256 !== reportSha || admissionValue.runId !== report.value.runId || !validPhase4Scope(admissionValue.scope) || JSON.stringify(admissionValue.scope) !== JSON.stringify(report.value.scope) || !sameBindings(admissionValue.inputBindings, report.value.inputBindings) || !validOwnerDecision(admissionValue.ownerDecision, allowTestIdentity)) return { valid: false };
  if (admissionValue.sourceRightsVerified !== true || admissionValue.sourceEvidenceAdmitted !== true || admissionValue.sourceTransformationApproved !== true || admissionValue.sourceReleaseApproved !== true || admissionValue.changeGeometryMaterialized !== true) return { valid: false };
  if (publicationValue.status !== "published-bilingual-production" || publicationValue.reportSha256 !== reportSha || publicationValue.admissionSha256 !== admission.sha256 || publicationValue.released !== true || publicationValue.productionEligible !== true || !Array.isArray(publicationValue.methodsPagePaths) || publicationValue.methodsPagePaths.length !== 2 || publicationValue.methodsPagePaths.some((path) => typeof path !== "string" || !hasEvidence(files, path))) return { valid: false };
  if (!finiteRate(publicationValue.matchRate) || !finiteRate(publicationValue.nonMatchRate) || publicationValue.matchRate !== report.value.matchRate || publicationValue.nonMatchRate !== report.value.nonMatchRate || !sameReasonDistribution(publicationValue.nonMatchReasonDistribution, report.value.nonMatchReasonDistribution)) return { valid: false };
  if (releaseValue.status !== "released-production" || releaseValue.released !== true || releaseValue.productionEligible !== true || typeof releaseValue.version !== "string" || !releaseValue.version.trim() || releaseValue.reportSha256 !== reportSha || releaseValue.admissionSha256 !== admission.sha256 || releaseValue.publicationSha256 !== publication.sha256 || releaseValue.outsideReviewSha256 !== review.sha256) return { valid: false };
  if (reviewValue.status !== "approved" || reviewValue.reportSha256 !== reportSha || reviewValue.admissionSha256 !== admission.sha256 || reviewValue.runId !== report.value.runId || !validPhase4Scope(reviewValue.scope) || JSON.stringify(reviewValue.scope) !== JSON.stringify(report.value.scope)) return { valid: false };
  if (!Array.isArray(reviewValue.provinces) || reviewValue.provinces.length !== 2 || new Set(reviewValue.provinces).size !== 2 || !reviewValue.provinces.includes("BC") || !reviewValue.provinces.includes("QC")) return { valid: false };
  if (!Array.isArray(reviewValue.reviewers) || reviewValue.reviewers.length !== 2 || reviewValue.reviewers.some((reviewer) => !validReviewer(reviewer, allowTestIdentity))) return { valid: false };
  const reviewerProvinces = new Set(reviewValue.reviewers.map((reviewer) => reviewer.province));
  if (reviewerProvinces.size !== 2 || !reviewerProvinces.has("BC") || !reviewerProvinces.has("QC")) return { valid: false };

  for (const path of publicationValue.methodsPagePaths) {
    const page = textFor(files, path);
    if (!page || /not available|unavailable|not admitted/i.test(page) || !/match rate|taux d[’']appariement/i.test(page) || !/non-match rate|taux de non-appariement/i.test(page) || !/non-match-reason distribution|répartition des motifs de non-appariement/i.test(page)) return { valid: false };
  }
  return { valid: true, report, admission, publication, release, review };
}

function validReportingBundle(files) {
  return inspectReportingBundle(files).valid;
}

function deriveCheckpointStatus(id, files) {
  const bundle = inspectReportingBundle(files);
  if (!bundle.valid) return "blocked";
  if (id === "rights-and-admission") return bundle.admission.value.sourceRightsVerified === true && bundle.admission.value.sourceEvidenceAdmitted === true && bundle.admission.value.sourceTransformationApproved === true && bundle.admission.value.sourceReleaseApproved === true ? "pass" : "blocked";
  if (id === "outside-provincial-review") return bundle.review.value.status === "approved" ? "pass" : "blocked";
  throw new Error(`Unknown Phase 4 checkpoint: ${id}.`);
}

function deriveCriterionStatus(id, files) {
  switch (id) {
    case "pending-or-uncorroborated-active-not-recorded-harvest": {
      const normalize = textFor(files, "lib/events/normalize.ts");
      const tests = textFor(files, "tests/event-normalization.test.ts");
      return hasEvidence(files, "lib/events/normalize.ts", "tests/event-normalization.test.ts")
        && /PENDING:\s*"planned"/.test(normalize)
        && /ACTIVE:\s*"authorised"/.test(normalize)
        && /RETIRED:\s*"recorded-harvest"/.test(normalize)
        && /input\.status !== "example"/.test(normalize)
        && /\["planned",\s*"authorised",\s*"recorded-harvest"\]/.test(tests);
    }
    case "quebec-north-of-52-national-baseline": {
      const resolveSource = textFor(files, "lib/coverage/resolve.ts");
      const tests = textFor(files, "tests/coverage.test.ts");
      const fixture = textFor(files, "lib/coverage/fixtures.ts");
      return hasEvidence(files, "lib/coverage/resolve.ts", "tests/coverage.test.ts", "lib/coverage/fixtures.ts")
        && /query\.province === "QC"\s*&&\s*query\.latitude >= 52/.test(resolveSource)
        && /grade:\s*"national-baseline"/.test(resolveSource)
        && /always keeps Quebec north of 52 at national baseline/.test(tests)
        && /province: "QC",\s*latitude: 53/.test(fixture);
    }
    case "published-match-and-non-match-rates":
      return validReportingBundle(files);
    case "subtypes-distinguished-or-undetermined": {
      const types = textFor(files, "lib/events/types.ts");
      const normalize = textFor(files, "lib/events/normalize.ts");
      const fixtures = textFor(files, "lib/events/fixtures.ts");
      const tests = textFor(files, "tests/event-normalization.test.ts");
      return hasEvidence(files, "lib/events/types.ts", "lib/events/normalize.ts", "lib/events/fixtures.ts", "tests/event-normalization.test.ts")
        && /salvage.*partial-cut.*thinning.*undetermined/.test(types)
        && /const subtype = input\.subtype \?\? "undetermined"/.test(normalize)
        && /subtype: "thinning"/.test(fixtures)
        && /subtype: "salvage"/.test(fixtures)
        && /subtype: "partial-cut"/.test(fixtures)
        && /events\[0\]\?\.subtype, "undetermined"/.test(tests);
    }
    default:
      throw new Error(`Unknown Phase 4 criterion: ${id}.`);
  }
}

export async function validatePhase4ExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase4-exit-status/1" || record.phase !== 4) throw new Error("Phase 4 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 4 requires exactly the four plan exit criteria.");
  const seen = new Set();
  let completed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 4 exit criteria must exactly match the plan.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 4 exit criterion must have an evidence-derived pass or fail status.");
    requiredString(criterion.reason, `${criterion.id} reason`);
    const evidence = await verifyEvidence(criterion.evidence);
    const derivedStatus = deriveCriterionStatus(criterion.id, evidence) ? "pass" : "fail";
    if (criterion.status !== derivedStatus) throw new Error(`Phase 4 criterion status is not supported by semantic evidence: ${criterion.id}.`);
    seen.add(criterion.id);
    if (criterion.status === "pass") completed += 1;
  }
  const percentage = completed / CRITERIA.size * 100;
  if (record.completedCriteria !== completed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 4 completion must equal the unweighted formal exit-criterion result.");
  if (!Array.isArray(record.checkpoints) || record.checkpoints.length !== CHECKPOINTS.size) throw new Error("Phase 4 requires exactly the rights/admission and outside-review checkpoints.");
  const checkpointIds = new Set();
  const checkpointStatuses = [];
  for (const checkpoint of record.checkpoints) {
    if (!CHECKPOINTS.has(checkpoint?.id) || checkpointIds.has(checkpoint.id) || checkpoint.title !== CHECKPOINTS.get(checkpoint.id)) throw new Error("Phase 4 checkpoint ids and titles must exactly match the plan.");
    if (checkpoint.status !== "pass" && checkpoint.status !== "blocked") throw new Error("Each Phase 4 checkpoint must have an evidence-derived pass or blocked status.");
    requiredString(checkpoint.reason, `${checkpoint.id} checkpoint reason`);
    const evidence = await verifyEvidence(checkpoint.evidence);
    const derivedStatus = deriveCheckpointStatus(checkpoint.id, evidence);
    if (checkpoint.status !== derivedStatus) throw new Error(`Phase 4 checkpoint status is not supported by semantic evidence: ${checkpoint.id}.`);
    checkpointIds.add(checkpoint.id);
    checkpointStatuses.push(checkpoint.status);
  }
  const checkpointsComplete = checkpointStatuses.every((status) => status === "pass");
  if (record.status !== (completed === CRITERIA.size && checkpointsComplete ? "complete" : "incomplete")) throw new Error("Phase 4 overall status must be derived from criteria and checkpoints.");
  requiredString(record.localControls, "Local controls notice");
  return record;
}

export async function checkPhase4ExitStatus(file = new URL("../data/phase4-exit-status.json", import.meta.url)) {
  return validatePhase4ExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase4ExitStatus();
  console.log(`Phase 4 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%).`);
}
