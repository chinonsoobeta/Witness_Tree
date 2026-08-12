import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SHA_256 = /^[a-f0-9]{64}$/i;
const UNKNOWN_ZERO = /\bunknown\b\s*[:=]?\s*0(?:\.0+)?\b/i;

function validateManifest(manifest) {
  if (!manifest?.releaseId || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.releaseId)) throw new Error('Release manifest requires a valid release ID.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.releaseDate ?? '')) throw new Error('Release manifest requires a release date.');
  if (!Number.isInteger(manifest.latestDataEndYear) || manifest.latestDataEndYear > new Date().getUTCFullYear()) throw new Error('Release manifest latest data end year is invalid.');
  if (!manifest.boundaryEdition?.trim() || !manifest.methodVersion?.trim()) throw new Error('Release manifest requires boundary and method versions.');
  if (!/^https:\/\//.test(manifest.correctionsUrl ?? '')) throw new Error('Release manifest requires an HTTPS corrections link.');
  if (typeof manifest.degraded !== 'boolean' || typeof manifest.stale !== 'boolean') throw new Error('Release manifest requires degraded and stale flags.');
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('Release manifest requires artifacts.');
  if (!manifest.note?.en?.trim() || !manifest.note?.fr?.trim()) throw new Error('Release manifest requires a bilingual note.');
  if (UNKNOWN_ZERO.test(JSON.stringify(manifest))) throw new Error('Release manifest must not publish an Unknown numeric zero.');
  const ids = new Set();
  for (const artifact of manifest.artifacts) {
    if (!artifact.id || !artifact.licenceId) throw new Error(`Artifact ${artifact?.id ?? "unknown"} requires a licence ID.`);
    if (ids.has(artifact.id)) throw new Error(`Artifact ${artifact.id} is duplicated.`);
    ids.add(artifact.id);
    if (!SHA_256.test(artifact.sha256 ?? '')) throw new Error(`Artifact ${artifact.id} requires a SHA-256 checksum.`);
  }
}

export async function verifyRelease(manifestPath) {
  if (!manifestPath) throw new Error('Usage: node scripts/verify-release.mjs <manifest.json>');
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, 'utf8'));
  validateManifest(manifest);
  for (const artifact of manifest.artifacts) {
    if (!artifact.localPath) continue;
    const bytes = await readFile(path.resolve(path.dirname(absoluteManifestPath), artifact.localPath));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== artifact.sha256.toLowerCase()) throw new Error(`SHA-256 mismatch for ${artifact.id}.`);
  }
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await verifyRelease(process.argv[2]);
  console.log('Release manifest verified.');
}
