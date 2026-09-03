import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { scheduledInstant, scheduledUtcHour, shouldRefresh, shouldRefreshScheduled, vancouverHour } from '../scripts/wildfire/dst-gate.mjs';
import { refreshWildfire } from '../scripts/wildfire/refresh.mjs';
import { createSnapshotStore } from '../scripts/wildfire/snapshot-store.mjs';

const root = () => mkdtemp(path.join(os.tmpdir(), 'wildfire-workflow-'));
const sources = [{ id: 'bc', response: { incidents: [{ id: 'BC-1' }], perimeters: [] } }];
const execFile = promisify(execFileCallback);
const national = { id: 'national', response: { incidents: [{ id: 'CA-1' }], perimeters: [] } };

const UTC_SLOTS = [0, 4, 5, 12, 13, 19, 20, 23];
const cronFor = (hour) => `17 ${hour} * * *`;

// Which slots open, judged from the slot itself, on a day in each half of the year.
// Sorted because the Pacific hours a UTC-ordered slot list produces are rotated:
// under standard time the 00:00 UTC slot is the previous Pacific afternoon.
const openSlots = (now) => UTC_SLOTS
  .filter((hour) => shouldRefreshScheduled(cronFor(hour), now))
  .map((hour) => vancouverHour(scheduledInstant(hour, now)))
  .sort((a, b) => a - b);

test('the gate reads the slot from the cron expression, and refuses anything that is not one', () => {
  assert.equal(scheduledUtcHour('17 12 * * *'), 12);
  assert.equal(scheduledUtcHour('17 0 * * *'), 0);
  assert.equal(scheduledUtcHour('17 0,4,5 * * *'), null, 'a list of hours names no single slot');
  assert.equal(scheduledUtcHour('17 24 * * *'), null);
  assert.equal(scheduledUtcHour('17 12 * *'), null);
  assert.equal(scheduledUtcHour(''), null);
  assert.equal(scheduledUtcHour(undefined), null);
});

test('the eight UTC slots open exactly the four required Pacific hours in both halves of the year', () => {
  assert.deepEqual(openSlots(new Date('2026-01-15T13:30:00Z')), [5, 12, 16, 21]);
  assert.deepEqual(openSlots(new Date('2026-07-15T12:30:00Z')), [5, 12, 16, 21]);
});

test('a late run still belongs to its own slot, which is the whole point', () => {
  // GitHub queues scheduled runs late by hours. The 12:00 UTC slot is 05:00
  // Pacific in July; a gate reading the wall clock at 16:14 UTC would see 09:00
  // and drop a refresh that was correctly scheduled.
  const slot = cronFor(12);
  assert.equal(shouldRefreshScheduled(slot, new Date('2026-07-15T12:00:30Z')), true);
  assert.equal(shouldRefreshScheduled(slot, new Date('2026-07-15T16:14:34Z')), true);
  assert.equal(shouldRefreshScheduled(slot, new Date('2026-07-15T18:00:00Z')), true);
  assert.equal(vancouverHour(new Date('2026-07-15T16:14:34Z')), 9, 'the wall clock has moved off the slot');
});

test('a run queued before midnight UTC and started after it keeps the previous day\'s slot', () => {
  const started = new Date('2026-07-16T03:43:00Z');
  assert.equal(scheduledInstant(23, started).toISOString(), '2026-07-15T23:00:00.000Z');
  assert.equal(shouldRefreshScheduled(cronFor(23), started), true, '23:00 UTC is 16:00 Pacific in July');
});

test('a slot that crosses into the other offset is judged by the offset it was named under', () => {
  // Pacific daylight time ends at 02:00 local on 2026-11-01, which is 09:00 UTC.
  // The 12:00 UTC slot the day before is 05:00 PDT and must open; the 13:00 UTC
  // slot on the day itself is 05:00 PST and must open too.
  assert.equal(shouldRefreshScheduled(cronFor(12), new Date('2026-10-31T12:20:00Z')), true);
  assert.equal(shouldRefreshScheduled(cronFor(13), new Date('2026-10-31T13:20:00Z')), false);
  assert.equal(shouldRefreshScheduled(cronFor(13), new Date('2026-11-01T13:20:00Z')), true);
  assert.equal(shouldRefreshScheduled(cronFor(12), new Date('2026-11-01T12:20:00Z')), false);
});

test('a manual dispatch refreshes, and a scheduled run without a slot fails loudly instead of guessing', () => {
  assert.equal(shouldRefresh({ event: 'workflow_dispatch' }), true);
  assert.equal(shouldRefresh({ event: 'workflow_dispatch', cron: '' }), true);
  assert.throws(
    () => shouldRefresh({ event: 'schedule', cron: '17 0,4,5,12,13,19,20,23 * * *' }),
    /slot it belongs to is unknown/,
    'a combined expression names eight slots, so it identifies none of them',
  );
  assert.throws(() => shouldRefresh({ event: 'schedule', cron: undefined }), /slot it belongs to is unknown/);
});

