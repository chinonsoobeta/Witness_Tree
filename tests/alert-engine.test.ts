import assert from "node:assert/strict";
import test from "node:test";
import { circleAreaSquareKilometres, MAX_CUSTOM_AREA_SQUARE_KILOMETRES }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/accounts/policy.ts";
import { evaluateAlerts, validateAlertArea, validateAlertEvent }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/alerts/triggers.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { ALERT_TRIGGER_CLASSES, DEFAULT_CADENCE, type AlertEvent, type AlertReadyArea } from "../lib/alerts/types.ts";

const account = { id: "account", emailAddress: "person@example.test", passwordHash: "hash", locale: "en" as const, emailVerifiedAt: "2026-08-01T00:00:00Z", unsubscribeToken: "token", consentWording: "I agree to receive evidence-based alerts.", consentedAt: "2026-08-01T00:00:00Z" };
const area: AlertReadyArea = { id: "area", ownerId: "account", geometry: "POINT(0 0)", areaSquareKilometres: 5_000, name: "Home", note: "Illustrative only", alertPreferences: [], alertCadence: "immediate", alertLocale: "en" };
const reported = { kind: "figure" as const, value: 1, unit: "ha" as const, evidence: "official-record" as const, confidence: { level: "high" as const, ruleId: "CONF-HIGH-001" as const, reason: { en: "Direct record.", fr: "Registre direct." } }, provenance: { dataset: "Example", version: "v1", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0" as const } };
const event = (trigger: AlertEvent["trigger"], id: string = trigger): AlertEvent => ({ id, trigger, areaIds: ["area"], observedAt: "2026-08-11T10:00:00Z", dataVersion: "release-1", sourceAgency: "Example agency", evidence: "official-record", reported, versionedUrl: "/en/places/example?release=release-1", fingerprint: `fp-${id}`, ...(trigger.startsWith("wildfire") ? { authorityUrl: "https://agency.example.test/fire" } : {}), ...(trigger === "annual-data-release" ? { releaseId: "release-1" } : {}) });
const run = (events: readonly AlertEvent[], history: readonly { areaId: string; eventId: string; fingerprint: string; sentAt: string; dataVersion: string; cadence: "immediate"; releaseId?: string }[] = []) => evaluateAlerts({ account, areas: [area], events, history, now: "2026-08-11T12:00:00Z", killSwitchEnabled: false });

test("all seven triggers have prescribed defaults and complete bilingual payloads", () => {
  assert.deepEqual(DEFAULT_CADENCE, { "wildfire-intersection": "immediate", "wildfire-nearby": "immediate", "official-record": "weekly-digest", "unmatched-detected-change": "weekly-digest", "annual-data-release": "immediate", correction: "immediate", "coverage-grade-change": "monthly-digest" });
  const evaluated = run(ALERT_TRIGGER_CLASSES.map((trigger) => trigger === "correction" ? { ...event(trigger), correctionOf: "original" } : event(trigger)), [{ areaId: "area", eventId: "original", fingerprint: "original", sentAt: "2026-08-10T01:00:00Z", dataVersion: "release-0", cadence: "immediate" }]);
  assert.equal(evaluated.alerts.length, 7);
  for (const alert of evaluated.alerts) { assert.ok(alert.template); assert.equal(alert.evidence, "official-record"); assert.equal(alert.evidenceFirstLine.en, "Official record"); assert.equal(alert.evidenceFirstLine.fr, "Registre officiel"); assert.ok(alert.dataVersion); assert.ok(alert.sourceAgency); assert.ok(alert.observedAt); assert.ok(alert.versionedUrl.includes("?release=")); assert.equal(/urgent|emergency/i.test(alert.template), false); }
  const french = evaluateAlerts({ account, areas: [{ ...area, alertLocale: "fr" }], events: [event("official-record")], history: [], now: "2026-08-11T12:00:00Z", killSwitchEnabled: false }).alerts[0]!;
  assert.match(french.template, /registre officiel/i);
  const wildfire = evaluated.alerts.find((alert) => alert.trigger === "wildfire-intersection")!;
  assert.equal(wildfire.authorityBeforeProduct, true); assert.equal(wildfire.authorityUrl, "https://agency.example.test/fire");
});

test("duplicate, once-per-release, correction-recipient, and immediate-cap rules hold", () => {
  assert.equal(run([event("official-record")], [{ areaId: "area", eventId: "old", fingerprint: "fp-official-record", sentAt: "2026-08-11T01:00:00Z", dataVersion: "release-1", cadence: "immediate" }]).skipped[0]?.reason, "duplicate");
  assert.equal(run([event("annual-data-release")], [{ areaId: "area", eventId: "old", fingerprint: "other", sentAt: "2026-08-10T01:00:00Z", dataVersion: "release-1", cadence: "immediate", releaseId: "release-1" }]).skipped[0]?.reason, "already-released");
  assert.equal(run([{ ...event("correction"), correctionOf: "original" }]).skipped[0]?.reason, "not-previously-notified");
  assert.equal(run([{ ...event("correction"), correctionOf: "original" }], [{ areaId: "area", eventId: "original", fingerprint: "original", sentAt: "2026-08-10T01:00:00Z", dataVersion: "release-0", cadence: "immediate" }]).alerts.length, 1);
  const six = Array.from({ length: 6 }, (_, i) => ({ areaId: "area", eventId: `old-${i}`, fingerprint: `old-${i}`, sentAt: "2026-08-11T01:00:00Z", dataVersion: "old", cadence: "immediate" as const }));
  const capped = run([event("wildfire-intersection", "seven")], six).alerts[0]!;
  assert.equal(capped.overflowToDigest, true);
  const atBoundary = run([event("wildfire-intersection", "six")], six.slice(0, 5)).alerts[0]!;
  assert.equal(atBoundary.overflowToDigest, false);
});

test("unverified and unsubscribed accounts never produce alert payloads", () => {
  assert.equal(evaluateAlerts({ account: { ...account, emailVerifiedAt: undefined }, areas: [area], events: [event("official-record")], history: [], now: "2026-08-11T12:00:00Z", killSwitchEnabled: false }).alerts.length, 0);
  assert.equal(evaluateAlerts({ account: { ...account, unsubscribedAt: "2026-08-11T11:00:00Z" }, areas: [area], events: [event("official-record")], history: [], now: "2026-08-11T12:00:00Z", killSwitchEnabled: false }).alerts.length, 0);
  assert.equal(evaluateAlerts({ account, areas: [area], events: [event("official-record")], history: [], now: "2026-08-11T12:00:00Z", killSwitchEnabled: true }).alerts.length, 0);
});

test("strict alert metadata, consent, and 5,000 square kilometre limit are validated", () => {
  assert.equal(circleAreaSquareKilometres(Math.sqrt(MAX_CUSTOM_AREA_SQUARE_KILOMETRES / Math.PI)) <= MAX_CUSTOM_AREA_SQUARE_KILOMETRES, true);
  assert.throws(() => validateAlertArea({ ...area, radiusKilometres: 41 }, account), /maximum/);
  assert.throws(() => validateAlertArea({ ...area, areaSquareKilometres: Number.POSITIVE_INFINITY }, account), /maximum/);
  assert.throws(() => validateAlertArea({ ...area, name: "" }, account), /name/);
  assert.throws(() => validateAlertArea({ ...area, ownerId: "someone-else" }, account), /owner/);
  assert.throws(() => validateAlertArea(area, { ...account, consentedAt: "not-date" }), /consent/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), versionedUrl: "/en/places/example" }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), versionedUrl: "/en/places/example?release=other-release" }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), versionedUrl: "/en/places/example?arbitrary=release-1" }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), versionedUrl: "/en/places/example?release=release-1&version=other-release" }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("wildfire-nearby"), authorityUrl: "http://not-secure.test" }), /authoritative/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), observedAt: "not-date" }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), evidence: "invented" as never }), /metadata/);
  assert.throws(() => validateAlertEvent({ ...event("official-record"), reported: { kind: "unknown", evidence: "unknown", reason: { en: "No record.", fr: "Aucun registre." }, coverageGrade: "national-baseline", value: 0 } as never }), /numeric/);
});
