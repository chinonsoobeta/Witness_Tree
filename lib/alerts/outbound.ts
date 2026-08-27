import type { Locale } from "../domain/index.ts";
import { accountActivationStatus, type AccountActivationApproval }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../accounts/activation-gate.ts";

/**
 * The outbound path an alert would actually travel, and the kill switch that
 * stops it. The evaluator in ./triggers.ts already refuses to build payloads
 * while the switch is on, but an evaluator-only check cannot stop work that is
 * already queued. The switch is therefore read again immediately before every
 * single send, which is the only point where stopping means anything.
 *
 * No implementation here contacts a network. The only sender shipped is a
 * recording sender that delivers nothing, so nothing in this file can reach a
 * person. A real sender remains behind the closed activation gate.
 */

export type OutboundAlert = Readonly<{
  id: string;
  areaId: string;
  ownerId: string;
  locale: Locale;
  template: string;
}>;

export type RefusalReason = "kill-switch" | "service-not-activated";

export type SendOutcome = Readonly<{
  alertId: string;
  status: "sent" | "refused";
  reason?: RefusalReason;
  atMs: number;
}>;

/** Anything that can put an alert in front of a person. `deliversOutbound` is the honest declaration. */
export type AlertSender = Readonly<{
  name: string;
  deliversOutbound: boolean;
  send(alert: OutboundAlert): Promise<void>;
}>;

/** Read fresh at every send. An implementation may cache, but it must say for how long. */
export type KillSwitch = Readonly<{ isEngaged(): boolean }>;

export type Clock = () => number;

const defaultClock: Clock = () => performance.now();

export type RecordingSender = AlertSender & Readonly<{ delivered(): readonly OutboundAlert[] }>;

/** A sender that records and delivers nothing. It is the only sender in the repository. */
export function createRecordingSender(sendCostMs = 0): RecordingSender {
  const delivered: OutboundAlert[] = [];
  return Object.freeze({
    name: "recording",
    deliversOutbound: false,
    async send(alert: OutboundAlert): Promise<void> {
      if (sendCostMs > 0) await new Promise((resolve) => setTimeout(resolve, sendCostMs));
      delivered.push(alert);
    },
    delivered: () => delivered,
  });
}

export type LocalKillSwitch = KillSwitch & Readonly<{
  engage(): void;
  release(): void;
  engagedAtMs(): number | undefined;
}>;

/** One operator, one call, no arguments to get wrong. */
export function createKillSwitch(clock: Clock = defaultClock): LocalKillSwitch {
  let engagedAtMs: number | undefined;
  return Object.freeze({
    isEngaged: () => engagedAtMs !== undefined,
    engage: () => { if (engagedAtMs === undefined) engagedAtMs = clock(); },
    release: () => { engagedAtMs = undefined; },
    engagedAtMs: () => engagedAtMs,
  });
}

/**
 * A switch whose real state lives somewhere else, read at most once per poll
 * interval. This models a deployed sender reading a shared flag, and it is why
 * the stop time is measured rather than asserted: the observed stop can be up
 * to one poll interval plus one in-flight send behind the operator's action.
 */
export function createPolledKillSwitch(read: () => boolean, pollIntervalMs: number, clock: Clock = defaultClock): KillSwitch {
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) throw new Error("A kill-switch poll interval in milliseconds is required.");
  let cached = read();
  let readAtMs = clock();
  return Object.freeze({
    isEngaged(): boolean {
      const now = clock();
      if (now - readAtMs >= pollIntervalMs) { cached = read(); readAtMs = now; }
      return cached;
    },
  });
}

export type AlertQueue = Readonly<{
  enqueue(alert: OutboundAlert): void;
  size(): number;
  pending(): readonly OutboundAlert[];
  take(): OutboundAlert | undefined;
}>;

export function createAlertQueue(alerts: readonly OutboundAlert[] = []): AlertQueue {
  const entries: OutboundAlert[] = [...alerts];
  return Object.freeze({
    enqueue: (alert: OutboundAlert) => { entries.push(alert); },
    size: () => entries.length,
    pending: () => [...entries],
    take: () => entries.shift(),
  });
}

export type DrainResult = Readonly<{
  outcomes: readonly SendOutcome[];
  sent: number;
  refused: number;
  stoppedAtMs?: number;
  remaining: number;
}>;

export type DrainOptions = Readonly<{
  queue: AlertQueue;
  sender: AlertSender;
  killSwitch: KillSwitch;
  approval?: Partial<AccountActivationApproval>;
  clock?: Clock;
  onOutcome?: (outcome: SendOutcome) => void;
}>;

/**
 * Drains the queue, checking the kill switch immediately before each send.
 * A refused alert is recorded as refused and stays out of the sent count; it
 * is never silently dropped, because the plan requires the queue to be drained
 * or explicitly stopped, and silence is preferable to a wrong send.
 */
