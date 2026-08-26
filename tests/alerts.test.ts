import assert from "node:assert/strict";
import test from "node:test";

import { buildDigest, type AlertChange }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/alerts/digest.ts";
import {
  addSubscription,
  createSubscription,
  pauseSubscription,
  publicSubscriptionSummary,
  unsubscribe,
}
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/alerts/subscriptions.ts";

const subscription = createSubscription({
  id: "subscription-1",
  emailAddress: " Person@Example.test ",
  placeId: "place-1",
  eventClass: "official-record",
});

const change: AlertChange = {
  id: "change-1",
  placeId: "place-1",
  eventClass: "official-record",
  observedAt: "2026-08-11T00:00:00Z",
  reported: {
    kind: "figure",
    value: 12,
    unit: "ha",
    evidence: "official-record",
    confidence: {
      level: "high",
      ruleId: "CONF-HIGH-001",
      reason: { en: "Direct record.", fr: "Registre direct." },
    },
    provenance: {
      dataset: "Example record",
      version: "1",
      retrievedDate: "2026-08-11",
      licence: "ogl-canada-2.0",
    },
  },
};

test("invalid email and a normalized duplicate are rejected", () => {
  assert.throws(() => createSubscription({ ...subscription, emailAddress: "not-an-email" }), /valid email/i);
  assert.throws(() => addSubscription([subscription], {
    id: "subscription-2",
    emailAddress: "person@example.test",
    placeId: "place-1",
    eventClass: "official-record",
  }), /already exists/i);
});

test("paused and unsubscribed subscriptions are excluded from digests", () => {
  assert.equal(buildDigest(pauseSubscription(subscription), [change]), null);
  assert.equal(buildDigest(unsubscribe(subscription), [change]), null);
});

test("digest keeps evidence, confidence, provenance, and unknown instead of zero", () => {
  const unknownChange: AlertChange = {
    ...change,
    id: "change-unknown",
    reported: {
      kind: "unknown",
      evidence: "unknown",
      reason: { en: "No authoritative public record has been integrated for this question.", fr: "Aucun registre public faisant autorité n’a été intégré pour cette question." },
      coverageGrade: "national-baseline",
    },
  };
  const digest = buildDigest(subscription, [change, unknownChange]);

  assert.equal(digest?.changes.length, 2);
  assert.equal(digest?.changes[0]?.reported.kind, "figure");
  assert.equal(digest?.changes[0]?.reported.kind === "figure" && digest.changes[0].reported.provenance.dataset, "Example record");
  const unknownReported = digest?.changes[1]?.reported;
  assert.equal(unknownReported?.kind, "unknown");
  assert.equal("value" in (unknownReported ?? {}), false);
});

test("public summaries and digests contain no email address", () => {
  const summary = publicSubscriptionSummary(subscription);
  const digest = buildDigest(subscription, [change]);

  assert.equal(JSON.stringify(summary).includes("person@example.test"), false);
  assert.equal(JSON.stringify(digest).toLowerCase().includes("email"), false);
  assert.equal(JSON.stringify(digest).includes("person@example.test"), false);
});
