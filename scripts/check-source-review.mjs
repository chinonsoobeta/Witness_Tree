import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FACT_DEPENDENCIES = ["source-bytes", "source-identity", "licence-terms"];
const EVENT_CLASSES = ["update", "correction", "licence-change", "reprocessing-needed"];
const OUTCOMES = ["no-change-observed", "change-observed", "evidence-insufficient"];
const ACCEPTANCE_BY_OUTCOME = {
  "no-change-observed": "retained",
  "change-observed": "withdrawn",
  "evidence-insufficient": "suspended",
};

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function validateBaseline(baseline, staged, promotions) {
  for (const field of ["sourceId", "acceptedRecordId", "acceptedAt", "sha256"]) required(baseline?.[field], field);
  if (!TIMESTAMP.test(baseline.acceptedAt)) throw new Error("Acceptance time must be a UTC timestamp.");
  if (!SHA256.test(baseline.sha256)) throw new Error("An accepted baseline requires a SHA-256 checksum.");
  if (!Number.isSafeInteger(baseline.byteLength) || baseline.byteLength <= 0) throw new Error("Byte length must be a positive safe integer.");
  if (baseline.immutablePromotionState !== "remote-verified" || baseline.productionEligible !== false) {
    throw new Error("A source-review baseline must bind separately recorded remote verification and never claim production eligibility.");
  }

  const entry = staged.entries.find((candidate) => candidate.id === baseline.acceptedRecordId);
  if (!entry) throw new Error(`Baseline ${baseline.acceptedRecordId} has no staged acquisition record.`);
  if (entry.sourceId !== baseline.sourceId || entry.sha256 !== baseline.sha256 || entry.byteLength !== baseline.byteLength || entry.verifiedAt !== baseline.acceptedAt) {
    throw new Error(`Baseline ${baseline.acceptedRecordId} does not match its staged acquisition evidence.`);
  }
  const promotion = promotions.entries?.find((candidate) => candidate.sourceId === baseline.sourceId && candidate.stagedEntryId === baseline.acceptedRecordId);
  if (promotions.status !== "remote-verified" || !promotion || promotion.promotionState !== "remote-verified") {
    throw new Error(`Baseline ${baseline.acceptedRecordId} does not match a separately remote-verified immutable promotion.`);
  }

  if (baseline.licence?.state === "recorded") {
    for (const field of ["licenceId", "licenceVersion", "licenceUrl", "requiredAttribution"]) required(baseline.licence[field], `licence ${field}`);
    if (!baseline.licence.licenceUrl.startsWith("https://")) throw new Error("A recorded licence URL must use HTTPS.");
    if (entry.attributionState !== "metadata-verified" || baseline.licence.licenceId !== entry.licenceId || baseline.licence.requiredAttribution !== entry.attribution || baseline.licence.licenceUrl !== entry.licenceUrl) {
      throw new Error(`Recorded licence baseline ${baseline.acceptedRecordId} does not match its verified staging attribution.`);
    }
  } else if (baseline.licence?.state === "not-recorded") {
    required(baseline.licence.reason, "licence reason");
    if (entry.attributionState === "metadata-verified") throw new Error("A verified attribution cannot be registered as a missing licence baseline.");
    if (baseline.licenceReviewWithoutFurtherEvidence !== "evidence-insufficient") {
      throw new Error("Without a licence baseline, a later review must be registered as evidence-insufficient, never as no change.");
    }
  } else {
    throw new Error("Each baseline licence must be recorded or explicitly not recorded.");
  }

  if (baseline.sourceVersion?.state === "recorded") required(baseline.sourceVersion.value, "source version");
  else if (baseline.sourceVersion?.state === "not-recorded") {
    required(baseline.sourceVersion.reason, "source version reason");
    if (baseline.updateVersusCorrection !== "undetermined") {
      throw new Error("Without a version baseline, an update cannot be distinguished from a correction.");
    }
  } else throw new Error("Each baseline source version must be recorded or explicitly not recorded.");

  const factIds = new Set();
  if (!Array.isArray(baseline.acceptedFacts) || baseline.acceptedFacts.length === 0) throw new Error("Each baseline must list the facts its acceptance carries.");
  for (const fact of baseline.acceptedFacts) {
    required(fact?.id, "accepted fact id");
    if (factIds.has(fact.id)) throw new Error("Accepted fact identifiers must be unique.");
    factIds.add(fact.id);
    if (!FACT_DEPENDENCIES.includes(fact.dependsOn)) throw new Error(`Accepted fact ${fact.id} must state what it depends on.`);
  }
  return baseline;
}

