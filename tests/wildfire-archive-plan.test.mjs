import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { APPROVAL_PATH, ARCHIVE_FEEDS, buildArchivePlan } from '../scripts/wildfire/archive-plan.mjs';
import { STATUS_CACHE_CONTROL, STATUS_KEY, retainUntilFor, uploadArchive } from '../scripts/wildfire/archive-upload.mjs';
import { createSnapshotStore } from '../scripts/wildfire/snapshot-store.mjs';

const approval = JSON.parse(await readFile(new URL(`../${APPROVAL_PATH}`, import.meta.url), 'utf8'));
const now = new Date('2026-09-13T12:17:04.123Z');

async function published(sources) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wildfire-archive-plan-'));
  const current = await createSnapshotStore(root).publish({ sources, now });
  return { root, current };
}

test('the recorded approval covers exactly the four admitted feeds, locked for two years, and claims nothing ran', () => {
  assert.deepEqual([...approval.feeds].sort(), [...ARCHIVE_FEEDS].sort());
  assert.ok(!approval.feeds.includes('sopfeu'));
  assert.equal(approval.retention.mode, 'COMPLIANCE');
  assert.equal(approval.retention.period, 'P2Y');
  assert.equal(approval.bucket, 'witness-tree-raw-archive-ca-central-1');
  assert.ok(approval.deniedActions.includes('s3:DeleteObjectVersion') && approval.deniedActions.includes('s3:BypassGovernanceRetention'));
  assert.ok(Object.values(approval.claims).every((claim) => claim === false), 'nothing is provisioned, executed, or admitted');
});

test('a lock runs whole calendar years from the moment of writing and is never shorter', () => {
  assert.equal(retainUntilFor('P2Y', new Date('2026-09-13T12:17:04.123Z')), '2028-09-13T12:17:04Z');
  assert.equal(retainUntilFor('P2Y', new Date('2028-02-29T00:00:00Z')), '2030-03-01T00:00:00Z');
  assert.throws(() => retainUntilFor('P0Y', now), /whole number of years/);
  assert.throws(() => retainUntilFor('P18M', now), /whole number of years/);
});

