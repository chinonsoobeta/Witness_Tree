// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { circleAreaSquareKilometres, MAX_CUSTOM_AREA_SQUARE_KILOMETRES } from "../accounts/policy.ts";
import type { Account, AlertCadence } from "../accounts/types.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { ALERT_TEMPLATES } from "./templates.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { ALERT_TRIGGER_CLASSES, CANONICAL_EVIDENCE_FIRST_LINES, DEFAULT_CADENCE, isAlertEvidence, type AlertEvaluation, type AlertEvent, type AlertHistoryEntry, type AlertPayload, type AlertReadyArea } from "./types.ts";

const validDate = (value: string) => !Number.isNaN(new Date(value).getTime());
const internalVersionedUrl = (value: string, dataVersion: string) => {
  if (!/^\/(?!\/)[^?#]+\?[^#]+/.test(value)) return false;
  const query = new URL(value, "https://witness-tree.example").searchParams;
  const selectedVersions = ["release", "version"].flatMap((key) => query.getAll(key));
  return selectedVersions.length > 0 && selectedVersions.every((selected) => selected === dataVersion);
};
const validExternalUrl = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
export function validateAlertArea(area: AlertReadyArea, account: Account): AlertReadyArea {
  if (!area.id.trim() || !area.ownerId.trim() || !area.geometry.trim() || !area.name.trim() || !area.note.trim()) throw new Error("Saved area requires id, geometry, name, and note.");
  if (area.ownerId !== account.id) throw new Error("Saved area owner must match the supplied account.");
  if (!area.alertCadence || !area.alertLocale) throw new Error("Saved area requires cadence and locale.");
  if (!account.consentWording?.trim() || !account.consentedAt || !validDate(account.consentedAt)) throw new Error("Account consent wording and timestamp are required.");
  if (!Number.isFinite(area.areaSquareKilometres ?? 1) || (area.areaSquareKilometres !== undefined && (area.areaSquareKilometres <= 0 || area.areaSquareKilometres > MAX_CUSTOM_AREA_SQUARE_KILOMETRES))) throw new Error("Saved area is outside the maximum area.");
  if (area.radiusKilometres !== undefined && (!Number.isFinite(area.radiusKilometres) || area.radiusKilometres <= 0 || circleAreaSquareKilometres(area.radiusKilometres) > MAX_CUSTOM_AREA_SQUARE_KILOMETRES)) throw new Error("Saved-area radius exceeds the maximum area.");
  return area;
}
export function validateAlertEvent(event: AlertEvent): AlertEvent {
  if (!event.id.trim() || !event.fingerprint.trim() || !event.dataVersion.trim() || !event.sourceAgency.trim() || !isAlertEvidence(event.evidence) || !validDate(event.observedAt) || !internalVersionedUrl(event.versionedUrl, event.dataVersion) || !ALERT_TRIGGER_CLASSES.includes(event.trigger)) throw new Error("Alert event metadata is invalid.");
  if (event.reported.kind === "unknown" && "value" in event.reported) throw new Error("Unknown alert data cannot carry a numeric value.");
  if (event.trigger.startsWith("wildfire") && (!event.authorityUrl || !validExternalUrl(event.authorityUrl))) throw new Error("Wildfire alerts require an authoritative agency URL.");
  if (event.trigger === "annual-data-release" && !event.releaseId?.trim()) throw new Error("Release alerts require a release id.");
  return event;
}
const utcDay = (value: string) => new Date(value).toISOString().slice(0, 10);
const desiredCadence = (area: AlertReadyArea, trigger: AlertEvent["trigger"]): AlertCadence => area.alertCadence || DEFAULT_CADENCE[trigger];
export function evaluateAlerts(input: Readonly<{ account: Account; areas: readonly AlertReadyArea[]; events: readonly AlertEvent[]; history: readonly AlertHistoryEntry[]; now: string }>): AlertEvaluation {
  if (!validDate(input.now)) throw new Error("Evaluation time is invalid.");
  if (!input.account.emailVerifiedAt || input.account.unsubscribedAt) return { alerts: [], skipped: [] };
  const alerts: AlertPayload[] = []; const skipped: AlertEvaluation["skipped"][number][] = [];
  for (const area of input.areas) {
    validateAlertArea(area, input.account);
    for (const event of input.events.filter((candidate) => candidate.areaIds.includes(area.id))) {
      validateAlertEvent(event);
      const duplicate = input.history.some((entry) => entry.areaId === area.id && entry.fingerprint === event.fingerprint);
      const released = event.releaseId && input.history.some((entry) => entry.areaId === area.id && entry.releaseId === event.releaseId);
      const notified = event.trigger !== "correction" || input.history.some((entry) => entry.areaId === area.id && entry.eventId === event.correctionOf);
      if (duplicate) { skipped.push({ eventId: event.id, areaId: area.id, reason: "duplicate" }); continue; }
      if (released) { skipped.push({ eventId: event.id, areaId: area.id, reason: "already-released" }); continue; }
      if (!notified) { skipped.push({ eventId: event.id, areaId: area.id, reason: "not-previously-notified" }); continue; }
      const cadence = desiredCadence(area, event.trigger);
      const immediateToday = [...input.history, ...alerts.filter((alert) => alert.areaId === area.id && alert.cadence === "immediate").map((alert, index) => ({ areaId: alert.areaId, cadence: alert.cadence, sentAt: input.now, eventId: `new-${index}`, fingerprint: "", dataVersion: "" }))].filter((entry) => entry.areaId === area.id && entry.cadence === "immediate" && utcDay(entry.sentAt) === utcDay(input.now)).length;
      const overflowToDigest = cadence === "immediate" && immediateToday >= 6;
      alerts.push({ areaId: area.id, ownerId: area.ownerId, trigger: event.trigger, cadence, overflowToDigest, locale: area.alertLocale, evidence: event.evidence, evidenceFirstLine: CANONICAL_EVIDENCE_FIRST_LINES[event.evidence], dataVersion: event.dataVersion, sourceAgency: event.sourceAgency, observedAt: event.observedAt, versionedUrl: event.versionedUrl, ...(event.authorityUrl ? { authorityUrl: event.authorityUrl, authorityBeforeProduct: true } : {}), template: ALERT_TEMPLATES[event.trigger][area.alertLocale] });
    }
  }
  return { alerts, skipped };
}
