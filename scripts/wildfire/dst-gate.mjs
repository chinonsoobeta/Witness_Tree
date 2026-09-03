// Decides whether a scheduled run is one of the four daily Pacific refreshes.
//
// Cron is UTC only, so four fixed America/Vancouver hours need eight UTC slots,
// four of which are wrong under the current offset and must be dropped. The
// question is which clock decides.
//
// Reading the wall clock at gate time is wrong. GitHub queues scheduled runs
// late, and on this repository it is late by hours: across the 100 most recent
// scheduled runs the delay was at least 38 minutes at the median and at least
// 349 at the worst, which moves the Pacific hour past the one the slot meant. A
// correct slot then reads as a wrong one and the refresh is dropped. The gate
// opened 39 of those 100 runs where the design intends 50, and between
// 2026-08-27 and 2026-09-02 it opened zero or one a day instead of four.
// data/wildfire-refresh-scheduler-delay-2026-09-02.json has the measurement,
// including why those delays are lower bounds.
//
// So the slot decides, not the clock. GitHub reports the cron expression that
// triggered the run in the event payload, which names the intended UTC hour
// exactly however late the run starts. That is what this converts to Pacific.
const PACIFIC_ZONE = 'America/Vancouver';
const REFRESH_HOURS = new Set([5, 12, 16, 21]);

export function vancouverHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).find((part) => part.type === 'hour')?.value;

  return Number(hour);
}

// The UTC hour named by a five-field cron expression, or null when the argument
// is not one. Null is never treated as "run": the caller decides loudly.
export function scheduledUtcHour(cron) {
  if (typeof cron !== 'string') return null;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  if (!/^\d{1,2}$/.test(fields[1])) return null;
  const hour = Number(fields[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

// The instant the schedule named: the most recent past occurrence of that UTC
// hour. A run queued for 23:00 UTC and started after midnight still belongs to
// the previous day's slot, so a future instant steps back one day.
export function scheduledInstant(utcHour, now = new Date()) {
  const instant = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour));
  if (instant.getTime() > now.getTime()) instant.setUTCDate(instant.getUTCDate() - 1);
  return instant;
}

// Converting the scheduled instant rather than `now` is also what makes the
// daylight saving transition itself correct: a slot that fires before the
// change and runs after it is still judged by the offset it was named under.
export function shouldRefreshScheduled(cron, now = new Date()) {
  const utcHour = scheduledUtcHour(cron);
  if (utcHour === null) return null;
  return REFRESH_HOURS.has(vancouverHour(scheduledInstant(utcHour, now)));
}

// A manual dispatch has no slot to honour, so it refreshes: the operator asked
// for it. Every other event must name its slot.
export function shouldRefresh({ event, cron, now = new Date() } = {}) {
  if (event !== 'schedule') return true;
  const decision = shouldRefreshScheduled(cron, now);
  if (decision === null) {
    throw new Error(
      `a scheduled run reported no usable cron expression (received ${JSON.stringify(cron)}), so the slot it belongs to is unknown. ` +
        'Each schedule entry must be a separate five-field expression and the workflow must pass github.event.schedule through.',
    );
  }
  return decision;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = shouldRefresh({ event: process.env.GITHUB_EVENT_NAME, cron: process.env.WILDFIRE_SCHEDULED_CRON });
  const output = `run=${run}`;
  if (process.env.GITHUB_OUTPUT) {
    await (await import('node:fs/promises')).appendFile(process.env.GITHUB_OUTPUT, `${output}\n`);
  }
  console.log(output);
}