test('each new snapshot becomes one exact payload key and one sibling sidecar', async () => {
  const { root, current } = await published([{ id: 'bc-wildfire', response: { features: [{ id: 'G1' }] } }]);
  const plan = await buildArchivePlan({ root, current, approval });
  assert.equal(plan.writes.length, 1);
  const [write] = plan.writes;
  const bytes = await readFile(path.join(root, current.snapshots[0]));
  assert.equal(write.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(write.payloadKey, `raw/bc-wildfire/undeclared/2026-09-13T12-17-04Z/${write.sha256}/payload/2026-09-13T12-17-04-123Z-bc-wildfire.json`);
  assert.equal(write.sidecarKey, `raw/bc-wildfire/undeclared/2026-09-13T12-17-04Z/${write.sha256}/manifest.json`);
  assert.match(write.sidecar, /rebuildable-not-locked/);
  assert.deepEqual(plan.retention, { mode: 'COMPLIANCE', period: 'P2Y' });
});

test('a feed outside the approval stops the whole plan', async () => {
  const { root, current } = await published([
    { id: 'bc-wildfire', response: { features: [] } },
    { id: 'sopfeu', response: { features: [] } },
  ]);
  await assert.rejects(() => buildArchivePlan({ root, current, approval }), /sopfeu is not approved/);
});

const retentionEnv = {
  WILDFIRE_ARCHIVE_RETENTION_MODE: 'COMPLIANCE',
  WILDFIRE_ARCHIVE_RETENTION_PERIOD: 'P2Y',
  WILDFIRE_DELIVERY_BUCKET: 'witness-tree-public-delivery-ca-central-1',
};
const uploadAt = () => new Date('2026-09-13T16:17:30.500Z');

// A stand-in for the AWS CLI that records every call and answers readbacks from what was put.
function fakeAws({ lockMode, lockUntil } = {}) {
  const calls = [];
  const objects = new Map();
  const run = async (args) => {
    calls.push(args);
    const value = (flag) => args[args.indexOf(flag) + 1];
    if (args[1] === 'put-object') {
      const bytes = await readFile(value('--body'));
      const versionId = `v${calls.length}`;
      objects.set(versionId, { bytes, mode: args.includes('--object-lock-mode') ? value('--object-lock-mode') : undefined, until: value('--object-lock-retain-until-date') });
      return JSON.stringify({ VersionId: versionId });
    }
    const object = objects.get(value('--version-id'));
    return JSON.stringify({
      ContentLength: object.bytes.length,
      ChecksumSHA256: createHash('sha256').update(object.bytes).digest('base64'),
      ObjectLockMode: lockMode ?? object.mode,
      ObjectLockRetainUntilDate: lockUntil ?? object.until.replace('Z', '+00:00'),
    });
  };
  return { calls, run };
}

test('the uploader locks each payload for two years, never overwrites, reads it back, and publishes status last with a short cache', async () => {
  const { root } = await published([
    { id: 'cwfis-current', response: { features: [{ id: 'P1' }] } },
    { id: 'on-fire-disturbance', response: { features: [{ id: 'O1' }] } },
  ]);
  const aws = fakeAws();
  const summary = await uploadArchive({ root, env: retentionEnv, run: aws.run, approval, now: uploadAt, log: () => {} });
  assert.equal(summary.archived.length, 2);
  assert.ok(summary.archived.every((receipt) => receipt.retainUntil === '2028-09-13T16:17:30Z'));
  const puts = aws.calls.filter((args) => args[1] === 'put-object');
  assert.equal(puts.length, 5, 'two payloads, two sidecars, one status object');
  const archivePuts = puts.filter((args) => args.includes('witness-tree-raw-archive-ca-central-1'));
  assert.ok(archivePuts.every((args) => args[args.indexOf('--if-none-match') + 1] === '*'), 'no archive write can replace an object');
  const payloadPuts = archivePuts.filter((args) => !args[args.indexOf('--key') + 1].endsWith('/manifest.json'));
  assert.equal(payloadPuts.length, 2);
  assert.ok(payloadPuts.every((args) => args.join(' ').includes('--object-lock-mode COMPLIANCE --object-lock-retain-until-date 2028-09-13T16:17:30Z')));
  assert.ok(archivePuts.filter((args) => args[args.indexOf('--key') + 1].endsWith('/manifest.json')).every((args) => !args.includes('--object-lock-mode')), 'sidecars stay unlocked');
  assert.ok(aws.calls.every((args) => !/delete|legal-hold|bypass/i.test(args.join(' '))));
  const status = aws.calls.at(-1);
  assert.equal(status[status.indexOf('--key') + 1], STATUS_KEY);
  assert.equal(status[status.indexOf('--cache-control') + 1], STATUS_CACHE_CONTROL);
});

test('the uploader refuses missing or unapproved retention, and stops when a lock does not read back', async () => {
  const { root } = await published([{ id: 'bc-wildfire', response: { features: [] } }]);
  for (const name of Object.keys(retentionEnv)) {
    const aws = fakeAws();
    await assert.rejects(() => uploadArchive({ root, env: { ...retentionEnv, [name]: '' }, run: aws.run, approval, now: uploadAt, log: () => {} }), new RegExp(`${name} is not set`));
    assert.equal(aws.calls.length, 0);
  }
  await assert.rejects(() => uploadArchive({ root, env: { ...retentionEnv, WILDFIRE_ARCHIVE_RETENTION_PERIOD: 'P1Y' }, run: fakeAws().run, approval, now: uploadAt, log: () => {} }), /does not match the recorded approval/);
  for (const broken of [{ lockMode: 'GOVERNANCE' }, { lockUntil: '2027-09-13T16:17:30+00:00' }]) {
    const aws = fakeAws(broken);
    await assert.rejects(() => uploadArchive({ root, env: retentionEnv, run: aws.run, approval, now: uploadAt, log: () => {} }), /Readback .* does not match/);
    assert.ok(!aws.calls.some((args) => args.includes(STATUS_KEY)), 'status is never published over an unverified archive write');
  }
});

test('a refresh without a new snapshot, or without the approval, archives nothing', async () => {
  const { root } = await published([{ id: 'ab-wildfire', response: { features: [] } }]);
  await assert.rejects(() => buildArchivePlan({ root, current: { snapshots: [] }, approval }), /nothing to archive/);
  const { current } = await published([{ id: 'ab-wildfire', response: { features: [] } }]);
  await assert.rejects(() => buildArchivePlan({ root, current, approval: { ...approval, approved: false } }), /standing owner approval/);
  await assert.rejects(() => buildArchivePlan({ root, current, approval: { ...approval, retention: { mode: 'COMPLIANCE' } } }), /standing owner approval/);
  await assert.rejects(() => buildArchivePlan({ root, current, approval: { ...approval, feeds: [...approval.feeds, 'sopfeu'] } }), /feed list does not match/);
});
