import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
const exists = (file) => typeof file === "string" && file.startsWith("data/") && existsSync(path.join(ROOT, file));
const formalDelta = (rawCreditDelta) => Number((30 * rawCreditDelta / 31).toFixed(7));

const ROW_IDS = [
  "bc-wildfire",
  "on-fire-disturbance",
  "bc-fta-cutblocks",
  "bc-harvesting-authorities",
  "bc-vri",
  "bc-consolidated-cutblocks",
  "bc-old-growth-bec",
  "bc-forest-operations-map",
  "on-fri",
  "on-fri-term-2",
  "provincial-electoral-boundaries"
];

const GROUPS = {
  "bc-ontario-current-wildfire-derived-gate": {
    rows: ["bc-wildfire", "on-fire-disturbance"],
    currentRawCreditDelta: 0,
    maximumRawCreditDelta: 0,
    maximumFormalPercentagePointDelta: 0
  },
  "bc-access-blocked-routes": {
    rows: [
      "bc-fta-cutblocks",
      "bc-harvesting-authorities",
      "bc-vri",
      "bc-consolidated-cutblocks",
      "bc-old-growth-bec",
      "bc-forest-operations-map"
    ],
    currentRawCreditDelta: 0,
    maximumRawCreditDelta: 6,
    maximumFormalPercentagePointDelta: 5.8064516
  },
  "ontario-fri-term2-routes": {
    rows: ["on-fri", "on-fri-term-2"],
    currentRawCreditDelta: 0,
    maximumRawCreditDelta: 2,
    maximumFormalPercentagePointDelta: 1.9354839
  },
  "provincial-electoral-boundaries-partial": {
    rows: ["provincial-electoral-boundaries"],
    currentRawCreditDelta: 0,
    maximumRawCreditDelta: 0.75,
    maximumFormalPercentagePointDelta: 0.7258065
  }
};

const CLAIMS = {
  remoteMutationPerformed: false,
  externalReplyResolved: false,
  permissionGranted: false,
  archiveEvidenceAdded: false,
  productionAdmission: false,
  productionEligible: false
};

const ROW_CLAIMS = {
  archiveMutation: false,
  permissionGranted: false,
  externalReplyResolved: false,
  productionAdmission: false,
  productionEligible: false
};

