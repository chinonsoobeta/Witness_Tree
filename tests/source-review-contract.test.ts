import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { reviewSource } from "../lib/source-review/review.ts";
import type {
  AcceptedSourceState,
  ObservedSourceState,
  RecordedLicence,
  SourceReviewDecision,
  SourceReviewEventClass,
} from "../lib/source-review/types";

const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const quebec = staged.entries.find((entry: { sourceId: string }) => entry.sourceId === "qc-historic-wildfire-detailed");

const ACCEPTED_LICENCE: RecordedLicence = {
  licenceId: quebec.licenceId,
  licenceVersion: "4.0",
  licenceUrl: quebec.licenceUrl,
  requiredAttribution: quebec.attribution,
};

const ACCEPTED: AcceptedSourceState = {
  sourceId: quebec.sourceId,
  acceptedAt: quebec.verifiedAt,
  sha256: quebec.sha256,
  byteLength: quebec.byteLength,
  sourceVersion: { kind: "observed", value: "2026-08-11" },
  entityTag: { kind: "observed", value: "\"a1\"" },
  lastModified: { kind: "observed", value: "Mon, 11 Aug 2026 05:00:00 GMT" },
  licence: { kind: "observed", value: ACCEPTED_LICENCE },
  acceptedFacts: [
    { id: "staged-archive-checksum", dependsOn: "source-bytes" },
    { id: "quebec-lossless-layer-copy", dependsOn: "source-bytes" },
    { id: "version-to-bytes-binding", dependsOn: "source-identity" },
    { id: "recorded-attribution-wording", dependsOn: "licence-terms" },
  ],
};

const UNCHANGED: ObservedSourceState = {
  sourceId: quebec.sourceId,
  observedAt: "2026-09-01T00:00:00Z",
  sha256: { kind: "observed", value: quebec.sha256 },
  byteLength: { kind: "observed", value: quebec.byteLength },
  sourceVersion: { kind: "observed", value: "2026-08-11" },
  entityTag: { kind: "observed", value: "\"a1\"" },
  lastModified: { kind: "observed", value: "Mon, 11 Aug 2026 05:00:00 GMT" },
  licence: { kind: "observed", value: ACCEPTED_LICENCE },
};

const REVIEWED_AT = "2026-09-01T12:00:00Z";
const OTHER_SHA = "b".repeat(64);
const UNAVAILABLE = {
  kind: "unavailable" as const,
  reason: { en: "The publisher endpoint did not return this value.", fr: "Le point d’accès de l’éditeur n’a pas renvoyé cette valeur." },
};

const review = (observed: ObservedSourceState, accepted: AcceptedSourceState = ACCEPTED): SourceReviewDecision =>
  reviewSource(accepted, observed, REVIEWED_AT);

const classes = (decision: SourceReviewDecision): readonly SourceReviewEventClass[] =>
  decision.events.map((event) => event.eventClass);

test("detects an update when new content arrives under a new asserted version", () => {
  const decision = review({ ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA }, byteLength: { kind: "observed", value: quebec.byteLength + 4096 }, sourceVersion: { kind: "observed", value: "2026-09-01" } });
  assert.equal(decision.outcome, "change-observed");
  assert.deepEqual(classes(decision), ["update", "reprocessing-needed"]);
  assert.equal(decision.acceptance.state, "withdrawn");
  assert.ok(decision.evidence.some((item) => item.field === "sha256" && item.comparison === "differs"));
});

test("detects a correction when content changes under the same asserted version", () => {
  const decision = review({ ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA }, byteLength: { kind: "observed", value: quebec.byteLength + 1 } });
  assert.equal(decision.outcome, "change-observed");
  assert.deepEqual(classes(decision), ["correction", "reprocessing-needed"]);
  if (decision.acceptance.state !== "withdrawn") throw new Error("A correction must withdraw acceptance.");
  assert.deepEqual(
    decision.acceptance.invalidatedFacts.map((fact) => fact.id),
    ["staged-archive-checksum", "quebec-lossless-layer-copy", "version-to-bytes-binding"],
  );
  assert.ok(decision.acceptance.reAcceptanceRequirements.some((item) => item.id === "publish-correction-notice"));
});

