import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "witness-tree/phase1-owner-approval-packet/1";
const HEAD = "9bf5baa2ecc51ce4c039531e798bfb6418e3baaf";
const QUEUE_SCHEMA = "witness-tree/phase1-owner-decision-queue/1";
const PHASES = ["reversibleSourceScope", "irreversibleArchiveRetention", "releaseProductionAdmission"];
const QUEUE_ROWS = [
  "ntems-annual-land-cover",
  "ntems-forest-harvest",
  "ntems-canopy-cover",
  "ntems-canopy-height",
  "cwfis-current",
  "bc-wildfire",
  "ab-wildfire",
  "on-fire-disturbance",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
  "qc-fourth-inventory",
  "ab-avi-crown",
  "ab-avi-post-harvest",
  "ab-primary-land-vegetation",
  "fed-2023-ridings",
  "elections-canada-45th-files",
];

function same(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
}

function assertPendingBlock(block, label) {
  assert.equal(typeof block.status, "string", `${label} needs an explicit status.`);
  assert.ok(block.status.length > 0, `${label} needs a non-empty status.`);
  assert.doesNotMatch(block.status, /^(approved|admitted|eligible|production-eligible)$/i, `${label} cannot claim approval or admission in status.`);
}

function validateOrder(packet, queue) {
  const queueById = new Map(queue.decisionOrder.map((step) => [step.id, step]));
  same(packet.decisionOrder.map((step) => step.step), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "Packet order must contain ten dependency steps.");
  same(packet.decisionOrder.map((step) => step.id), queue.decisionOrder.map((step) => step.id), "Packet order must reuse the authoritative queue order.");
  for (const step of packet.decisionOrder) {
    const source = queueById.get(step.id);
    assert.ok(source, `Packet step ${step.id} is not in the owner queue.`);
    same(step.rows, source.rows, `${step.id} rows drifted.`);
    same(step.dependsOn, source.dependsOn, `${step.id} dependencies drifted.`);
    assert.ok(packet.exactBindings[step.binding], `${step.id} must bind exact existing evidence.`);
    for (const phase of PHASES) {
      assert.ok(step[phase], `${step.id} is missing ${phase}.`);
      assertPendingBlock(step[phase], `${step.id}.${phase}`);
    }
    assert.match(step.copyPasteBlock, /status=(?:template-not-approved|recorded-nonadmitting)/);
    assert.match(step.copyPasteBlock, /OWNER|DO_NOT_RUN|productionAdmission=false/);
    assert.doesNotMatch(step.copyPasteBlock, /owner_(?:approval|decision)=true|productionEligible=true|productionAdmission=true/i);
  }
}

