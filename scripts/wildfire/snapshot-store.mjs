import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stamp = (date) => date.toISOString().replace(/[:.]/g, '-');
const safeName = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '-');

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, json(value));
  await rename(temporary, file);
}

async function writeImmutableJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, json(value), { flag: 'wx' });
}

function assertPayload(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Refusing to publish an empty wildfire refresh.');
  }
  for (const source of sources) {
    if (!source?.id || (source.response == null && !source.error)) {
      throw new Error('Each wildfire source needs an id and either a response or an error.');
    }
  }
  // One source failing must not blank the others, but a refresh in which every source failed carries no new
  // observation. Publishing it would restamp the last-good data with a fresh timestamp and make stale data
  // look current.
  if (!sources.some((source) => source.response != null)) {
    throw new Error('Refusing to publish a wildfire refresh without a successful source.');
  }
}

// Per-source health, so an outage in one feed is visible rather than hidden behind the others. A failing source
// keeps the snapshot it last succeeded with, and is marked stale once that snapshot is more than a day old.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 15 * 60 * 1000;

function sourceStatus({ prior = {}, source, timestamp, snapshot, now }) {
  if (source.response != null) {
    return { id: source.id, status: 'healthy', stale: false, consecutiveFailures: 0, lastSuccessAt: timestamp, lastGoodSnapshot: snapshot };
  }
  const consecutiveFailures = (prior.consecutiveFailures ?? 0) + 1;
  return {
    ...prior,
    id: source.id,
    status: consecutiveFailures >= 2 ? 'degraded' : 'retrying',
    stale: Boolean(prior.lastSuccessAt && now.getTime() - new Date(prior.lastSuccessAt).getTime() > STALE_AFTER_MS),
    consecutiveFailures,
    lastFailureAt: timestamp,
    nextRetryAt: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
    error: String(source.error),
  };
}

// Kept in sync with lib/wildfire/status-manifest.ts for consumers of current-status.json.
function statusManifest({ version, timestamp, sourceStatuses }) {
  return {
    version,
    refreshedAt: timestamp,
    sources: sourceStatuses.map(({ id, status, stale, consecutiveFailures, lastSuccessAt, lastFailureAt, nextRetryAt, lastGoodSnapshot, error }) => (
      { id, status, stale, consecutiveFailures, lastSuccessAt, lastFailureAt, nextRetryAt, lastGoodSnapshot, error }
    )),
  };
}

function validDate(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid ISO timestamp.`);
  return date;
}

export function createSnapshotStore(root) {
  const file = (...parts) => path.join(root, ...parts);

  return {
    async readState() {
      return (await readJson(file('state.json'))) ?? { consecutiveFailures: 0, status: 'unknown', sources: {} };
    },

    async readCurrent() {
      return readJson(file('current.json'));
    },

    /**
     * Read immutable raw snapshots for a bounded historical query.  The query
     * never falls back to current.json, so an operational display cannot make
     * history appear complete when an immutable snapshot is absent.
     */
    async querySnapshots({ from, to, sourceId } = {}) {
      const start = from == null ? null : validDate(from, 'from');
      const end = to == null ? null : validDate(to, 'to');
      if (start && end && start > end) throw new Error('from must not be later than to.');
      let names;
      try {
        names = await readdir(file('snapshots'));
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      const snapshots = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
        const snapshot = await readJson(file('snapshots', name));
        if (!snapshot?.source || snapshot.response == null || !snapshot.fetchedAt) {
          throw new Error(`Immutable wildfire snapshot is invalid: ${name}.`);
        }
        const fetchedAt = validDate(snapshot.fetchedAt, `snapshots/${name}.fetchedAt`);
        return { ...snapshot, path: path.posix.join('snapshots', name), fetchedAt: fetchedAt.toISOString() };
      }));
      return snapshots.filter((snapshot) => (
        (!sourceId || snapshot.source === sourceId)
        && (!start || new Date(snapshot.fetchedAt) >= start)
        && (!end || new Date(snapshot.fetchedAt) <= end)
      )).sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt) || left.path.localeCompare(right.path));
    },

    async publish({ sources, now = new Date(), sourceResponses = {} }) {
      assertPayload(sources);
      const timestamp = now.toISOString();
      const version = stamp(now);
      const priorState = await this.readState();
      const priorCurrent = await this.readCurrent();
      const lastGood = new Map((priorCurrent?.sources ?? []).map((source) => [source.id, source]));
      const snapshots = [];
      const published = [];
      const sourceStatuses = [];
      for (const source of sources) {
        const prior = priorState.sources?.[source.id];
        if (source.response == null) {
          // The feed failed this round. Serve what it last returned rather than dropping it, so an outage in one
          // source cannot silently shrink the map, and record why it is being served.
          const retained = lastGood.get(source.id);
          if (retained) published.push(retained);
          sourceStatuses.push(sourceStatus({ prior, source, timestamp, now }));
          continue;
        }
        const snapshot = { source: source.id, fetchedAt: timestamp, response: source.response };
        const snapshotPath = file('snapshots', `${version}-${safeName(source.id)}.json`);
        await writeImmutableJson(snapshotPath, snapshot);
        const relative = path.relative(root, snapshotPath);
        snapshots.push(relative);
        published.push({ id: source.id, response: source.response });
        sourceStatuses.push(sourceStatus({ prior, source, timestamp, snapshot: relative, now }));
      }

      const manifest = statusManifest({ version, timestamp, sourceStatuses });
      const current = { version, refreshedAt: timestamp, sourceResponses, sources: published, snapshots };
      await writeJson(file('current', `${version}.json`), current);
      await writeJson(file('current.json'), current);
      await writeJson(file('current-status.json'), manifest);
      await writeJson(file('runs', `${version}.json`), { version, status: 'success', ...current });
      await writeJson(file('run-log.json'), { version, status: 'success', refreshedAt: timestamp, sourceResponses });
      await writeJson(file('state.json'), {
        status: sourceStatuses.every((source) => source.status === 'healthy') ? 'healthy' : 'degraded',
        consecutiveFailures: 0,
        lastSuccessAt: timestamp,
        sources: Object.fromEntries(sourceStatuses.map((source) => [source.id, source])),
      });
      return current;
    },

    async recordFailure({ error, now = new Date() }) {
      const prior = await this.readState();
      const consecutiveFailures = (prior.consecutiveFailures ?? 0) + 1;
      const timestamp = now.toISOString();
      const version = stamp(now);
      const status = consecutiveFailures >= 2 ? 'degraded' : 'retrying';
      const state = {
        ...prior,
        status,
        consecutiveFailures,
        lastFailureAt: timestamp,
        nextRetryAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        error: String(error?.message ?? error),
      };
      await writeJson(file('state.json'), state);
      await writeJson(file('runs', `${version}.json`), { version, status: 'failure', ...state });
      await writeJson(file('run-log.json'), { version, status: 'failure', ...state });
      return state;
    },

    async status(now = new Date()) {
      const state = await this.readState();
      if (!state.lastSuccessAt) return state;
      const ageMs = now.getTime() - new Date(state.lastSuccessAt).getTime();
      return { ...state, ageMs, status: ageMs > 24 * 60 * 60 * 1000 ? 'stale' : state.status };
    },
  };
}