test("detects a licence change from licence URL or required attribution wording", () => {
  const decision = review({ ...UNCHANGED, licence: { kind: "observed", value: { ...ACCEPTED_LICENCE, licenceUrl: "https://example.ca/licence/v5", requiredAttribution: "Different required wording." } } });
  assert.equal(decision.outcome, "change-observed");
  assert.deepEqual(classes(decision), ["licence-change", "reprocessing-needed"]);
  if (decision.acceptance.state !== "withdrawn") throw new Error("A licence change must withdraw acceptance.");
  assert.deepEqual(decision.acceptance.invalidatedFacts.map((fact) => fact.id), ["recorded-attribution-wording"]);
  assert.deepEqual(
    decision.events[0].evidence.map((item) => item.field),
    ["licenceUrl", "requiredAttribution"],
  );
});

test("every change class triggers reprocessing, and a licence change can accompany a content change", () => {
  const decision = review({
    ...UNCHANGED,
    sha256: { kind: "observed", value: OTHER_SHA },
    sourceVersion: { kind: "observed", value: "2026-09-01" },
    licence: { kind: "observed", value: { ...ACCEPTED_LICENCE, licenceVersion: "5.0" } },
  });
  assert.deepEqual(classes(decision), ["update", "licence-change", "reprocessing-needed"]);
  assert.equal(decision.events.at(-1)?.eventClass, "reprocessing-needed");
  assert.equal(decision.events.at(-1)?.evidence.length, 2);
});

test("missing evidence returns Unknown with a reason and never reports no change", () => {
  for (const observed of [
    { ...UNCHANGED, sha256: UNAVAILABLE },
    { ...UNCHANGED, licence: UNAVAILABLE },
    { ...UNCHANGED, sha256: UNAVAILABLE, licence: UNAVAILABLE, sourceVersion: UNAVAILABLE },
  ]) {
    const decision = review(observed);
    assert.notEqual(decision.outcome, "no-change-observed");
    assert.equal(decision.outcome, "evidence-insufficient");
    assert.equal(decision.events.length, 0);
    assert.notEqual(decision.acceptance.state, "retained");
    assert.equal(decision.acceptance.state, "suspended");
    if (decision.outcome !== "evidence-insufficient") throw new Error("unreachable");
    assert.equal(decision.unresolved.unknown.kind, "unknown");
    assert.equal(decision.unresolved.unknown.evidence, "unknown");
    assert.match(decision.unresolved.unknown.reason, /Absence of evidence is not evidence/);
    assert.match(decision.unresolved.question.fr, /L’absence de preuve/);
    assert.equal(decision.confidence.level, "unknown");
    assert.ok(decision.acceptance.reAcceptanceRequirements.length > 0);
  }
});

test("an acceptance is retained only when a matching checksum and comparable licence terms are both present", () => {
  const decision = review(UNCHANGED);
  assert.equal(decision.outcome, "no-change-observed");
  assert.equal(decision.acceptance.state, "retained");
  assert.equal(decision.events.length, 0);
  assert.equal(decision.productionEligible, false);
  assert.equal(decision.immutableObjectStorage, false);

  const weakValidatorsOnly = review({ ...UNCHANGED, entityTag: { kind: "observed", value: "\"a2\"" }, lastModified: { kind: "observed", value: "Tue, 01 Sep 2026 00:00:00 GMT" } });
  assert.equal(weakValidatorsOnly.outcome, "no-change-observed");
});