function validateReview(review, baselines) {
  for (const field of ["sourceId", "observedAt", "reviewedAt", "reviewedBy", "outcome"]) required(review?.[field], field);
  if (!baselines.has(review.sourceId)) throw new Error(`Review ${review.sourceId} has no registered baseline.`);
  if (!TIMESTAMP.test(review.observedAt) || !TIMESTAMP.test(review.reviewedAt)) throw new Error("Review timestamps must be UTC.");
  if (!OUTCOMES.includes(review.outcome)) throw new Error("Review outcome is invalid.");
  if (review.acceptance !== ACCEPTANCE_BY_OUTCOME[review.outcome]) throw new Error(`Outcome ${review.outcome} requires acceptance ${ACCEPTANCE_BY_OUTCOME[review.outcome]}.`);
  if (review.productionEligible !== false || review.immutableObjectStorage !== false) throw new Error("A review must never claim immutability or production eligibility.");
  const events = Array.isArray(review.events) ? review.events : [];
  for (const event of events) if (!EVENT_CLASSES.includes(event?.eventClass)) throw new Error("Review event class is invalid.");
  if (review.outcome === "change-observed") {
    if (events.length === 0) throw new Error("A change decision must record at least one event.");
    if (!events.some((event) => event.eventClass === "reprocessing-needed")) throw new Error("A change decision must record what has to be recomputed.");
  } else if (events.length > 0) throw new Error("Only a change decision may record events.");
  if (review.outcome === "no-change-observed" && (!SHA256.test(review.observedSha256 ?? "") || review.licenceCompared !== true)) {
    throw new Error("No change may be recorded only with a compared checksum and compared licence terms.");
  }
  if (review.outcome === "evidence-insufficient") required(review.unresolvedReason, "unresolved reason");
  return review;
}

export function validateSourceReviewRegister(register, staged, promotions) {
  if (!register || register.status !== "process-definition") throw new Error("The register must remain a process definition.");
  required(register.notice, "Notice");
  if (!/no source review has been run/i.test(register.notice)) throw new Error("The notice must state that no review has been run against a live publisher change.");
  if (!Array.isArray(register.baselines) || register.baselines.length === 0) throw new Error("At least one accepted baseline is required.");
  if (!Array.isArray(register.reviews)) throw new Error("The review list is required, even when empty.");
  if (!staged || !Array.isArray(staged.entries)) throw new Error("Staged acquisition evidence is required to check a baseline.");
  if (!promotions || !Array.isArray(promotions.entries)) throw new Error("Immutable-promotion evidence is required to check a baseline.");

  const baselines = new Set();
  for (const baseline of register.baselines) {
    validateBaseline(baseline, staged, promotions);
    if (baselines.has(baseline.sourceId)) throw new Error("Baseline source identifiers must be unique.");
    baselines.add(baseline.sourceId);
  }
  for (const review of register.reviews) validateReview(review, baselines);
  return register;
}

export async function checkSourceReview(registerFile, stagedFile, promotionFile) {
  const [register, staged, promotions] = await Promise.all([
    readFile(registerFile ?? new URL("../data/source-review-register.json", import.meta.url), "utf8"),
    readFile(stagedFile ?? new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"),
    readFile(promotionFile ?? new URL("../data/immutable-promotions.json", import.meta.url), "utf8"),
  ]);
  return validateSourceReviewRegister(JSON.parse(register), JSON.parse(staged), JSON.parse(promotions));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const register = await checkSourceReview(path.resolve(directory, "../data/source-review-register.json"), path.resolve(directory, "../data/staged-acquisitions.json"), path.resolve(directory, "../data/immutable-promotions.json"));
  console.log(`Source-review register passed for ${register.baselines.length} accepted ${register.baselines.length === 1 ? "baseline" : "baselines"} and ${register.reviews.length} recorded ${register.reviews.length === 1 ? "review" : "reviews"}.`);
}