test('the workflow declares one entry per slot and passes the triggering expression to the gate', async () => {
  const workflow = await readFile(new URL('../.github/workflows/wildfire-refresh.yml', import.meta.url), 'utf8');
  const crons = [...workflow.matchAll(/- cron: '(\d+) (\d+) \* \* \*'/g)];
  assert.deepEqual(crons.map(([, , hour]) => Number(hour)).sort((a, b) => a - b), UTC_SLOTS);
  assert.deepEqual([...new Set(crons.map(([, minute]) => minute))], ['17'], 'every slot fires off the top of the hour');
  assert.match(workflow, /WILDFIRE_SCHEDULED_CRON: \$\{\{ github\.event\.schedule \}\}/);
  assert.match(workflow, /run: sleep 900 && node scripts\/wildfire\/refresh\.mjs/);
});

test('workflow writes through a bot branch and pull request instead of protected main', async () => {
  const workflow = await readFile(new URL('../.github/workflows/wildfire-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\n {6}contents: write\n {6}pull-requests: write/);
  assert.match(workflow, /BRANCH="automation\/wildfire-refresh-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.match(workflow, /git push --set-upstream origin "\$BRANCH"/);
  assert.match(workflow, /gh pr create[\s\S]*--base main[\s\S]*--head "\$BRANCH"/);
  const pushLines = workflow.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('git push'));
  assert.deepEqual(pushLines, ['git push --set-upstream origin "$BRANCH"']);
});

test('an existing timestamped snapshot is never overwritten', async () => {
  const directory = await root();
  const store = createSnapshotStore(directory);
  const now = new Date('2026-08-11T19:00:00Z');
  await store.publish({ sources, now });
  await assert.rejects(() => store.publish({
    sources: [{ id: 'bc', response: { incidents: [{ id: 'replacement' }] } }],
    now,
  }), { code: 'EEXIST' });
  const snapshot = (await readdir(path.join(directory, 'snapshots')))[0];
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'snapshots', snapshot))).response, sources[0].response);
});

test('a successful refresh writes immutable snapshots and versioned current data', async () => {
  const directory = await root();
  const now = new Date('2026-08-11T19:00:00Z');
  const result = await refreshWildfire({ root: directory, now, fetchSources: async () => sources });
  assert.equal(result.ok, true);
  const current = JSON.parse(await readFile(path.join(directory, 'current.json')));
  assert.equal(current.refreshedAt, now.toISOString());
  const snapshots = await readdir(path.join(directory, 'snapshots'));
  assert.equal(snapshots.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'snapshots', snapshots[0]))).response, sources[0].response);
  await refreshWildfire({ root: directory, now: new Date(now.getTime() + 1), fetchSources: async () => sources });
  assert.equal((await readdir(path.join(directory, 'snapshots'))).length, 2);
  assert.equal((await readdir(path.join(directory, 'current'))).length, 2);
  assert.equal((await readdir(path.join(directory, 'runs'))).length, 2);
});

test('empty data is never published and the last good data remains', async () => {
  const directory = await root();
  await refreshWildfire({ root: directory, fetchSources: async () => sources });
  const before = await readFile(path.join(directory, 'current.json'), 'utf8');
  const failed = await refreshWildfire({ root: directory, fetchSources: async () => [] });
  assert.equal(failed.ok, false);
  assert.equal(await readFile(path.join(directory, 'current.json'), 'utf8'), before);
});

test('an uncleared configured endpoint is blocked before any remote refresh', async () => {
  const directory = await root();
  await assert.rejects(() => execFile(process.execPath, ['scripts/wildfire/refresh.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WILDFIRE_DATA_DIR: directory, WILDFIRE_SOURCE_URLS: JSON.stringify([{ id: 'uncleared', url: 'https://example.test/never-requested' }]) },
  }));
  const state = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.match(state.error, /No cleared live-wildfire feed/);
});

test('two failures produce degraded state and 15-minute retry metadata', async () => {
  const directory = await root();
  const now = new Date('2026-08-11T19:00:00Z');
  const fail = () => { throw new Error('source unavailable'); };
  await refreshWildfire({ root: directory, now, fetchSources: async () => fail() });
  const second = await refreshWildfire({ root: directory, now: new Date(now.getTime() + 1), fetchSources: async () => fail() });
  assert.equal(second.state.status, 'degraded');
  assert.equal(second.state.nextRetryAt, '2026-08-11T19:15:00.001Z');
});

