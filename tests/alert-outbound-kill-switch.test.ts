import assert from "node:assert/strict";
import test from "node:test";
import {
  createAlertQueue,
  createKillSwitch,
  createPolledKillSwitch,
  createRecordingSender,
  drainQueue,
  FIVE_MINUTES_MS,
  measureKillSwitchStop,
  type AlertSender,
  type OutboundAlert,
}
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/alerts/outbound.ts";
import type { AccountActivationApproval } from "../lib/accounts/activation-gate";

const approved: AccountActivationApproval = {
  canadianHostAndResidency: true,
  directRlsIsolationTest: true,
  geometryEncryptionAndNoLogVerification: true,
  consentDeletionAndRetentionTests: true,
  verifiedSenderAndOneClickUnsubscribe: true,
  rateLimitAndQueueControls: true,
  killSwitchRehearsalUnderFiveMinutes: true,
  reviewedEnglishAndFrenchTemplates: true,
  privacySecurityAndLegalSignoff: true,
  namedIncidentOwnerAndRunbook: true,
};

const alerts = (count: number): readonly OutboundAlert[] => Array.from({ length: count }, (_unused, index) => ({
  id: `alert-${index}`,
  areaId: "area",
  ownerId: "account",
  locale: "en" as const,
  template: "Illustrative payload.",
}));

test("an engaged kill switch refuses every queued alert and delivers nothing", async () => {
  const sender = createRecordingSender();
  const killSwitch = createKillSwitch();
  killSwitch.engage();
  const result = await drainQueue({ queue: createAlertQueue(alerts(5)), sender, killSwitch });
  assert.equal(result.sent, 0);
  assert.equal(result.refused, 5);
  assert.equal(result.remaining, 0);
  assert.deepEqual([...new Set(result.outcomes.map((outcome) => outcome.reason))], ["kill-switch"]);
  assert.equal(sender.delivered().length, 0);
});

test("the switch is checked at the send, so it stops a drain already under way", async () => {
  const sender = createRecordingSender();
  const killSwitch = createKillSwitch();
  const queue = createAlertQueue(alerts(6));
  const watching: AlertSender = { name: "watching", deliversOutbound: false, async send(alert) { await sender.send(alert); if (sender.delivered().length === 2) killSwitch.engage(); } };
  const result = await drainQueue({ queue, sender: watching, killSwitch });
  assert.equal(result.sent, 2);
  assert.equal(result.refused, 4);
  assert.equal(sender.delivered().length, 2);
  assert.ok(result.stoppedAtMs !== undefined);
  assert.deepEqual(result.outcomes.slice(2).map((outcome) => outcome.reason), ["kill-switch", "kill-switch", "kill-switch", "kill-switch"]);
});

test("a refused alert is recorded rather than dropped, so an incident leaves an account of itself", async () => {
  const killSwitch = createKillSwitch();
  killSwitch.engage();
  const result = await drainQueue({ queue: createAlertQueue(alerts(3)), sender: createRecordingSender(), killSwitch });
  assert.deepEqual(result.outcomes.map((outcome) => outcome.alertId), ["alert-0", "alert-1", "alert-2"]);
  assert.ok(result.outcomes.every((outcome) => outcome.status === "refused"));
});

test("a sender that would reach a person is refused until the activation gate is complete", async () => {
  const delivering: AlertSender = { name: "would-deliver", deliversOutbound: true, async send() { throw new Error("This test sender must never be called."); } };
  const killSwitch = createKillSwitch();
  const closed = await drainQueue({ queue: createAlertQueue(alerts(2)), sender: delivering, killSwitch });
  assert.equal(closed.sent, 0);
  assert.deepEqual([...new Set(closed.outcomes.map((outcome) => outcome.reason))], ["service-not-activated"]);
  const partial = await drainQueue({ queue: createAlertQueue(alerts(2)), sender: delivering, killSwitch, approval: { ...approved, verifiedSenderAndOneClickUnsubscribe: false } });
  assert.equal(partial.refused, 2);
  const recording = await drainQueue({ queue: createAlertQueue(alerts(2)), sender: createRecordingSender(), killSwitch });
  assert.equal(recording.sent, 2);
});

