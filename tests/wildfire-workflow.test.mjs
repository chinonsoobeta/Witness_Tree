import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { shouldRefresh, vancouverHour } from '../scripts/wildfire/dst-gate.mjs';
import { refreshWildfire } from '../scripts/wildfire/refresh.mjs';
import { createSnapshotStore } from '../scripts/wildfire/snapshot-store.mjs';

const root = () => mkdtemp(path.join(os.tmpdir(), 'wildfire-workflow-'));
const sources = [{ id: 'bc', response: { incidents: [{ id: 'BC-1' }], perimeters: [] } }];
const national = { id: 'national', response: { incidents: [{ id: 'CA-1' }], perimeters: [] } };

test('DST gate uses America/Vancouver and selects exactly the four local hours', () => {
  assert.equal(vancouverHour(new Date('2026-01-15T13:00:00Z')), 5);
  assert.equal(vancouverHour(new Date('2026-07-15T12:00:00Z')), 5);
  assert.equal(shouldRefresh(new Date('2026-01-15T20:00:00Z')), true);
  assert.equal(shouldRefresh(new Date('2026-07-15T19:00:00Z')), true);
  assert.equal(shouldRefresh(new Date('2026-07-15T20:00:00Z')), false);
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

test('two failures produce degraded state and 15-minute retry metadata', async () => {
  const directory = await root();
  const now = new Date('2026-08-11T19:00:00Z');
  const fail = () => { throw new Error('source unavailable'); };
  await refreshWildfire({ root: directory, now, fetchSources: async () => fail() });
  const second = await refreshWildfire({ root: directory, now: new Date(now.getTime() + 1), fetchSources: async () => fail() });
  assert.equal(second.state.status, 'degraded');
  assert.equal(second.state.nextRetryAt, '2026-08-11T19:15:00.001Z');
});

test('data more than 24 hours old is stale', async () => {
  const directory = await root();
  const store = createSnapshotStore(directory);
  const start = new Date('2026-08-10T00:00:00Z');
  await store.publish({ sources, now: start });
  assert.equal((await store.status(new Date('2026-08-11T00:00:00.001Z'))).status, 'stale');
});

test('one source outage retains its last-good data while other configured sources continue', async () => {
  const directory = await root();
  const start = new Date('2026-08-11T19:00:00Z');
  await refreshWildfire({ root: directory, now: start, fetchSources: async () => [...sources, national] });
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
  const start = new Date('2026-08-10T00:00:00Z');
  await refreshWildfire({ root: directory, now: start, fetchSources: async () => [...sources, national] });
  await refreshWildfire({ root: directory, now: new Date('2026-08-11T00:00:00.001Z'), fetchSources: async () => [{ ...sources[0], response: { incidents: [{ id: 'BC-2' }], perimeters: [] } }, { id: 'national', error: 'still unavailable' }] });
  const manifest = JSON.parse(await readFile(path.join(directory, 'current-status.json')));
  const stale = manifest.sources.find((source) => source.id === 'national');
  assert.equal(stale.status, 'retrying');
  assert.equal(stale.stale, true);
  assert.match(stale.lastGoodSnapshot, /national/);
});