test('data 25 hours after the last success is stale', async () => {
  const directory = await root();
  const store = createSnapshotStore(directory);
  const start = new Date('2026-08-10T00:00:00Z');
  await store.publish({ sources, now: start });
  assert.equal((await store.status(new Date('2026-08-11T01:00:00Z'))).status, 'stale');
});

test('a full simulated season remains immutable and is queryable by source and bounded time range', async () => {
  const directory = await root();
  const store = createSnapshotStore(directory);
  const seasonStart = new Date('2026-05-01T12:00:00Z');
  const snapshotsPerDay = 4;
  const days = 153; // May through September, inclusive, with four simulated captures daily.
  for (let day = 0; day < days; day += 1) {
    for (let slot = 0; slot < snapshotsPerDay; slot += 1) {
      const now = new Date(seasonStart.getTime() + (day * 24 + slot * 6) * 60 * 60 * 1000);
      await store.publish({ sources: [{ id: 'bc', response: { snapshot: `${day}-${slot}` } }], now });
    }
  }
  const all = await store.querySnapshots({ sourceId: 'bc' });
  assert.equal(all.length, days * snapshotsPerDay);
  assert.equal(all[0].response.snapshot, '0-0');
  assert.equal(all.at(-1).response.snapshot, `${days - 1}-${snapshotsPerDay - 1}`);
  const midSeason = await store.querySnapshots({
    sourceId: 'bc',
    from: '2026-07-01T00:00:00Z',
    to: '2026-07-31T23:59:59.999Z',
  });
  assert.ok(midSeason.length > 0);
  assert.ok(midSeason.every((snapshot) => snapshot.fetchedAt >= '2026-07-01T00:00:00.000Z' && snapshot.fetchedAt <= '2026-07-31T23:59:59.999Z'));
  await assert.rejects(() => store.querySnapshots({ from: '2026-08-01T00:00:00Z', to: '2026-07-01T00:00:00Z' }), /must not be later/);
});

test('one source outage retains its last-good data while other configured sources continue', async () => {
  const directory = await root();
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T19:00:00Z'), fetchSources: async () => [...sources, national] });
  const result = await refreshWildfire({ root: directory, now: new Date('2026-08-11T20:00:00Z'), fetchSources: async () => [{ id: 'bc', response: { incidents: [{ id: 'BC-2' }], perimeters: [] } }, { id: 'national', error: 'upstream unavailable' }] });
  assert.equal(result.ok, true);
  const current = JSON.parse(await readFile(path.join(directory, 'current.json')));
  assert.deepEqual(current.sources.map((source) => source.id), ['bc', 'national']);
  assert.equal(current.sources[0].response.incidents[0].id, 'BC-2');
  assert.equal(current.sources[1].response.incidents[0].id, 'CA-1');
  const manifest = JSON.parse(await readFile(path.join(directory, 'current-status.json')));
  assert.deepEqual(manifest.sources.map(({ id, status }) => [id, status]), [['bc', 'healthy'], ['national', 'retrying']]);
  assert.match(manifest.sources[1].lastGoodSnapshot, /national/);
});

test('a failed source is marked stale without discarding its last-good snapshot', async () => {
  const directory = await root();
  await refreshWildfire({ root: directory, now: new Date('2026-08-10T00:00:00Z'), fetchSources: async () => [...sources, national] });
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T00:00:00.001Z'), fetchSources: async () => [{ ...sources[0], response: { incidents: [{ id: 'BC-2' }], perimeters: [] } }, { id: 'national', error: 'still unavailable' }] });
  const manifest = JSON.parse(await readFile(path.join(directory, 'current-status.json')));
  const stale = manifest.sources.find((source) => source.id === 'national');
  assert.equal(stale.status, 'retrying');
  assert.equal(stale.stale, true);
  assert.match(stale.lastGoodSnapshot, /national/);
});

test('a second consecutive failure degrades the source, and a refresh with no successful source is refused', async () => {
  const directory = await root();
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T18:00:00Z'), fetchSources: async () => [...sources, national] });
  const outage = async () => [{ ...sources[0], response: { incidents: [{ id: 'BC-2' }], perimeters: [] } }, { id: 'national', error: 'upstream unavailable' }];
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T19:00:00Z'), fetchSources: outage });
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T20:00:00Z'), fetchSources: outage });
  const manifest = JSON.parse(await readFile(path.join(directory, 'current-status.json')));
  const degraded = manifest.sources.find((source) => source.id === 'national');
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.consecutiveFailures, 2);
  const store = createSnapshotStore(directory);
  await assert.rejects(() => store.publish({ sources: [{ id: 'bc', error: 'down' }, { id: 'national', error: 'down' }] }), /without a successful source/);
});
