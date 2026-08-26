import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
const exists = (file) => typeof file === "string" && file.startsWith("data/") && existsSync(path.join(ROOT, file));
const formalDelta = (rawCreditDelta) => Number((30 * rawCreditDelta / 31).toFixed(7));
const HISTORICAL_ROWS_SHA256 = "e85813ef962d66de26788b7cb22165c0bdc261f2e85afacbfd06aed0649ab6e1";

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
    maximumRawCreditDelta: 0.5,
    maximumFormalPercentagePointDelta: 0.483871
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

function assertReferences(references, label) {
  assert.ok(Array.isArray(references) && references.length > 0, `${label} must cite evidence records.`);
  for (const reference of references) assert.equal(exists(reference), true, `${label} cites missing ${reference}`);
}

function validateWildfireEvidence(audit, raw, owner, liveGuard, derived) {
  const group = audit.groups.find(({ id }) => id === "bc-ontario-current-wildfire-derived-gate");
  assert.deepEqual(group.currentWildfireArchiveGate, {
    requiredObjects: 6,
    verifiedObjects: 0,
    attestedObjects: 6,
    derivedObjectsVerified: false,
    productionEligible: false
  });
  assert.deepEqual(owner.archiveGate, {
    ...owner.archiveGate,
    productionEligible: false
  });
  assert.equal(owner.archiveGate.requiredObjectCount, 6);
  assert.equal(owner.archiveGate.verifiedObjectCount, 6);
  assert.equal(owner.archiveGate.attestedObjectCount, 0);
  assert.equal(owner.archiveGate.primaryReadbacksVerified, true);
  assert.equal(owner.archiveGate.recoveryReplicaVerified, false);
  assert.equal(raw.claims.recoveryObjectsVerified, false);
  assert.equal(raw.claims.productionEligible, false);
  assert.equal(derived.claims.recoveryReplicaVerified, false);
  assert.equal(derived.claims.mutationProvenance, false);
  for (const sourceId of ["bc-wildfire", "on-fire-disturbance"]) {
    const entry = raw.entries.find(({ sourceId: id }) => id === sourceId);
    assert.ok(entry, `${sourceId} raw archive record is missing.`);
    assert.equal(entry.payloadVersionPresent, false);
    assert.equal(entry.manifestVersionPresent, false);
    assert.equal(entry.payloadRetention.mode, "COMPLIANCE");
    assert.equal(entry.recoveryPayload.matchesPrimary, false);
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
  assert.equal(replies.counts.substantiveReplyRecords, 8);
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
  assert.equal(copyright.impact.formsSubmitted, true);
  assert.deepEqual(copyright.impact.submittedCanonicalRowIds, ["bc-forest-operations-map"]);
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
  assert.equal(partial.impact.rawEvidenceNumeratorBefore, 14.25);
  assert.equal(partial.impact.rawEvidenceNumeratorAfter, 14.25);
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
  assert.deepEqual(audit.baseline.evidenceStateCounts, {
    "remote-verified-archived-profiled": 7,
    "local-verified-profiled": 9,
    "partial-component": 2,
    "access-blocked": 13
  });
  assert.equal(audit.baseline.productionRows, ledger.entries.length);
  assert.equal(audit.baseline.rawEvidenceNumerator, 14.25);
  assert.equal(audit.baseline.rawEvidenceDenominator, ledger.entries.length);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 38.7903226);
  assert.equal(audit.baseline.immutableArchiveCompleteRows, 7);
  assert.equal(audit.baseline.productionAdmissionCompleteRows, 0);
  assert.equal(audit.baseline.productionEligibleRows, 0);
  validateFederalAdmission(read("data/phase1-federal-electoral-production-admission.json"));
  assert.deepEqual(ledger.entries.filter(({ proof }) => proof.productionAdmission).map(({ id }) => id), ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.deepEqual(ledger.entries.filter(({ productionEligible }) => productionEligible).map(({ id }) => id), ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.equal(audit.baseline.bcOntarioRows, ROW_IDS.length);
  // The audit deliberately records the 2026-08-21 pre-promotion baseline.
  // The current ledger has moved independently after exact archive readbacks.
  assert.equal(audit.baseline.bcOntarioRawCredit, 1.75);
  assert.equal(audit.baseline.bcOntarioRawCreditDelta, 0);
  assert.deepEqual(audit.baseline.currentWildfireArchiveGate, { requiredObjects: 6, verifiedObjects: 0, attestedObjects: 6, productionEligible: false });

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
  const historicalRows = new Map([
    ["bc-wildfire", ["local-verified-profiled", 0.75, false]],
    ["on-fire-disturbance", ["local-verified-profiled", 0.75, false]],
    ["bc-fta-cutblocks", ["access-blocked", 0, false]],
    ["bc-harvesting-authorities", ["access-blocked", 0, false]],
    ["bc-vri", ["access-blocked", 0, false]],
    ["bc-consolidated-cutblocks", ["access-blocked", 0, false]],
    ["bc-old-growth-bec", ["access-blocked", 0, false]],
    ["bc-forest-operations-map", ["access-blocked", 0, false]],
    ["on-fri", ["access-blocked", 0, false]],
    ["on-fri-term-2", ["access-blocked", 0, false]],
    ["provincial-electoral-boundaries", ["partial-component", 0.25, false]],
  ]);
  for (const row of audit.rows) {
    const canonical = ledger.entries.find(({ id }) => id === row.id);
    assert.ok(canonical, `${row.id} is missing from the canonical ledger.`);
    const expected = historicalRows.get(row.id);
    assert.ok(expected, `${row.id} is missing from the fixed historical snapshot.`);
    assert.deepEqual([row.evidenceState, row.rawCredit, row.immutableArchive], expected, `${row.id} historical state drifted.`);
    assert.equal(row.productionAdmission, canonical.proof.productionAdmission);
    assert.equal(row.productionEligible, canonical.productionEligible);
    assertReferences(row.evidenceRefs, row.id);
    assert.deepEqual(row.claims, ROW_CLAIMS);
    assert.equal(row.currentRawCreditDelta, 0);
    assert.equal(row.maximumRawCreditDelta, 1 - expected[1]);
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
  assert.equal(createHash("sha256").update(JSON.stringify(audit.rows)).digest("hex"), HISTORICAL_ROWS_SHA256, "Historical BC/ON rows or evidence references drifted.");
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
  console.log(`Phase 1 historical BC/ON row audit passed: ${audit.rows.length} rows, ${audit.baseline.rawEvidenceNumerator}/${audit.baseline.rawEvidenceDenominator} raw credits, ${audit.baseline.formalEvidenceTrackingPercentage}% formal evidence tracking, no production admission in that snapshot; the later federal admission is separate.`);
}
