import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSourceReviewRegister } from "../scripts/check-source-review.mjs";

const register = JSON.parse(readFileSync(new URL("../data/source-review-register.json", import.meta.url), "utf8"));
const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const quebec = register.baselines.find((baseline) => baseline.sourceId === "qc-historic-wildfire-detailed");
const alberta = register.baselines.find((baseline) => baseline.sourceId === "alberta-avi-crown");
const withBaselines = (...baselines) => ({ ...register, baselines });
const withReviews = (...reviews) => ({ ...register, reviews });

test("the register stays a process definition bound to real staging evidence", () => {
  assert.equal(validateSourceReviewRegister(register, staged), register);
  assert.equal(register.reviews.length, 0);
  assert.match(register.notice, /no source review has been run/i);
  assert.equal(quebec.sha256, "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815");
  assert.equal(quebec.productionEligible, false);
  assert.equal(quebec.immutableObjectStorage, false);
  assert.equal(alberta.licence.state, "not-recorded");
  assert.equal(alberta.licenceReviewWithoutFurtherEvidence, "evidence-insufficient");
});

test("a baseline must match its staged acquisition record and claim nothing more", () => {
  assert.throws(() => validateSourceReviewRegister({ ...register, status: "accepted" }, staged), /process definition/);
  assert.throws(() => validateSourceReviewRegister({ ...register, notice: "Sources are current." }, staged), /no review has been run/i);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, sha256: "a".repeat(64) }), staged), /does not match its staged/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, byteLength: 1 }), staged), /does not match its staged/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, acceptedRecordId: "unknown-record" }), staged), /no staged acquisition record/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, productionEligible: true }), staged), /never claim/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, immutableObjectStorage: true }), staged), /never claim/);
  assert.throws(() => validateSourceReviewRegister(withBaselines(quebec, quebec), staged), /unique/);
});

test("missing licence or version evidence cannot be registered as settled", () => {
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...alberta, licenceReviewWithoutFurtherEvidence: "no-change-observed" }), staged), /never as no change/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, updateVersusCorrection: "update" }), staged), /cannot be distinguished/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...alberta, licence: quebec.licence }), staged), /does not match its verified staging attribution/);
  assert.throws(() => validateSourceReviewRegister(withBaselines({ ...quebec, licence: { state: "not-recorded", reason: "Pending." }, licenceReviewWithoutFurtherEvidence: "evidence-insufficient" }), staged), /verified attribution cannot be registered/);
});

const illustrativeReview = {
  sourceId: "qc-historic-wildfire-detailed",
  observedAt: "2026-09-01T00:00:00Z",
  reviewedAt: "2026-09-01T12:00:00Z",
  reviewedBy: "illustrative-source-owner",
  outcome: "change-observed",
  acceptance: "withdrawn",
  events: [{ eventClass: "update" }, { eventClass: "reprocessing-needed" }],
  productionEligible: false,
  immutableObjectStorage: false,
};

test("a recorded review cannot keep acceptance, skip reprocessing, or claim no change without evidence", () => {
  assert.equal(validateSourceReviewRegister(withReviews(illustrativeReview), staged).reviews.length, 1);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, acceptance: "retained" }), staged), /requires acceptance withdrawn/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, events: [{ eventClass: "update" }] }), staged), /must record what has to be recomputed/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, events: [] }), staged), /at least one event/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, outcome: "no-change-observed", acceptance: "retained", events: [] }), staged), /compared checksum and compared licence/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, outcome: "evidence-insufficient", acceptance: "suspended", events: [] }), staged), /unresolved reason/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, sourceId: "unregistered-source" }), staged), /no registered baseline/);
  assert.throws(() => validateSourceReviewRegister(withReviews({ ...illustrativeReview, productionEligible: true }), staged), /never claim/);
});
