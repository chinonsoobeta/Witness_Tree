import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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
    if (!source?.id || source.response == null) {
      throw new Error('Each wildfire source needs an id and a response.');
    }
  }
}

export function createSnapshotStore(root) {
  const file = (...parts) => path.join(root, ...parts);

  return {
    async readState() {
      return (await readJson(file('state.json'))) ?? { consecutiveFailures: 0, status: 'unknown' };
    },

    async readCurrent() {
      return readJson(file('current.json'));
    },

    async publish({ sources, now = new Date(), sourceResponses = {} }) {
      assertPayload(sources);
      const timestamp = now.toISOString();
      const version = stamp(now);
      const snapshots = [];
      for (const source of sources) {
        const snapshot = {
          source: source.id,
          fetchedAt: timestamp,
          response: source.response,
        };
        const snapshotPath = file('snapshots', `${version}-${safeName(source.id)}.json`);
        await writeImmutableJson(snapshotPath, snapshot);
        snapshots.push(path.relative(root, snapshotPath));
      }

      const current = { version, refreshedAt: timestamp, sourceResponses, sources, snapshots };
      await writeJson(file('current', `${version}.json`), current);
      await writeJson(file('current.json'), current);
      await writeJson(file('runs', `${version}.json`), { version, status: 'success', ...current });
      await writeJson(file('run-log.json'), { version, status: 'success', refreshedAt: timestamp, sourceResponses });
      await writeJson(file('state.json'), { status: 'healthy', consecutiveFailures: 0, lastSuccessAt: timestamp });
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