test("the kill switch beats the activation gate when both would refuse", async () => {
  const delivering: AlertSender = { name: "would-deliver", deliversOutbound: true, async send() { throw new Error("This test sender must never be called."); } };
  const killSwitch = createKillSwitch();
  killSwitch.engage();
  const result = await drainQueue({ queue: createAlertQueue(alerts(1)), sender: delivering, killSwitch });
  assert.equal(result.outcomes[0]!.reason, "kill-switch");
});

test("a polled switch reads the operator flag at most once per interval and rejects a bad interval", () => {
  let now = 0;
  let flag = false;
  const killSwitch = createPolledKillSwitch(() => flag, 100, () => now);
  assert.equal(killSwitch.isEngaged(), false);
  flag = true;
  now = 50;
  assert.equal(killSwitch.isEngaged(), false, "Within the interval the cached value stands, which is why the stop time is measured.");
  now = 150;
  assert.equal(killSwitch.isEngaged(), true);
  assert.throws(() => createPolledKillSwitch(() => false, Number.NaN), /poll interval/);
});

/**
 * These two tests inject a clock that advances one millisecond per reading.
 * Against the real clock a zero-cost drain of a few hundred alerts finishes
 * inside a single poll interval, so whether the switch ever bites depends on
 * how fast the machine is, and the test passes or fails by luck. The wall-clock
 * measurement belongs in scripts/rehearse-kill-switch.mts, which is run and
 * reported on its own. What is asserted here is the arithmetic and the
 * accounting.
 */
const steppingClockBy = (stepMs: number) => { let now = 0; return () => (now += stepMs); };
const steppingClock = () => steppingClockBy(1);

test("the stop measurement reports a real observed duration, not a constant compared to five minutes", async () => {
  const sender = createRecordingSender();
  const measurement = await measureKillSwitchStop({ alerts: alerts(200), sender, pollIntervalMs: 50, engageAfterSends: 20, clock: steppingClock() });
  assert.ok(measurement.stopLatencyMs > 0, "A measured stop takes a positive amount of time.");
  assert.equal(measurement.stopLatencyMs, measurement.lastSendAfterEngagementAtMs! - measurement.engagedAtMs, "The stop is timed to the last alert that went out, not to the last refusal.");
  assert.equal(measurement.queueDrainAfterEngagementMs, measurement.lastRefusalAtMs - measurement.engagedAtMs);
  assert.ok(measurement.refusedByKillSwitch > 0);
  assert.equal(measurement.sentBeforeEngagement, 20);
  assert.ok(measurement.sentAfterEngagement >= 0, "Sends already under way when the switch is engaged still go out; that is the latency being measured.");
  assert.equal(measurement.sentBeforeEngagement + measurement.sentAfterEngagement, sender.delivered().length);
  assert.equal(measurement.sentBeforeEngagement + measurement.sentAfterEngagement + measurement.refusedByKillSwitch, measurement.queued, "Every queued alert is accounted for as sent or refused; none is lost.");
  assert.equal(measurement.underFiveMinutes, measurement.stopLatencyMs < FIVE_MINUTES_MS);
  assert.equal(FIVE_MINUTES_MS, 300_000);
});