export async function drainQueue(options: DrainOptions): Promise<DrainResult> {
  const clock = options.clock ?? defaultClock;
  const outcomes: SendOutcome[] = [];
  const notActivated = options.sender.deliversOutbound && !accountActivationStatus(options.approval).enabled;
  let stoppedAtMs: number | undefined;
  for (let alert = options.queue.take(); alert !== undefined; alert = options.queue.take()) {
    const engaged = options.killSwitch.isEngaged();
    if (engaged || notActivated) {
      const outcome: SendOutcome = Object.freeze({ alertId: alert.id, status: "refused", reason: engaged ? "kill-switch" : "service-not-activated", atMs: clock() });
      if (engaged && stoppedAtMs === undefined) stoppedAtMs = outcome.atMs;
      outcomes.push(outcome);
      options.onOutcome?.(outcome);
      continue;
    }
    await options.sender.send(alert);
    const outcome: SendOutcome = Object.freeze({ alertId: alert.id, status: "sent", atMs: clock() });
    outcomes.push(outcome);
    options.onOutcome?.(outcome);
  }
  return Object.freeze({
    outcomes,
    sent: outcomes.filter((outcome) => outcome.status === "sent").length,
    refused: outcomes.filter((outcome) => outcome.status === "refused").length,
    ...(stoppedAtMs === undefined ? {} : { stoppedAtMs }),
    remaining: options.queue.size(),
  });
}

export const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type KillSwitchStopMeasurement = Readonly<{
  queued: number;
  /** Sends completed before the operator engaged the switch. */
  sentBeforeEngagement: number;
  /**
   * Sends that still went out after engagement, because the switch is polled.
   * This is the part of the stop that costs time, and it is counted, not assumed
   * to be zero.
   */
  sentAfterEngagement: number;
  /** Sends the engaged switch refused. Activation-gate refusals are not counted here. */
  refusedByKillSwitch: number;
  pollIntervalMs: number;
  engagedAtMs: number;
  firstRefusalAtMs: number;
  lastRefusalAtMs: number;
  lastSendAfterEngagementAtMs?: number;
  stopLatencyMs: number;
  underFiveMinutes: boolean;
}>;

export type MeasureKillSwitchStopOptions = Readonly<{
  alerts: readonly OutboundAlert[];
  sender: AlertSender;
  pollIntervalMs: number;
  engageAfterSends: number;
  approval?: Partial<AccountActivationApproval>;
  clock?: Clock;
}>;

/**
 * Engages the switch part way through a real drain and measures the elapsed
 * time from that engagement to the last send the drain refused. The returned
 * duration is observed, not declared: nothing here compares a constant to five
 * minutes and calls that a rehearsal.
 */
export async function measureKillSwitchStop(options: MeasureKillSwitchStopOptions): Promise<KillSwitchStopMeasurement> {
  if (options.alerts.length === 0) throw new Error("A stop measurement needs queued alerts to stop.");
  if (options.engageAfterSends < 1 || options.engageAfterSends >= options.alerts.length) throw new Error("The switch must be engaged after at least one send and before the queue empties.");
  const clock = options.clock ?? defaultClock;
  const queue = createAlertQueue(options.alerts);
  let operatorFlag = false;
  let engagedAtMs: number | undefined;
  let sent = 0;
  let sentAfterEngagement = 0;
  let lastSendAfterEngagementAtMs: number | undefined;
  const refusals: number[] = [];
  const killSwitch = createPolledKillSwitch(() => operatorFlag, options.pollIntervalMs, clock);
  await drainQueue({
    queue,
    sender: options.sender,
    killSwitch,
    approval: options.approval,
    clock,
    onOutcome: (outcome) => {
      if (outcome.status === "sent") {
        sent += 1;
        if (engagedAtMs !== undefined) { sentAfterEngagement += 1; lastSendAfterEngagementAtMs = outcome.atMs; }
        if (sent === options.engageAfterSends) { operatorFlag = true; engagedAtMs = clock(); }
        return;
      }
      if (outcome.reason === "kill-switch") refusals.push(outcome.atMs);
    },
  });
  if (engagedAtMs === undefined || refusals.length === 0) throw new Error("The drain finished without the kill switch stopping a send; nothing was measured.");
  const stopLatencyMs = refusals[refusals.length - 1]! - engagedAtMs;
  return Object.freeze({
    queued: options.alerts.length,
    sentBeforeEngagement: sent - sentAfterEngagement,
    sentAfterEngagement,
    refusedByKillSwitch: refusals.length,
    pollIntervalMs: options.pollIntervalMs,
    engagedAtMs,
    firstRefusalAtMs: refusals[0]!,
    lastRefusalAtMs: refusals[refusals.length - 1]!,
    ...(lastSendAfterEngagementAtMs === undefined ? {} : { lastSendAfterEngagementAtMs }),
    stopLatencyMs,
    underFiveMinutes: stopLatencyMs < FIVE_MINUTES_MS,
  });
}
