import { readFile } from 'node:fs/promises';
import { fetchAdmittedFeeds } from './feed-contract.mjs';
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

export async function configuredSources({ env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (env.WILDFIRE_FIXTURE) {
    return JSON.parse(await readFile(env.WILDFIRE_FIXTURE, 'utf8'));
  }
  // Endpoints come only from the owner-admitted contract. A URL supplied at run time is not a cleared feed, and
  // honouring one would let a repository variable add a source nobody admitted, so its presence stops the run
  // before any request.
  if (env.WILDFIRE_SOURCE_URLS?.trim()) {
    throw new Error('WILDFIRE_SOURCE_URLS is set; refusing remote refresh, because only the owner-admitted feeds in scripts/wildfire/feed-contract.mjs may be fetched.');
  }
  return fetchAdmittedFeeds({ fetchImpl, now });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.env.WILDFIRE_DATA_DIR ?? 'public/wildfire';
  const now = new Date();
  const result = await refreshWildfire({ root, now, fetchSources: () => configuredSources({ now }) });
  if (!result.ok) process.exitCode = 1;
}