function validateFederal(packet, prep, federalProfile, federalLedger, runner) {
  const b = packet.exactBindings["federal-electoral-archive"];
  const artifact = prep.artifacts.find((item) => item.productionRowIds.includes("fed-2023-ridings"));
  assert.ok(artifact);
  same({
    rows: artifact.productionRowIds,
    stagedAcquisitionId: artifact.stagedAcquisitionId,
    sourceVersion: artifact.sourceVersion,
    localPath: artifact.localPath,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    profile: artifact.profile,
  }, {
    rows: b.rows,
    stagedAcquisitionId: b.stagedAcquisitionId,
    sourceVersion: b.sourceVersion,
    localPath: b.localPath,
    byteLength: b.byteLength,
    sha256: b.sha256,
    profile: b.profile,
  }, "Federal artifact facts must reuse the preparation record.");
  assert.equal(federalProfile.inputSha256, b.sha256);
  same([federalLedger.source.localPath, federalLedger.source.sha256], [b.localPath, b.sha256], "Federal source ledger must bind the same local bytes.");
  assert.match(runner, new RegExp(b.payloadKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(runner, new RegExp(b.manifestKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  same({ bucket: b.bucket, region: b.region, retention: b.retention }, {
    bucket: "witness-tree-raw-archive-ca-central-1",
    region: "ca-central-1",
    retention: { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" },
  }, "Federal destination and retention must remain exact.");
}

function validateQuebecCurrentOriginal(packet, prep) {
  const b = packet.exactBindings["quebec-current-original-archive"];
  same({
    bucket: prep.destination.bucket,
    region: prep.destination.region,
    countryCode: prep.destination.countryCode,
    operatorProfile: prep.mfaGatedExecution.operatorProfile,
    proposedRole: prep.mfaGatedExecution.proposedRole,
    mfaRequired: prep.mfaGatedExecution.required,
    multipartPartSizeBytes: prep.mfaGatedExecution.multipartPartSizeBytes,
    retention: { mode: prep.mfaGatedExecution.retentionMode, retainUntil: prep.mfaGatedExecution.recommendedRetainUntil },
  }, {
    bucket: b.bucket,
    region: b.region,
    countryCode: b.countryCode,
    operatorProfile: b.operatorProfile,
    proposedRole: b.proposedRole,
    mfaRequired: b.mfaRequired,
    multipartPartSizeBytes: b.multipartPartSizeBytes,
    retention: b.retention,
  }, "Québec current/original destination and execution scope drifted.");
  const expected = prep.artifacts.map((item) => ({
    id: item.id,
    productionSourceId: item.productionSourceId,
    archiveSourceId: item.archiveSourceId,
    localPath: item.localPath,
    originalFilename: item.originalFilename,
    sourceVersion: item.sourceVersion,
    byteLength: item.byteLength,
    sha256: item.sha256,
    payloadKey: item.payloadKey,
    manifestKey: item.manifestKey,
  }));
  same(b.artifacts, expected, "Québec current/original artifact names, hashes, and keys must reuse preparation evidence.");
  same(b.allow, prep.proposedRoleScope.allow, "Québec proposed allow scope drifted.");
  same(b.denyByOmission, prep.proposedRoleScope.denyByOmission, "Québec deny-by-omission scope drifted.");
  same(b.retentionKeys, prep.proposedRoleScope.retentionKeys, "Québec retention keys drifted.");
}

function validateQuebecFourth(packet, prep) {
  const b = packet.exactBindings["quebec-fourth-inventory-archive"];
  same({ bucket: prep.bucket, region: prep.region, retention: prep.retention }, { bucket: b.bucket, region: b.region, retention: b.retention }, "Québec fourth destination and retention drifted.");
  same(b.archiveSet, {
    count: prep.archiveSet.count,
    byteLength: prep.archiveSet.byteLength,
    digest: prep.archiveSet.digest,
    payloadManifestRef: "data/qc-fourth-inventory-immutable-promotion-preparation.json#/archiveSet/payloads",
  }, "Québec fourth archive-set binding drifted.");
  assert.equal(prep.archiveSet.payloads.length, b.archiveSet.count);
  for (const payload of prep.archiveSet.payloads) {
    assert.equal(typeof payload.originalFilename, "string");
    assert.equal(typeof payload.sha256, "string");
    assert.equal(typeof payload.objectKey, "string");
  }
  same(b.canonicalManifest, {
    originalFilename: prep.canonicalManifest.originalFilename,
    byteLength: prep.canonicalManifest.byteLength,
    sha256: prep.canonicalManifest.sha256,
    objectKey: prep.canonicalManifest.objectKey,
  }, "Québec fourth canonical manifest drifted.");
  same(b.excludedMapComponent, {
    originalFilename: prep.exclusionDecision.originalFilename,
    byteLength: prep.exclusionDecision.byteLength,
    sha256: prep.exclusionDecision.sha256,
    decision: prep.exclusionDecision.decision,
  }, "Québec fourth map-only exclusion drifted.");
  same(b.requiredApprovals, ["exact-artifact-set", "IAM", "MFA-session", "irreversible-COMPLIANCE-retention"], "Québec fourth approvals drifted.");
}

function validateNational(packet, harvestProfile, harvestEvidence, heightProfile, heightEvidence) {
  const b = packet.exactBindings["national-archived-source-ledger"];
  for (const [actual, expected, label] of [
    [b.harvest.localPath, harvestProfile.raw.localPath, "harvest path"],
    [b.harvest.byteLength, harvestProfile.raw.byteLength, "harvest bytes"],
    [b.harvest.sha256, harvestProfile.raw.sha256, "harvest SHA"],
    [b.harvest.payloadKey, harvestEvidence.payload.key, "harvest payload key"],
    [b.harvest.manifestKey, harvestEvidence.manifest.key, "harvest manifest key"],
    [b.canopyHeight.localPath, heightProfile.raw.localPath, "canopy-height path"],
    [b.canopyHeight.byteLength, heightProfile.raw.byteLength, "canopy-height bytes"],
    [b.canopyHeight.sha256, heightProfile.raw.sha256, "canopy-height SHA"],
    [b.canopyHeight.payloadKey, heightEvidence.entry.payloadKey, "canopy-height payload key"],
    [b.canopyHeight.manifestKey, heightEvidence.entry.manifestKey, "canopy-height manifest key"],
  ]) assert.equal(actual, expected, `${label} drifted.`);
  same(b.harvest.retention, { mode: harvestEvidence.payload.primary.retention.mode, retainUntil: harvestEvidence.payload.primary.retention.until }, "Harvest retention drifted.");
  same(b.canopyHeight.retention, { mode: heightEvidence.entry.primary.payloadRetention.mode, retainUntil: heightEvidence.entry.primary.payloadRetention.until }, "Canopy-height retention drifted.");
}

function validateNrcanDownstream(packet, coverGate, coverProfile, immutable) {
  const b = packet.exactBindings["archived-remote-downstream"];
  const annual = coverGate.rows.find((row) => row.id === "ntems-annual-land-cover");
  const canopy = coverGate.rows.find((row) => row.id === "ntems-canopy-cover");
  same(b.annualLandCover.requiredBeforeExecution, annual.transformation.requiredBeforeExecution, "Annual-cover transformation prerequisites drifted.");
  same({ payloadCount: b.annualLandCover.payloadCount, sidecarCount: b.annualLandCover.sidecarCount, retentionMode: b.annualLandCover.retentionMode, retentionUntil: b.annualLandCover.retentionUntil, transformationStatus: b.annualLandCover.transformationStatus }, {
    payloadCount: annual.namedValidationGates[0].facts.payloads,
    sidecarCount: annual.namedValidationGates[0].facts.sidecars,
    retentionMode: annual.namedValidationGates[0].facts.retentionMode,
    retentionUntil: annual.namedValidationGates[0].facts.retentionUntil,
    transformationStatus: annual.transformation.status,
  }, "Annual-cover archive and transformation facts drifted.");
  same({ localPath: b.canopyCover.localPath, byteLength: b.canopyCover.byteLength, sha256: b.canopyCover.sha256 }, { localPath: coverProfile.raw.localPath, byteLength: coverProfile.raw.byteLength, sha256: coverProfile.raw.sha256 }, "Canopy-cover local artifact facts drifted.");
  const canopyEntry = immutable.entries.find((entry) => entry.sourceId === "nrcan-forest-canopy-cover-2022");
  assert.ok(canopyEntry);
  same({ payloadKey: b.canopyCover.payloadKey, manifestKey: b.canopyCover.manifestKey, retention: b.canopyCover.retention }, { payloadKey: canopyEntry.payloadKey, manifestKey: canopyEntry.manifestKey, retention: { mode: "COMPLIANCE", retainUntil: canopyEntry.retentionUntil } }, "Canopy-cover remote keys or retention drifted.");
  assert.equal(canopy.transformation.status, b.canopyCover.transformationStatus);
}

function validateAvi(packet, audit, quarantine, aviRun, immutable) {
  const b = packet.exactBindings["archived-remote-downstream"].aviSharedArtifact;
  const auditRow = audit.rows.find((row) => row.id === "ab-avi-crown");
  const immutableEntry = immutable.entries.find((entry) => entry.sourceId === "alberta-avi-crown");
  assert.ok(auditRow && immutableEntry);
  same({ localPath: b.localPath, byteLength: b.byteLength, sha256: b.sha256 }, { localPath: auditRow.localArtifacts.raw.externalPath, byteLength: auditRow.localArtifacts.raw.byteLength, sha256: auditRow.localArtifacts.raw.sha256 }, "AVI raw artifact drifted.");
  same({ payloadKey: b.payloadKey, manifestKey: b.manifestKey, retention: b.retention }, { payloadKey: immutableEntry.payloadKey, manifestKey: immutableEntry.manifestKey, retention: { mode: "COMPLIANCE", retainUntil: immutableEntry.retentionUntil } }, "AVI remote archive facts drifted.");
  same({ transformationSpecification: b.transformationSpecification, repairFunction: b.repairFunction, areaRelativeTolerance: b.areaRelativeTolerance }, { transformationSpecification: aviRun.specification, repairFunction: aviRun.rule.repairFunction, areaRelativeTolerance: aviRun.rule.areaRelativeTolerance }, "AVI policy drifted.");
  same(b.quarantine, {
    layer: quarantine.basis.quarantinedLayer,
    fid: quarantine.basis.quarantinedFid,
    relativeAreaChange: quarantine.basis.relativeAreaChange,
    excludedCrownObservationRecords: quarantine.scope.crownObservationRecordsExcluded,
    crownDenominatorImpact: quarantine.scope.crownDenominatorImpact,
    record: "data/alberta-avi-crown-quarantine-decision.json",
    output: aviRun.output.externalPath,
    outputSha256: aviRun.output.sha256,
  }, "AVI quarantine facts drifted.");
  assert.equal(b.derivedDatasetWritten, false);
}

function validateWildfire(packet, prep, owner) {
  const b = packet.exactBindings["current-wildfire-archive-gate"];
  same(b.objectKeys, prep.proposedRoleScope.objectKeys, "Current-wildfire object keys drifted.");
  same({ bucket: b.bucket, region: b.region, retention: b.retention }, {
    bucket: prep.destination.bucket,
    region: prep.destination.region,
    retention: { mode: prep.mfaGatedExecution.recommendedRetainUntil ? "COMPLIANCE" : null, retainUntil: prep.mfaGatedExecution.recommendedRetainUntil, appliesTo: "payload versions only" },
  }, "Current-wildfire destination or retention drifted.");
  const sourceById = new Map(owner.sources.map((source) => [source.id, source]));
  for (const [id, expected] of Object.entries(b.rawAndDerived)) {
    const source = sourceById.get(id);
    assert.ok(source, `Missing current-wildfire source ${id}.`);
    same({ rawBytes: expected.rawBytes, rawSha256: expected.rawSha256 }, { rawBytes: source.raw.bytes, rawSha256: source.raw.sha256 }, `${id} raw facts drifted.`);
    assert.equal(expected.transformation, source.transformation, `${id} transformation policy drifted.`);
    if (source.derived) {
      same({ derivedBytes: expected.derivedBytes, derivedSha256: expected.derivedSha256, derivedFeatures: expected.derivedFeatures, quarantined: expected.quarantined }, { derivedBytes: source.derived.bytes, derivedSha256: source.derived.sha256, derivedFeatures: source.derived.featureCount, quarantined: source.derived.excludedAndQuarantined }, `${id} derived facts drifted.`);
    }
  }
}

function validatePlvi(packet, prep, evidence, readiness, run) {
  const b = packet.exactBindings["alberta-plvi-scope"];
  const raw = prep.artifacts.find((artifact) => artifact.kind === "raw-source");
  const derived = prep.artifacts.find((artifact) => artifact.kind === "derived-repair");
  same({ localPath: b.raw.localPath, byteLength: b.raw.byteLength, sha256: b.raw.sha256, payloadKey: b.raw.payloadKey, manifestKey: b.raw.manifestKey }, { localPath: raw.localPath, byteLength: raw.byteLength, sha256: raw.sha256, payloadKey: raw.payloadKey, manifestKey: raw.manifestKey }, "PLVI raw artifact drifted.");
  same({ localPath: b.derived.localPath, byteLength: b.derived.byteLength, sha256: b.derived.sha256, payloadKey: b.derived.payloadKey, manifestKey: b.derived.manifestKey, featureCount: b.derived.featureCount, crs: b.derived.crs }, { localPath: derived.localPath, byteLength: derived.byteLength, sha256: derived.sha256, payloadKey: derived.payloadKey, manifestKey: derived.manifestKey, featureCount: derived.derivedLineage.featureCount, crs: derived.derivedLineage.crs }, "PLVI derived artifact drifted.");
  assert.equal(b.transformation.specification, run.specification);
  assert.equal(b.transformation.derivedDatasetWrittenByAudit, false);
  assert.match(b.transformation.rule, /GDAL SQLite ST_MakeValid/);
  assert.match(b.transformation.closedJoin, /179075 copied unchanged \+ 12 repaired = 179087/);
  same(b.scopeExclusions, evidence.scopeExclusions, "PLVI scope exclusions drifted.");
  assert.equal(b.preparation, "data/alberta-plvi-immutable-promotion-preparation.json");
}

export async function checkPhase1OwnerApprovalPacket(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), packetOverride = null) {
  const read = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const [packet, queue, ledger, prepFederal, federalProfile, federalLedger, qc, qcFourth, harvestProfile, harvestEvidence, heightProfile, heightEvidence, coverGate, coverProfile, immutable, audit, quarantine, aviRun, wildfirePrep, wildfireOwner, plviPrep, plviEvidence, plviReadiness, plviRun] = await Promise.all([
    packetOverride ?? read("data/phase1-owner-approval-packet.json"),
    read("data/phase1-owner-decision-queue.json"),
    read("data/phase1-production-source-ledger.json"),
    read("data/phase1-local-profiled-promotion-preparation.json"),
    read("data/elections-canada-fed-2025-profile.json"),
    read("data/elections-canada-fed-2025-source-ledger.json"),
    read("data/qc-immutable-promotion-preparation.json"),
    read("data/qc-fourth-inventory-immutable-promotion-preparation.json"),
    read("data/nrcan-harvest-profile.json"),
    read("data/nrcan-harvest-remote-archive-evidence.json"),
    read("data/nrcan-canopy-height-profile.json"),
    read("data/nrcan-canopy-height-remote-archive-evidence.json"),
    read("data/phase1-nrcan-cover-processing-gate.json"),
    read("data/nrcan-canopy-cover-profile.json"),
    read("data/immutable-promotions.json"),
    read("data/phase1-alberta-transform-ingestion-audit.json"),
    read("data/alberta-avi-crown-quarantine-decision.json"),
    read("data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json"),
    read("data/current-wildfire-immutable-promotion-preparation.json"),
    read("data/current-wildfire-owner-admission.json"),
    read("data/alberta-plvi-immutable-promotion-preparation.json"),
    read("data/alberta-plvi-immutable-promotion-evidence.json"),
    read("data/alberta-plvi-full-release-readiness.json"),
    read("data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json"),
  ]);
  const runner = await readFile(path.join(root, "scripts/run-phase1-approved-promotion.sh"), "utf8");

  assert.equal(packet.schemaVersion, SCHEMA);
  assert.equal(packet.status, "template-not-approved");
  assert.equal(packet.derivedFromHead, HEAD);
  assert.equal(packet.sourceQueue, "data/phase1-owner-decision-queue.json");
  assert.match(packet.notice, /reconciled non-admitting owner decisions.*does not create or infer.*AWS.*production eligibility/i);
  assert.deepEqual(packet.recordedDecisions, {
    source: "data/phase1-remote-source-admission-decisions.json",
    rows: ["ntems-forest-harvest", "ntems-canopy-height", "ab-primary-land-vegetation", "qc-current-ecoforest", "qc-original-current-inventory"],
    scope: "The two national and two Quebec rows are accepted source-ledger-only; PLVI is admitted only as the exact raw/derived scope for scope-bound validation and ingestion preparation.",
  });
  same(packet.phaseOrder, ["reversible-source-scope", "irreversible-archive-retention", "release-production-admission"]);
  same(packet.baseline, queue.baseline, "Packet baseline must reuse the owner queue baseline.");
  same(packet.rows, QUEUE_ROWS, "Packet must cover the authoritative 16-row queue once.");
  same(packet.rows, queue.queueRows.map((row) => row.id), "Packet rows must match the queue rows.");
  same(packet.excludedRows, queue.excludedRows, "Partial/access exclusions must be preserved exactly.");
  same(packet.claims, {
    ownerDecisionsCreated: false,
    ownerApprovalsGranted: false,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
    transformed: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    rawEvidenceDelta: 0,
    formalEvidenceTrackingPercentagePointDelta: 0,
  }, "Packet claims must remain fail-closed.");
  assert.equal(queue.schemaVersion, QUEUE_SCHEMA);
  same(ledger.entries.filter((entry) => packet.rows.includes(entry.id)).map((entry) => entry.id), packet.rows, "Every packet row must remain a canonical ledger row.");
  for (const row of queue.queueRows) assert.equal(row.productionEligible, false);
  validateOrder(packet, queue);
  const nationalStep = packet.decisionOrder.find(({ id }) => id === "national-archived-source-ledger");
  assert.equal(nationalStep.reversibleSourceScope.status, "recorded-source-ledger-only");
  assert.match(nationalStep.copyPasteBlock, /source_ledger_decision=OWNER: accepted existing named source-ledger evidence/);
  const plviStep = packet.decisionOrder.find(({ id }) => id === "alberta-plvi-scope");
  assert.equal(plviStep.reversibleSourceScope.status, "recorded-approved-raw-and-derived-scope-only");
  assert.match(plviStep.copyPasteBlock, /scope_bound_preparation=OWNER: allowed for validation and ingestion preparation only/);
  validateFederal(packet, prepFederal, federalProfile, federalLedger, runner);
  validateQuebecCurrentOriginal(packet, qc);
  validateQuebecFourth(packet, qcFourth);
  validateNational(packet, harvestProfile, harvestEvidence, heightProfile, heightEvidence);
  validateNrcanDownstream(packet, coverGate, coverProfile, immutable);
  validateAvi(packet, audit, quarantine, aviRun, immutable);
  validateWildfire(packet, wildfirePrep, wildfireOwner);
  validatePlvi(packet, plviPrep, plviEvidence, plviReadiness, plviRun);
  return packet;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packet = await checkPhase1OwnerApprovalPacket();
  console.log(`Phase 1 owner-approval packet passed: ${packet.rows.length} rows, ${packet.decisionOrder.length} dependency blocks, no approval or mutation claim.`);
}
