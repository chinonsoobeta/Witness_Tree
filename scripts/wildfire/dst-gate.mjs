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

export function shouldRefresh(now = new Date()) {
  return REFRESH_HOURS.has(vancouverHour(now));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = shouldRefresh();
  const output = `run=${run}`;
  if (process.env.GITHUB_OUTPUT) {
    await (await import('node:fs/promises')).appendFile(process.env.GITHUB_OUTPUT, `${output}\n`);
  }
  console.log(output);
}
