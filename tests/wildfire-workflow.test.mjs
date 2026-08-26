import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { shouldRefresh, vancouverHour } from '../scripts/wildfire/dst-gate.mjs';
import { refreshWildfire } from '../scripts/wildfire/refresh.mjs';
import { createSnapshotStore } from '../scripts/wildfire/snapshot-store.mjs';

const root = () => mkdtemp(path.join(os.tmpdir(), 'wildfire-workflow-'));
const sources = [{ id: 'bc', response: { incidents: [{ id: 'BC-1' }], perimeters: [] } }];
const execFile = promisify(execFileCallback);

test('DST gate uses America/Vancouver and selects exactly the four local hours', () => {
  assert.equal(vancouverHour(new Date('2026-01-15T13:00:00Z')), 5);
  assert.equal(vancouverHour(new Date('2026-07-15T12:00:00Z')), 5);
  assert.equal(shouldRefresh(new Date('2026-01-15T20:00:00Z')), true);
  assert.equal(shouldRefresh(new Date('2026-07-15T19:00:00Z')), true);
  assert.equal(shouldRefresh(new Date('2026-07-15T20:00:00Z')), false);
});

test('DST gate selects exactly four hourly runs in a Pacific calendar day in both halves of the year', () => {
  for (const dayStart of ['2026-01-15T08:00:00Z', '2026-07-15T07:00:00Z']) {
    const selected = Array.from({ length: 24 }, (_, hour) => new Date(Date.parse(dayStart) + hour * 60 * 60 * 1000))
      .filter((now) => shouldRefresh(now))
      .map((now) => vancouverHour(now));
    assert.deepEqual(selected, [5, 12, 16, 21]);
  }
});

test('workflow cron covers both Pacific UTC offsets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/wildfire-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '0 0,4,5,12,13,19,20,23 \* \* \*'/);
  assert.match(workflow, /run: sleep 900 && node scripts\/wildfire\/refresh\.mjs/);
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
