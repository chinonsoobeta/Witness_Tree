import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const record = JSON.parse(await readFile(new URL('../data/phase1-archive-live-readback-2026-08-20.json', import.meta.url), 'utf8'));

test('Phase 1 archive readback is redacted and remains read-only', () => {
  assert.equal(record.status, 'read-only-live-audit');
  assert.deepEqual(record.mutationsPerformed, []);
  assert.equal(record.versionIdsRecorded, false);
  assert.equal(record.productionEligible, false);
  const keys = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      keys.push(key.toLowerCase());
      visit(child);
    }
  };
  visit(record);
  for (const forbidden of ['versionid', 'credential', 'accesskey', 'secret']) {
    assert.equal(keys.some((key) => key === forbidden), false, `unexpected sensitive field: ${forbidden}`);
  }
});

test('live archive controls and national readback remain explicit', () => {
  assert.equal(record.primaryBucket.versioning, 'Enabled');
  assert.equal(record.primaryBucket.objectLock, 'Enabled');
  assert.equal(record.primaryBucket.replication.status, 'Enabled');
  assert.equal(record.primaryBucket.lifecycle.abortIncompleteMultipartAfterDays, 7);
  assert.equal(record.national.annualVlce2.payloadObjectCount, 39);
  assert.equal(record.national.annualVlce2.manifestObjectCount, 39);
  assert.equal(record.national.annualVlce2.payloadRetention.observedOnEveryPayload, true);
  assert.equal(record.national.annualVlce2.recoveryPayloadObjectCount, 0);
  assert.equal(record.national.annualVlce2.repositoryContradiction.recordedState, 'remote-verified; 39 retained payload versions');
  assert.equal(record.national.annualVlce2.repositoryContradiction.reconciliation, 'no ledger change required');
  assert.equal(record.national.canopyHeight.primaryObjectCount, 0);
  assert.equal(record.national.federalElectoralDistricts.primaryObjectCount, 0);
});

test('current-wildfire and Quebec status cannot be mistaken for complete promotions', () => {
  assert.deepEqual(record.currentWildfire.raw.map(({ sourceId }) => sourceId), [
    'cwfis-current',
    'bc-wildfire',
    'ab-wildfire',
    'on-fire-disturbance',
  ]);
  for (const source of record.currentWildfire.raw) {
    assert.match(source.primaryPayload, /COMPLIANCE/);
    assert.match(source.recoveryPayload, /REPLICA/);
  }
  assert.equal(record.currentWildfire.derived['bc-wildfire'].manifestPresent, false);
  assert.equal(record.currentWildfire.derived['bc-wildfire'].retention, 'NONE');
  assert.equal(record.currentWildfire.derived['on-fire-disturbance'].primaryObjectCount, 0);
  for (const entry of Object.values(record.quebec).slice(0, 3)) {
    assert.equal(entry.primaryObjectCount, 0);
    assert.equal(entry.recoveryObjectCount, 0);
  }
});

test('archive-control exercise is present but does not satisfy required proofs', () => {
  assert.equal(record.archiveControlExercise.primaryObjectCount, 2);
  assert.equal(record.archiveControlExercise.recoveryReplicaCount, 2);
  assert.equal(record.archiveControlExercise.retentionStateAtCapture, 'expired');
  assert.equal(record.archiveControlExercise.legalHoldAtCapture, 'OFF on both primary objects and both replicas');
  assert.deepEqual(record.archiveControlExercise.requiredProofs, {
    legalHoldOnTransition: false,
    legalHoldOffTransition: false,
    unchangedComplianceRetention: false,
    deniedExactVersionDelete: false,
    authorizedRecoveryReadback: false,
  });
  assert.equal(record.percentageImpact.baselineRawEvidenceNumerator, 14.75);
  assert.equal(record.percentageImpact.baselineFormalPercentage, 39.2741935);
  assert.equal(record.percentageImpact.canonicalRawReconciliation.rawEvidenceNumeratorDelta, 0);
  assert.equal(record.percentageImpact.canonicalRawReconciliation.formalPercentagePointDelta, 0);
  assert.equal(record.percentageImpact.productionPercentagePointDelta, 0);
  assert.equal(record.percentageImpact.repositoryPercentagePointDelta, 0);
  assert.match(record.percentageImpact.canonicalRawReconciliation.basis, /historical operator observations.*no durable concrete version\/checksum binding.*zero of the six/i);
});
