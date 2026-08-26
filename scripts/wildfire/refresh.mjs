import { readFile } from 'node:fs/promises';
import { createSnapshotStore } from './snapshot-store.mjs';

export async function refreshWildfire({ root, fetchSources, now = new Date() }) {
  const store = createSnapshotStore(root);
  try {
    const sources = await fetchSources();
    const sourceResponses = Object.fromEntries(sources.map((source) => [source.id, source.sourceResponse ?? {}]));
    return { ok: true, current: await store.publish({ sources, now, sourceResponses }) };
  } catch (error) {
    return { ok: false, state: await store.recordFailure({ error, now }) };
  }
}

async function configuredSources() {
  if (process.env.WILDFIRE_FIXTURE) {
    return JSON.parse(await readFile(process.env.WILDFIRE_FIXTURE, 'utf8'));
  }
  // A URL alone is not a cleared feed.  Until each feed has documented rights,
  // an admitted versioned snapshot contract, and production approval, the
  // scheduled route must stop before making any external request.
  throw new Error('No cleared live-wildfire feed is configured; refusing remote refresh.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.env.WILDFIRE_DATA_DIR ?? 'public/wildfire';
  const result = await refreshWildfire({ root, fetchSources: configuredSources });
  if (!result.ok) process.exitCode = 1;
}
