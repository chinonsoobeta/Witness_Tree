import assert from "node:assert/strict"; import test from "node:test";
// @ts-expect-error Node runner extensions.
import { EXAMPLE_CORRECTION } from "../lib/corrections/fixtures.ts";
// @ts-expect-error Node runner extensions.
import { addBusinessDays, correctionNotices, dueDates, evaluateSla, isAttributionDispute, transition, validateCorrection } from "../lib/corrections/policy.ts";
test("SLAs skip weekends and classify attribution disputes", () => { assert.equal(addBusinessDays(new Date("2026-08-07T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-08-10"); assert.equal(dueDates(EXAMPLE_CORRECTION).resolution.toISOString().slice(0, 10), "2026-08-24"); assert.equal(isAttributionDispute(EXAMPLE_CORRECTION.classification), true); });
test("lifecycle, production recipient and locales are enforced", () => {
  assert.throws(() => transition({ ...EXAMPLE_CORRECTION, status: "resolved" }, "submitted", new Date()));
  assert.throws(() => transition(EXAMPLE_CORRECTION, "acknowledged", new Date("invalid")));
  assert.throws(() => transition(EXAMPLE_CORRECTION, "acknowledged", new Date("2026-08-09T00:00:00Z")));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, statusKind: "production", publicRecord: undefined }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, statusKind: "production", accountableRecipient: { name: "", role: "owner" } }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, publicRecord: { ...EXAMPLE_CORRECTION.publicRecord!, whyChanged: { en: "", fr: "" } } }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, publicRecord: { ...EXAMPLE_CORRECTION.publicRecord!, publicationDate: "2026-02-30" } }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, priorFigureAddress: "/x?query" }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, acknowledgedAt: new Date("invalid") }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, resolvedAt: new Date("2026-08-09T00:00:00Z") }));
  assert.throws(() => validateCorrection({ ...EXAMPLE_CORRECTION, previouslyNotifiedSubscriberIds: [""] }));
});
test("late evaluation and notices preserve privacy", () => { assert.equal(evaluateSla(EXAMPLE_CORRECTION, new Date("2026-08-12T00:00:00Z")), "late-acknowledgement"); const acknowledged = transition(EXAMPLE_CORRECTION, "acknowledged", new Date("2026-08-10T00:00:00Z")); assert.equal(evaluateSla(acknowledged, new Date("2026-08-12T00:00:00Z")), "on-time"); assert.equal(evaluateSla({ ...acknowledged, acknowledgedAt: new Date("2026-08-12T00:00:00Z") }, new Date("2026-08-12T00:00:00Z")), "late-acknowledgement"); const notices = correctionNotices(EXAMPLE_CORRECTION); assert.equal(notices[0].subscriberId, "example-subscriber-1"); assert.equal(JSON.stringify(notices).includes("@"), false); assert.equal("value" in EXAMPLE_CORRECTION, false); });
