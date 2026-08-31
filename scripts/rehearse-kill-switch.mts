import { createRecordingSender, measureKillSwitchStop, type OutboundAlert }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/alerts/outbound.ts";

/**
 * A self-timed local drill of the outbound kill switch. It queues alerts,
 * drains them through the recording sender, engages the switch part way, and
 * prints how long outbound sending continued past that engagement.
 *
 * It also prints the time to the last refusal, separately and under its own
 * name, because that is what an operator watching the process would see. That
 * number tracks queue length rather than switch responsiveness and is not the
 * stop.
 *
 * What this is: a real measurement of this code's stop latency.
 * What this is not: the Phase 6 rehearsal. That criterion asks for an operable
 * kill switch stopping real outbound alerts, timed by someone who did not
 * build it. There is no sender that reaches a person, and this process timed
 * itself, so it cannot satisfy either half. Nothing here may be recorded as
 * rehearsal evidence.
 */

const number = (flag: string, fallback: number) => {
  const raw = process.argv.find((argument) => argument.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number.`);
  return parsed;
};

const queued = number("--alerts", 2_000);
const pollIntervalMs = number("--poll-interval-ms", 250);
const sendCostMs = number("--send-cost-ms", 1);
const engageAfterSends = number("--engage-after-sends", Math.max(1, Math.floor(queued / 4)));

const alerts: readonly OutboundAlert[] = Array.from({ length: queued }, (_unused, index) => ({
  id: `alert-${index}`,
  areaId: "area-illustrative",
  ownerId: "account-illustrative",
  locale: "en" as const,
  template: "Illustrative payload. This drill delivers nothing.",
}));

const sender = createRecordingSender(sendCostMs);
const measurement = await measureKillSwitchStop({ alerts, sender, pollIntervalMs, engageAfterSends });

console.log(JSON.stringify({
  schemaVersion: "witness-tree/kill-switch-local-drill/1",
  startedAt: new Date().toISOString(),
  sender: { name: sender.name, deliversOutbound: sender.deliversOutbound },
  measurement,
  independentlyObserved: false,
  deliversToRecipients: false,
  boundary: "Self-timed local drill against a recording sender. It is not the independent rehearsal Phase 6 requires and must not be recorded as one.",
}, null, 2));

console.log(`Measured stop latency: ${measurement.stopLatencyMs.toFixed(3)} ms from engaging the switch to the last alert that still went out. ${measurement.sentBeforeEngagement} sends went out before engagement, ${measurement.sentAfterEngagement} still went out after it, and ${measurement.refusedByKillSwitch} were refused, with a ${measurement.pollIntervalMs} ms poll interval.`);
console.log(`The drain then took ${measurement.queueDrainAfterEngagementMs.toFixed(3)} ms from engagement to walk the remaining queue and refuse it. That figure grows with queue length at an unchanged stop latency, so it is reported but never gated on.`);
console.log("Independent observation and a sender that reaches a person are both still missing. This drill closes neither.");
process.exit(measurement.underFiveMinutes ? 0 : 1);