function stateCounts(entries) {
  return Object.fromEntries(Object.entries(Object.groupBy(entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
}

function assertReferences(references, label) {
  assert.ok(Array.isArray(references) && references.length > 0, `${label} must cite evidence records.`);
  for (const reference of references) assert.equal(exists(reference), true, `${label} cites missing ${reference}`);
}

function validateWildfireEvidence(audit, raw, owner, liveGuard, derived) {
  const group = audit.groups.find(({ id }) => id === "bc-ontario-current-wildfire-derived-gate");
  assert.deepEqual(group.currentWildfireArchiveGate, {
    requiredObjects: 6,
    verifiedObjects: 6,
    derivedObjectsVerified: true,
    productionEligible: false
  });
  assert.deepEqual(owner.archiveGate, {
    ...owner.archiveGate,
    productionEligible: false
  });
  assert.equal(owner.archiveGate.requiredObjectCount, 6);
  assert.equal(owner.archiveGate.verifiedObjectCount, 6);
  assert.equal(raw.claims.derivedObjectsVerified, false);
  assert.equal(raw.claims.recoveryObjectsVerified, true);
  assert.equal(raw.claims.ownerAdmission, false);
  assert.equal(raw.claims.productionEligible, false);
  assert.equal(derived.claims.derivedObjectsVerified, true);
  assert.equal(derived.claims.primaryObjectsVerified, true);
  assert.equal(derived.claims.recoveryReplicaVerified, false);
  assert.equal(derived.claims.mutationProvenance, false);
  for (const sourceId of ["bc-wildfire", "on-fire-disturbance"]) {
    const entry = raw.entries.find(({ sourceId: id }) => id === sourceId);
    assert.ok(entry, `${sourceId} raw archive record is missing.`);
    assert.equal(entry.payloadVersionPresent, true);
    assert.equal(entry.manifestVersionPresent, true);
    assert.equal(entry.payloadRetention.mode, "COMPLIANCE");
    assert.equal(entry.recoveryPayload.matchesPrimary, true);
    assert.equal(entry.recoveryPayload.replication, "REPLICA");
  }
  assert.equal(liveGuard.mutationsPerformed.length, 0);
  assert.equal(liveGuard.ownerAdmission, false);
  assert.equal(liveGuard.productionEligible, false);
  assert.equal(liveGuard.liveObjects["bc-wildfire"].payloadObjectCount, 1);
  assert.equal(liveGuard.liveObjects["bc-wildfire"].retention, "NONE");
  assert.equal(liveGuard.liveObjects["bc-wildfire"].manifestPresent, false);
  assert.equal(liveGuard.liveObjects["bc-wildfire"].recoveryObjectCount, 0);
  assert.equal(liveGuard.liveObjects["on-fire-disturbance"].payloadObjectCount, 0);
  assert.equal(liveGuard.liveObjects["on-fire-disturbance"].recoveryObjectCount, 0);
}

function validateBcAccessEvidence(access, replies, becCustom, becPublic, copyright) {
  const ids = GROUPS["bc-access-blocked-routes"].rows;
  for (const id of ids) {
    const row = access.rankedRows.find(({ id: rowId }) => rowId === id);
    assert.ok(row, `${id} is missing from the access resolution matrix.`);
    assert.equal(row.lawfulAcquisitionNow, false);
  }
  assert.equal(replies.counts.substantiveReplyRecords, 7);
  assert.equal(replies.counts.accessBlockedRowsWithSubstantiveReply, 8);
  assert.equal(replies.counts.partialRowsWithSubstantiveReply, 0);
  assert.equal(becCustom.status, "blocked-before-custom-download-order");
  assert.equal(becCustom.artifact.acquired, false);
  assert.equal(becCustom.ownerAction.status, "prepared-awaiting-owner-authorization");
  assert.equal(becPublic.status, "no-complete-public-artifact");
  assert.equal(becPublic.exhaustion.lawfulPublicCompleteArtifactFound, false);
  assert.equal(becPublic.exhaustion.rawEvidenceCreditImpact, 0);
  assert.equal(becPublic.exhaustion.productionEligibilityImpact, 0);
  assert.ok(becPublic.routes.every(({ completeArtifact }) => completeArtifact === false));
  assert.deepEqual(copyright.canonicalRowIds, ["bc-vri", "bc-forest-operations-map", "bc-old-growth-bec"]);
  assert.equal(copyright.impact.formsSubmitted, false);
  assert.equal(copyright.impact.permissionGranted, false);
  assert.equal(copyright.impact.licenceGranted, false);
  assert.equal(copyright.impact.artifactAcquired, false);
  assert.equal(copyright.impact.rawEvidenceCreditImpact, 0);
}

function validateOntarioEvidence(access, replies, friRoute) {
  for (const id of GROUPS["ontario-fri-term2-routes"].rows) {
    const row = access.rankedRows.find(({ id: rowId }) => rowId === id);
    assert.ok(row, `${id} is missing from the access resolution matrix.`);
    assert.equal(row.lawfulAcquisitionNow, false);
    const reply = replies.rows.find(({ id: rowId }) => rowId === id);
    assert.deepEqual(reply?.replyRecordIds, ["reply-ontario-fri-catalogue-deferral"]);
  }
  assert.deepEqual(friRoute.canonicalRowIds, ["on-fri", "on-fri-term-2"]);
  assert.equal(friRoute.status, "no-complete-public-term2-package");
  assert.deepEqual(friRoute.phase1Impact.rowsAffected, ["on-fri", "on-fri-term-2"]);
  assert.equal(friRoute.phase1Impact.rawEvidenceCreditImpact, 0);
  assert.equal(friRoute.phase1Impact.sourceLedgerChanged, false);
  assert.equal(friRoute.phase1Impact.artifactAcquired, false);
  assert.equal(friRoute.phase1Impact.archiveCreated, false);
  assert.ok(friRoute.routes.every(({ completeArtifact }) => completeArtifact === false));
}

function validatePartialEvidence(partial) {
  assert.equal(partial.status, "official-route-exhaustion-complete-no-lawful-intended-scope-acquisition");
  assert.deepEqual(partial.scope, ["cwfis-historical", "provincial-electoral-boundaries"]);
  assert.equal(partial.mailbox.partialRowsWithSubstantiveReply, 0);
  assert.equal(partial.mailbox.externalStateChanged, false);
  assert.equal(partial.impact.rawCreditDelta, 0);
  assert.equal(partial.impact.rawEvidenceNumeratorBefore, 15.25);
  assert.equal(partial.impact.rawEvidenceNumeratorAfter, 15.25);
  const row = partial.rows.find(({ id }) => id === "provincial-electoral-boundaries");
  assert.ok(row);
  assert.equal(row.lawfulAcquisitionNow, false);
  assert.equal(row.missingArtifactAcquired, false);
  assert.equal(row.permissionReceived, false);
  assert.ok(partial.routes.filter(({ rowId }) => rowId === "provincial-electoral-boundaries").every((route) => route.downloaded === false && route.sha256 === null && route.profileComplete === false && route.rights.lawfulForIntendedScope === false));
}

export function validatePhase1BcOntarioRowAudit(audit, ledger, context) {
  const { access, replies, raw, owner, liveGuard, becCustom, becPublic, copyright, friRoute, partial } = context;
  assert.equal(audit.schemaVersion, "witness-tree/phase1-bc-ontario-row-audit/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.auditedAt, /^2026-08-21T/);
  assert.equal(audit.derivedFromHead, "4466a14dd1462d09692db869523df713a6db2291");
  assert.deepEqual(audit.jurisdictions, ["BC", "ON"]);
  assert.deepEqual(audit.canonicalRowIds, ROW_IDS);
  assert.deepEqual(audit.claims, CLAIMS);
  assert.deepEqual(audit.reconciliation, {
    rowStateChanges: [],
    rawCreditChanges: [],
    productionAdmissionChanges: [],
    unresolvedBlockerCount: 11,
    scoreRemainsBounded: true,
    scoreChange: 0
  });

  assert.equal(ledger.entries.length, 31);
  assert.deepEqual(audit.baseline.evidenceStateCounts, stateCounts(ledger.entries));
  assert.deepEqual(audit.baseline.evidenceStateCounts, {
    "remote-verified-archived-profiled": 11,
    "local-verified-profiled": 5,
    "partial-component": 2,
    "access-blocked": 13
  });
  assert.equal(audit.baseline.productionRows, ledger.entries.length);
  assert.equal(audit.baseline.rawEvidenceNumerator, ledger.rawEvidenceNumerator);
  assert.equal(audit.baseline.rawEvidenceDenominator, ledger.entries.length);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, ledger.formalProgress.percentage);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 39.7580645);
  assert.equal(audit.baseline.immutableArchiveCompleteRows, ledger.entries.filter(({ proof }) => proof.immutableArchive).length);
  assert.equal(audit.baseline.productionAdmissionCompleteRows, ledger.entries.filter(({ proof }) => proof.productionAdmission).length);
  assert.equal(audit.baseline.productionEligibleRows, ledger.entries.filter(({ productionEligible }) => productionEligible).length);
  assert.equal(audit.baseline.bcOntarioRows, ROW_IDS.length);
  assert.equal(audit.baseline.bcOntarioRawCredit, ledger.entries.filter(({ id }) => ROW_IDS.includes(id)).reduce((sum, row) => sum + row.rawCredit, 0));
  assert.equal(audit.baseline.bcOntarioRawCreditDelta, 0);
  assert.deepEqual(audit.baseline.currentWildfireArchiveGate, { requiredObjects: 6, verifiedObjects: 6, productionEligible: false });

  assert.deepEqual(audit.groups.map(({ id }) => id), Object.keys(GROUPS));
  const groupRows = new Set();
  for (const group of audit.groups) {
    const expected = GROUPS[group.id];
    assert.deepEqual(group.rows, expected.rows, `${group.id} row mapping drifted.`);
    assert.equal(group.currentRawCreditDelta, expected.currentRawCreditDelta);
    assert.equal(group.maximumRawCreditDelta, expected.maximumRawCreditDelta);
    assert.equal(group.maximumFormalPercentagePointDelta, expected.maximumFormalPercentagePointDelta);
    assert.equal(group.maximumFormalPercentagePointDelta, formalDelta(group.maximumRawCreditDelta));
    assertReferences(group.evidenceRefs, group.id);
    for (const row of group.rows) {
      assert.equal(groupRows.has(row), false, `${row} is duplicated across BC/ON groups.`);
      groupRows.add(row);
    }
  }
  assert.deepEqual([...groupRows], ROW_IDS);

  assert.equal(audit.rows.length, ROW_IDS.length);
  assert.deepEqual(audit.rows.map(({ id }) => id), ROW_IDS);
  for (const row of audit.rows) {
    const canonical = ledger.entries.find(({ id }) => id === row.id);
    assert.ok(canonical, `${row.id} is missing from the canonical ledger.`);
    assert.equal(row.evidenceState, canonical.evidenceState);
    assert.equal(row.rawCredit, canonical.rawCredit);
    assert.equal(row.immutableArchive, canonical.proof.immutableArchive);
    assert.equal(row.productionAdmission, canonical.proof.productionAdmission);
    assert.equal(row.productionEligible, canonical.productionEligible);
    assert.deepEqual(row.evidenceRefs, canonical.evidenceRefs, `${row.id} evidence references drifted.`);
    assertReferences(row.evidenceRefs, row.id);
    assert.deepEqual(row.claims, ROW_CLAIMS);
    assert.equal(row.currentRawCreditDelta, 0);
    assert.equal(row.maximumRawCreditDelta, 1 - canonical.rawCredit);
    assert.equal(row.maximumFormalPercentagePointDelta, formalDelta(row.maximumRawCreditDelta));
    const replyRow = replies.rows.find(({ id }) => id === row.id);
    assert.deepEqual(row.replyRecordIds, replyRow?.replyRecordIds ?? [], `${row.id} reply mapping drifted.`);
    const relevantGroup = audit.groups.find(({ rows }) => rows.includes(row.id));
    assert.ok(relevantGroup);
  }

  validateWildfireEvidence(audit, raw, owner, liveGuard, context.derived);
  validateBcAccessEvidence(access, replies, becCustom, becPublic, copyright);
  validateOntarioEvidence(access, replies, friRoute);
  validatePartialEvidence(partial);
  return audit;
}

export function loadPhase1BcOntarioRowAudit() {
  return validatePhase1BcOntarioRowAudit(read("data/phase1-bc-ontario-row-audit.json"), read("data/phase1-production-source-ledger.json"), {
    access: read("data/phase1-access-blocker-resolution.json"),
    replies: read("data/phase1-outreach-reply-audit.json"),
    raw: read("data/current-wildfire-raw-archive-evidence.json"),
    derived: read("data/current-wildfire-derived-archive-evidence.json"),
    owner: read("data/current-wildfire-owner-admission.json"),
    liveGuard: read("data/current-wildfire-derived-live-recovery-guard-2026-08-20.json"),
    becCustom: read("data/phase1-bec-custom-download-route-audit.json"),
    becPublic: read("data/phase1-bec-public-alternative-exhaustion.json"),
    copyright: read("data/phase1-bc-copyright-permission-form-package.json"),
    friRoute: read("data/phase1-ontario-fri-term2-route-exhaustion.json"),
    partial: read("data/phase1-partial-source-route-exhaustion.json")
  });
}

if (process.argv[1]?.endsWith("check-phase1-bc-ontario-row-audit.mjs")) {
  const audit = loadPhase1BcOntarioRowAudit();
  console.log(`Phase 1 BC/ON row audit passed: ${audit.rows.length} rows, ${audit.baseline.rawEvidenceNumerator}/${audit.baseline.rawEvidenceDenominator} raw credits, ${audit.baseline.formalEvidenceTrackingPercentage}% formal evidence tracking, no production admission.`);
}
