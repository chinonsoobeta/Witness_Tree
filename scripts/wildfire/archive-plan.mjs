import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The only feeds the 2026-09-13 standing approval lets a scheduled run archive. SOPFEU is absent on purpose:
// its reuse terms are unresolved, so a snapshot of it must never reach the raw archive.
export const ARCHIVE_FEEDS = Object.freeze(['cwfis-current', 'bc-wildfire', 'ab-wildfire', 'on-fire-disturbance']);
export const APPROVAL_PATH = 'data/current-wildfire-scheduled-archive-owner-approval-2026-09-13.json';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SNAPSHOT_NAME = /^[0-9TZ-]+-[a-z-]+\.json$/;

function keysFor({ feed, fetchedAt, digest, filename }) {
  const stamp = new Date(fetchedAt).toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-');
  const prefix = `raw/${feed}/undeclared/${stamp}/${digest}`;
  return { payloadKey: `${prefix}/payload/${filename}`, sidecarKey: `${prefix}/manifest.json` };
}

export function sidecarFor({ feed, fetchedAt, payloadKey, byteLength, digest, filename }) {
  return `${JSON.stringify({
    schemaVersion: 'witness-tree/current-wildfire-scheduled-archive-sidecar/1',
    purpose: 'Immutable raw snapshot provenance only; never an admission, transformation, ingestion, release, or production decision.',
    authority: APPROVAL_PATH,
    source: { id: feed, fetchedAt },
    payload: { key: payloadKey, byteLength, sha256: digest, originalFilename: filename },
    sidecarRetention: 'rebuildable-not-locked',
  }, null, 2)}\n`;
}

/**
 * Turn the snapshots one refresh published into exact archive writes. Anything outside the approved feed list,
 * or any snapshot that does not describe itself consistently, stops the whole plan rather than being skipped,
 * so a partial archive can never look like a complete run.
 */
export async function buildArchivePlan({ root, current, approval }) {
  if (approval?.approved !== true || approval.retention?.mode !== 'COMPLIANCE' || !approval.retention?.retainUntil) {
    throw new Error('Scheduled archive writes need the recorded standing owner approval.');
  }
  if (JSON.stringify([...approval.feeds].sort()) !== JSON.stringify([...ARCHIVE_FEEDS].sort())) {
    throw new Error('The approval feed list does not match the feeds this plan may archive.');
  }
  if (!Array.isArray(current?.snapshots) || current.snapshots.length === 0) {
    throw new Error('A refresh with no new snapshot has nothing to archive.');
  }
  const writes = [];
  for (const relative of current.snapshots) {
    const filename = path.posix.basename(relative);
    if (relative !== path.posix.join('snapshots', filename) || !SNAPSHOT_NAME.test(filename)) {
      throw new Error(`Unexpected snapshot path: ${relative}.`);
    }
    const bytes = await readFile(path.join(root, relative));
    const snapshot = JSON.parse(bytes.toString('utf8'));
    const feed = snapshot.source;
    if (!ARCHIVE_FEEDS.includes(feed)) throw new Error(`Feed ${feed} is not approved for scheduled archiving.`);
    if (!filename.endsWith(`-${feed}.json`)) throw new Error(`Snapshot ${filename} does not name its own feed.`);
    if (snapshot.response == null || Number.isNaN(new Date(snapshot.fetchedAt).getTime())) {
      throw new Error(`Snapshot ${filename} has no response or no valid fetch time.`);
    }
    const digest = sha256(bytes);
    const { payloadKey, sidecarKey } = keysFor({ feed, fetchedAt: snapshot.fetchedAt, digest, filename });
    const sidecar = sidecarFor({ feed, fetchedAt: snapshot.fetchedAt, payloadKey, byteLength: bytes.length, digest, filename });
    writes.push({ feed, file: relative, byteLength: bytes.length, sha256: digest, payloadKey, sidecarKey, sidecar, sidecarSha256: sha256(sidecar) });
  }
  return {
    bucket: approval.bucket,
    region: approval.region,
    retention: { mode: approval.retention.mode, retainUntil: approval.retention.retainUntil },
    writes,
  };
}