test("a changed source cannot keep its prior acceptance", () => {
  const changes: ObservedSourceState[] = [
    { ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA } },
    { ...UNCHANGED, sha256: UNAVAILABLE, byteLength: { kind: "observed", value: quebec.byteLength + 1 } },
    { ...UNCHANGED, sha256: UNAVAILABLE, byteLength: UNAVAILABLE, entityTag: { kind: "observed", value: "\"a2\"" } },
    { ...UNCHANGED, sha256: UNAVAILABLE, byteLength: UNAVAILABLE, entityTag: UNAVAILABLE, lastModified: { kind: "observed", value: "Tue, 01 Sep 2026 00:00:00 GMT" } },
    { ...UNCHANGED, licence: { kind: "observed", value: { ...ACCEPTED_LICENCE, licenceId: "ogl-canada-2.0" } } },
  ];
  for (const observed of changes) {
    const decision = review(observed);
    assert.equal(decision.outcome, "change-observed");
    assert.notEqual(decision.acceptance.state, "retained");
    assert.equal(decision.acceptance.state, "withdrawn");
    assert.ok(decision.events.length >= 1);
    assert.equal(decision.productionEligible, false);
    assert.equal(decision.immutableObjectStorage, false);
  }
});

test("content change without a comparable version stays undetermined between update and correction", () => {
  const decision = review({ ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA }, sourceVersion: UNAVAILABLE });
  assert.equal(decision.outcome, "change-observed");
  assert.deepEqual(classes(decision), ["reprocessing-needed"]);
  assert.equal(decision.unresolved?.unknown.kind, "unknown");
  assert.match(decision.unresolved?.question.en ?? "", /cannot separate an update from a correction/);
  if (decision.acceptance.state !== "withdrawn") throw new Error("unreachable");
  assert.ok(decision.acceptance.reAcceptanceRequirements.some((item) => item.id === "obtain-version-evidence"));
});

test("malformed or self-contradictory input throws instead of returning a decision", () => {
  assert.throws(() => review({ ...UNCHANGED, sourceId: "another-source" }), /one source identity/);
  assert.throws(() => reviewSource({ ...ACCEPTED, sha256: "not-a-checksum" }, UNCHANGED, REVIEWED_AT), /SHA-256/);
  assert.throws(() => reviewSource({ ...ACCEPTED, byteLength: 0 }, UNCHANGED, REVIEWED_AT), /positive/);
  assert.throws(() => review({ ...UNCHANGED, observedAt: "2026-08-01T00:00:00Z" }), /cannot precede the acceptance/);
  assert.throws(() => reviewSource(ACCEPTED, UNCHANGED, "2026-08-31T00:00:00Z"), /cannot precede the observation/);
  assert.throws(() => reviewSource(ACCEPTED, UNCHANGED, "not-a-timestamp"), /UTC review timestamp/);
  assert.throws(() => review({ ...UNCHANGED, byteLength: { kind: "observed", value: quebec.byteLength + 1 } }), /identical SHA-256/);
  assert.throws(() => review({ ...UNCHANGED, licence: { kind: "observed", value: { ...ACCEPTED_LICENCE, licenceUrl: "http://example.ca" } } }), /HTTPS/);
  assert.throws(() => reviewSource({ ...ACCEPTED, acceptedFacts: [{ id: "duplicate", dependsOn: "source-bytes" }, { id: "duplicate", dependsOn: "licence-terms" }] }, UNCHANGED, REVIEWED_AT), /unique/);
  assert.throws(() => review({ ...UNCHANGED, sha256: { kind: "unavailable", reason: { en: "", fr: "" } } }), /stated reason/);
});

test("every returned reason carries English and French", () => {
  const decisions = [review(UNCHANGED), review({ ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA } }), review({ ...UNCHANGED, sha256: UNAVAILABLE })];
  for (const decision of decisions) {
    for (const text of [decision.reason, ...decision.events.map((event) => event.reason)]) {
      assert.ok(text.en.trim().length > 0 && text.fr.trim().length > 0);
      assert.notEqual(text.en, text.fr);
    }
  }
});

test("the type system refuses a changed source that keeps its prior acceptance", () => {
  const withdrawn = review({ ...UNCHANGED, sha256: { kind: "observed", value: OTHER_SHA } });
  if (withdrawn.acceptance.state !== "withdrawn") throw new Error("unreachable");
  const impossible = {
    ...withdrawn,
    // @ts-expect-error A change-observed decision can never carry a retained acceptance.
    acceptance: { state: "retained", acceptedAt: ACCEPTED.acceptedAt, acceptedSha256: ACCEPTED.sha256 },
  } satisfies SourceReviewDecision;
  assert.equal(impossible.outcome, "change-observed");
});