test("a slow poll lets sends continue after engagement, and those sends are counted rather than assumed away", async () => {
  const sender = createRecordingSender();
  const measurement = await measureKillSwitchStop({ alerts: alerts(400), sender, pollIntervalMs: 50, engageAfterSends: 10, clock: steppingClock() });
  assert.equal(measurement.sentBeforeEngagement, 10);
  assert.ok(measurement.sentAfterEngagement > 0, "A switch read once per interval cannot stop the sends already inside that interval.");
  assert.ok(measurement.queueDrainAfterEngagementMs >= measurement.pollIntervalMs, "The switch cannot bite before the next poll.");
  assert.ok(measurement.stopLatencyMs < measurement.queueDrainAfterEngagementMs, "Sending stops before the drain finishes refusing what is left.");
  assert.equal(measurement.lastSendAfterEngagementAtMs !== undefined, measurement.sentAfterEngagement > 0);
  assert.ok(measurement.firstRefusalAtMs >= measurement.engagedAtMs);
  assert.ok(measurement.lastRefusalAtMs >= measurement.firstRefusalAtMs);
});

test("a measurement that never stopped a send refuses to report a duration", async () => {
  await assert.rejects(measureKillSwitchStop({ alerts: [], sender: createRecordingSender(), pollIntervalMs: 1, engageAfterSends: 1 }), /queued alerts/);
  await assert.rejects(measureKillSwitchStop({ alerts: alerts(3), sender: createRecordingSender(), pollIntervalMs: 1, engageAfterSends: 3 }), /before the queue empties/);
});

/**
 * The defect this pins. stopLatencyMs used to be timed to the last refusal,
 * which is when the drain finished walking the queue. At one fixed poll
 * interval a ten times longer queue reported roughly double the "stop latency"
 * while the switch behaved identically: 184 ms against 349 ms on a real clock.
 * The number named stop latency has to answer how long alerts kept reaching
 * people, so it is timed to the last send, and the drain figure is reported
 * separately under its own name.
 */
test("the stop latency is a property of the switch, not of how much was queued", async () => {
  const settings = { pollIntervalMs: 20, engageAfterSends: 10 } as const;
  const short = await measureKillSwitchStop({ ...settings, alerts: alerts(200), sender: createRecordingSender(), clock: steppingClock() });
  const long = await measureKillSwitchStop({ ...settings, alerts: alerts(2_000), sender: createRecordingSender(), clock: steppingClock() });

  assert.equal(short.stopLatencyMs, long.stopLatencyMs, "Ten times the queue, same switch, same stop.");
  assert.equal(short.sentAfterEngagement, long.sentAfterEngagement);
  assert.ok(
    long.queueDrainAfterEngagementMs > short.queueDrainAfterEngagementMs * 5,
    "The drain figure does scale with queue length, which is exactly why it cannot be the stop.",
  );
  assert.equal(short.underFiveMinutes, true);
  assert.equal(long.underFiveMinutes, true);
});

test("a switch read before any further send reports an immediate stop rather than a missing one", async () => {
  const sender = createRecordingSender();
  const measurement = await measureKillSwitchStop({ alerts: alerts(50), sender, pollIntervalMs: 0, engageAfterSends: 5, clock: steppingClock() });
  assert.equal(measurement.sentAfterEngagement, 0);
  assert.equal(measurement.lastSendAfterEngagementAtMs, undefined);
  assert.equal(measurement.stopLatencyMs, 0, "Nothing went out after engagement, so the stop took no time.");
  assert.ok(measurement.queueDrainAfterEngagementMs > 0, "The queue still had to be walked and refused.");
  assert.equal(measurement.underFiveMinutes, true);
});

test("underFiveMinutes reads the stop, so a long refusal walk cannot fail a switch that stopped at once", async () => {
  const sender = createRecordingSender();
  const measurement = await measureKillSwitchStop({ alerts: alerts(400), sender, pollIntervalMs: 0, engageAfterSends: 1, clock: steppingClockBy(1_000) });
  assert.equal(measurement.stopLatencyMs, 0);
  assert.ok(
    measurement.queueDrainAfterEngagementMs > FIVE_MINUTES_MS,
    "On this clock the refusal walk alone exceeds five minutes, which the old metric would have reported as a failed stop.",
  );
  assert.equal(measurement.underFiveMinutes, true);
});
