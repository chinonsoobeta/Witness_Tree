import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_FTA_EVENTS }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/events/fixtures.ts";
import { EVENT_CATEGORY_LABELS, computeProvinceSummaries, normalizeFtaEvents }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/events/normalize.ts";

test("maps FTA lifecycles to neutral bilingual categories and falls back to undetermined subtype", () => {
  const events = normalizeFtaEvents(EXAMPLE_FTA_EVENTS);
  assert.deepEqual(events.slice(0, 3).map((event) => event.category), ["planned", "authorised", "recorded-harvest"]);
  assert.equal(events[0]?.subtype, "undetermined");
  assert.deepEqual(EVENT_CATEGORY_LABELS["recorded-harvest"], { en: "Recorded harvest", fr: "Récolte consignée" });
  assert.equal(events[2]?.rankable, false);
});

test("summarizes provinces and reproduces an old boundary edition after a newer edition loads", () => {
  const events = normalizeFtaEvents(EXAMPLE_FTA_EVENTS);
  const oldBoundary = computeProvinceSummaries(events, "boundary-2023");
  const newerBoundary = computeProvinceSummaries(events, "boundary-2025");
  const oldRecompute = computeProvinceSummaries(events, "boundary-2023");
  assert.deepEqual(oldBoundary, oldRecompute);
  assert.equal(newerBoundary.boundaryEdition, "boundary-2025");
  assert.deepEqual(oldBoundary.provinces.find((summary) => summary.province === "BC"), {
    province: "BC", eventCount: 3, plannedCount: 1, authorisedCount: 1, recordedHarvestCount: 1, unknownTenureShare: { kind: "figure", value: 1 / 3 },
  });
  for (const province of ["ON", "QC"]) {
    const share = oldBoundary.provinces.find((summary) => summary.province === province)?.unknownTenureShare;
    assert.deepEqual(share, { kind: "unknown", reason: "No event records for this province and boundary edition." });
    assert.equal("value" in (share ?? {}), false);
  }
  assert.equal(JSON.stringify(oldBoundary).includes('"Unknown":0'), false);
});

test("rejects missing or duplicate IDs and invalid event values", () => {
  assert.throws(() => normalizeFtaEvents([{ ...EXAMPLE_FTA_EVENTS[0]!, id: "" }]), /id/i);
  assert.throws(() => normalizeFtaEvents([EXAMPLE_FTA_EVENTS[0]!, { ...EXAMPLE_FTA_EVENTS[0]! }]), /Duplicate/i);
  assert.throws(() => normalizeFtaEvents([{ ...EXAMPLE_FTA_EVENTS[0]!, lifecycle: "BAD" as never }]), /lifecycle/i);
  assert.throws(() => normalizeFtaEvents([{ ...EXAMPLE_FTA_EVENTS[0]!, category: "bad" as never }]), /category/i);
  assert.throws(() => normalizeFtaEvents([{ ...EXAMPLE_FTA_EVENTS[0]!, year: 1900 }]), /year/i);
  assert.throws(() => normalizeFtaEvents([{ ...EXAMPLE_FTA_EVENTS[0]!, hectares: 0 }]), /hectares/i);
});
