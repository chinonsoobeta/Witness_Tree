import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stamp = (date) => date.toISOString().replace(/[:.]/g, '-');
const safeName = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '-');

// Kept in sync with lib/wildfire/status-manifest.ts for consumers of current-status.json.

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
}

function sourceStatus({ prior = {}, source, timestamp, snapshot, now }) {
  if (source.response != null) {
    return { id: source.id, status: 'healthy', stale: false, consecutiveFailures: 0, lastSuccessAt: timestamp, lastGoodSnapshot: snapshot };
  }
  const consecutiveFailures = (prior.consecutiveFailures ?? 0) + 1;
  return { ...prior, id: source.id, status: consecutiveFailures >= 2 ? 'degraded' : 'retrying', stale: Boolean(prior.lastSuccessAt && now.getTime() - new Date(prior.lastSuccessAt).getTime() > 24 * 60 * 60 * 1000), consecutiveFailures, lastFailureAt: timestamp, nextRetryAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(), error: String(source.error) };
}

function statusManifest({ version, timestamp, sourceStatuses }) {
  return { version, refreshedAt: timestamp, sources: sourceStatuses.map(({ id, status, stale, consecutiveFailures, lastSuccessAt, lastFailureAt, nextRetryAt, lastGoodSnapshot, error }) => ({ id, status, stale, consecutiveFailures, lastSuccessAt, lastFailureAt, nextRetryAt, lastGoodSnapshot, error })) };
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

    async publish({ sources, now = new Date() }) {
      assertPayload(sources);
      if (!sources.some((source) => source.response != null)) throw new Error('Refusing to publish a wildfire refresh without a successful source.');
      const timestamp = now.toISOString();
      const version = stamp(now);
      const prior = await this.readState();
      const previous = await this.readCurrent();
      const priorSources = prior.sources ?? {};
      const previousSources = new Map((previous?.sources ?? []).map((source) => [source.id, source]));
      const snapshots = [];
      const currentSources = [];
      const sourceResponses = {};
      const sourceStatuses = [];
      for (const source of sources) {
        if (source.response != null) {
          const snapshot = { source: source.id, fetchedAt: timestamp, response: source.response };
          const snapshotPath = file('snapshots', `${version}-${safeName(source.id)}.json`);
          await writeImmutableJson(snapshotPath, snapshot);
          const snapshotRef = path.relative(root, snapshotPath);
          snapshots.push(snapshotRef);
          currentSources.push(source);
          sourceResponses[source.id] = source.sourceResponse ?? {};
          sourceStatuses.push(sourceStatus({ prior: priorSources[source.id], source, timestamp, snapshot: snapshotRef, now }));
        } else {
          const previousSource = previousSources.get(source.id);
          if (previousSource) currentSources.push(previousSource);
          if (previous?.sourceResponses?.[source.id]) sourceResponses[source.id] = previous.sourceResponses[source.id];
          sourceStatuses.push(sourceStatus({ prior: priorSources[source.id], source, timestamp, now }));
        }
      }
      const current = { version, refreshedAt: timestamp, sourceResponses, sources: currentSources, snapshots };
      const manifest = statusManifest({ version, timestamp, sourceStatuses });
      await writeJson(file('current', `${version}.json`), current);
      await writeJson(file('current.json'), current);
      await writeJson(file('current-status.json'), manifest);
      await writeJson(file('runs', `${version}.json`), { version, status: 'success', ...current });
      await writeJson(file('run-log.json'), { version, status: 'success', refreshedAt: timestamp, sourceResponses, sourceStatus: manifest.sources });
      await writeJson(file('state.json'), { status: 'healthy', consecutiveFailures: 0, lastSuccessAt: timestamp, sources: Object.fromEntries(sourceStatuses.map((source) => [source.id, source])) });
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
