import { readFile } from 'node:fs/promises';
import { createSnapshotStore } from './snapshot-store.mjs';

export async function refreshWildfire({ root, fetchSources, now = new Date() }) {
  const store = createSnapshotStore(root);
  try {
    const sources = await fetchSources();
    return { ok: true, current: await store.publish({ sources, now }) };
  } catch (error) {
    return { ok: false, state: await store.recordFailure({ error, now }) };
  }
}

async function configuredSources() {
  if (process.env.WILDFIRE_FIXTURE) {
    return JSON.parse(await readFile(process.env.WILDFIRE_FIXTURE, 'utf8'));
  }
  const configured = JSON.parse(process.env.WILDFIRE_SOURCE_URLS ?? '[]');
  if (configured.length === 0) throw new Error('WILDFIRE_SOURCE_URLS must list the provincial and national source endpoints.');
  return Promise.all(configured.map(async ({ id, url }) => {
    if (!id || !url) throw new Error('Each configured wildfire source needs an id and url.');
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`${id} returned HTTP ${response.status}.`);
      const fetchedAt = new Date().toISOString();
      return {
        id,
        response: await response.json(),
        sourceResponse: { url, fetchedAt, sourceUpdatedAt: response.headers.get('last-modified') },
      };
    } catch (error) {
      return { id, error: String(error?.message ?? error) };
    }
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.env.WILDFIRE_DATA_DIR ?? 'public/wildfire';
  const result = await refreshWildfire({ root, fetchSources: configuredSources });
  if (!result.ok) process.exitCode = 1;
}
