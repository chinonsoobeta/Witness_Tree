import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { APPROVAL_PATH, buildArchivePlan } from './archive-plan.mjs';

const execFile = promisify(execFileCallback);
export const STATUS_KEY = 'wildfire/current-status.json';
// The status JSON is the one mutable object the site reads, so it must not inherit the year-long immutable cache of
// release objects: a viewer would keep an old freshness stamp long after the data went stale.
export const STATUS_CACHE_CONTROL = 'public,max-age=60,must-revalidate';

const required = (env, name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; refusing to write to the archive without it.`);
  return value;
};

const awsJson = async (run, args) => JSON.parse((await run(['s3api', ...args, '--output', 'json'])) || '{}');

/**
 * Archive what one successful refresh published, then publish its status. Retention is never defaulted: the mode and
 * date must be passed explicitly and must equal the recorded owner approval, and every payload is read back before
 * the next write so a lock that did not take stops the run. Each put uses If-None-Match so nothing is overwritten.
 */
export async function uploadArchive({ root, env = process.env, run = defaultRun, approval, log = console.log }) {
  const mode = required(env, 'WILDFIRE_ARCHIVE_RETENTION_MODE');
  const retainUntil = required(env, 'WILDFIRE_ARCHIVE_RETAIN_UNTIL');
  const deliveryBucket = required(env, 'WILDFIRE_DELIVERY_BUCKET');
  if (mode !== approval.retention.mode || retainUntil !== approval.retention.retainUntil) {
    throw new Error(`Retention ${mode} until ${retainUntil} does not match the recorded approval.`);
  }
  const current = JSON.parse(await readFile(path.join(root, 'current.json'), 'utf8'));
  const plan = await buildArchivePlan({ root, current, approval });
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'wildfire-archive-'));
  const receipts = [];
  for (const write of plan.writes) {
    const put = await awsJson(run, [
      'put-object', '--bucket', plan.bucket, '--key', write.payloadKey, '--body', path.join(root, write.file),
      '--if-none-match', '*', '--content-type', 'application/json', '--checksum-algorithm', 'SHA256',
      '--object-lock-mode', mode, '--object-lock-retain-until-date', retainUntil,
    ]);
    const head = await awsJson(run, ['head-object', '--bucket', plan.bucket, '--key', write.payloadKey, '--version-id', put.VersionId, '--checksum-mode', 'ENABLED']);
    const expectedChecksum = Buffer.from(write.sha256, 'hex').toString('base64');
    if (head.ObjectLockMode !== mode || new Date(head.ObjectLockRetainUntilDate).getTime() !== new Date(retainUntil).getTime()
      || head.ContentLength !== write.byteLength || head.ChecksumSHA256 !== expectedChecksum) {
      throw new Error(`Readback of ${write.payloadKey} does not match what was written.`);
    }
    const sidecarFile = path.join(scratch, `${write.sha256}.manifest.json`);
    await writeFile(sidecarFile, write.sidecar, { flag: 'wx' });
    const sidecar = await awsJson(run, [
      'put-object', '--bucket', plan.bucket, '--key', write.sidecarKey, '--body', sidecarFile,
      '--if-none-match', '*', '--content-type', 'application/json', '--checksum-algorithm', 'SHA256',
    ]);
    receipts.push({ feed: write.feed, key: write.payloadKey, versionId: put.VersionId, sha256: write.sha256, sidecarVersionId: sidecar.VersionId });
  }
  // Published last, so the status the site reads never names a snapshot that is not already locked in the archive.
  await awsJson(run, [
    'put-object', '--bucket', deliveryBucket, '--key', STATUS_KEY, '--body', path.join(root, 'current-status.json'),
    '--content-type', 'application/json', '--cache-control', STATUS_CACHE_CONTROL,
  ]);
  const summary = { refreshedAt: current.refreshedAt, retention: { mode, retainUntil }, archived: receipts, status: `s3://${deliveryBucket}/${STATUS_KEY}` };
  log(JSON.stringify(summary, null, 2));
  return summary;
}

async function defaultRun(args) {
  const { stdout } = await execFile('aws', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const approval = JSON.parse(await readFile(APPROVAL_PATH, 'utf8'));
  await uploadArchive({ root: process.env.WILDFIRE_DATA_DIR ?? 'public/wildfire', approval });
}
