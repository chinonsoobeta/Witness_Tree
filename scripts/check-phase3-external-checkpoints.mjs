import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const protocolPath = path.join(root, "data/phase3-external-checkpoint-protocol.json");
const evidencePath = path.join(root, "data/phase3-external-checkpoint-evidence.json");

export const LOCALES = Object.freeze(["en", "fr"]);
export const TASK_IDS = Object.freeze(["find-place-coverage", "read-annual-table", "interpret-location-event", "follow-containing-place", "trace-provenance-limit"]);
export const TEMPLATES = Object.freeze(["location", "place", "explore", "bilingual-parity"]);
export const SCREEN_READER_TEMPLATES = Object.freeze(["location", "place"]);
export const CVD_MODES = Object.freeze(["forced-colors", "grayscale", "protanopia", "deuteranopia", "tritanopia"]);
export const SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
const PENDING_RESULTS = Object.freeze({ usability: "not-run", keyboard: "not-run", screenReader: "not-run", forcedColorsAndCvd: "not-run", fieldPerformance: "not-run", outsideAccessibilityReview: "not-started" });
const PROTOCOL_SHA256 = "cf0b8711113871035b181a317904355723351c1ce3fbbb0dd566a93b859a5e6d";
const EVIDENCE_KEYS = Object.freeze(["schemaVersion", "protocolVersion", "status", "completionClaimed", "completionEvidenceOrigin", "productionEligible", "ownerInputs", "usability", "manualAccessibility", "fieldPerformance", "outsideAccessibilityReview", "currentResult"]);
const OWNER_KEYS = Object.freeze(["releaseId", "studyOwnerName", "approvedRetentionDays", "consentFormVersion", "recruitmentApprovalReference", "privacyReviewReference", "fieldPerformanceSamplingDecisionReference", "fieldPerformanceMinimumSamplesPerLocale", "fieldPerformanceUrlOrigin", "fieldPerformanceWindowStartedAt", "fieldPerformanceWindowEndedAt", "fieldPerformanceProvider", "fieldPerformanceConfigurationReference"]);
const FORBIDDEN_PII_KEYS = /(?:email|phone|telephone|mobile|contact|participant[a-z]*name|participantdetails|full[a-z]*name|postaladdress|mailingaddress|streetaddress|ipaddress|clientip|remoteip|dateofbirth|birthdate|exactage|rawaudio|rawvideo|screenrecording|recruitmentsource)/;
const OPAQUE_REFERENCE = /^ref-[a-f0-9]{32}$/;
const OBSERVATION_CODE = /^obs-[a-f0-9]{12}$/;
const RELEASE_ID = /^release-[a-f0-9]{16}$/;
const CONSENT_FORM_VERSION = /^consent-form-v[1-9][0-9]{0,3}$/;
const SENSITIVE_VALUE_SHAPE = /(?:@|https?:\/\/|www\.|(?:^|\s)\+?[0-9][0-9 ()-]{6,}[0-9](?:\s|$)|\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|postal|address|email|phone|contact|name)\b)/i;
const OBFUSCATED_EMAIL_VALUE = /[a-z0-9._+-]+\s*(?:\(\s*a\s*t\s*\)|\s+a\s*t\s+)\s*[a-z0-9-]+(?:\s*(?:\.|\(\s*d\s*o\s*t\s*\)|\s+d\s*o\s*t\s+)\s*[a-z]{2,})+/i;
const PHONE_VALUE_SHAPE = /(?:^|\s)(?:tel(?:ephone)?\.?\s*)?(?:(?:\+?1|\(1\))[ ./()-]*)?(?:\([0-9]{3}\)|[0-9]{3})[ ./()-]*(?:\([0-9]{3}\)|[0-9]{3})[ ./()-]*(?:\([0-9]{4}\)|[0-9]{4})(?=\s|$)/i;
const ENCODED_VALUE_SHAPE = /(?:%[0-9a-f]{2}|&#(?:x[0-9a-f]+|[0-9]+);)/i;
const CANONICAL_UTC_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const TECHNICAL_ASCII_VALUE = /^[A-Za-z0-9][A-Za-z0-9 ._+()/-]{0,127}$/;

const exact = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
};

const exactKeys = (value, expected, message) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  exact(Object.keys(value).sort(), [...expected].sort(), message);
};

const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const opaque = (value) => /^[a-f0-9]{16}$/.test(value ?? "");
const hasSensitiveValueShape = (value) => typeof value !== "string" || SENSITIVE_VALUE_SHAPE.test(value.normalize("NFKC")) || OBFUSCATED_EMAIL_VALUE.test(value.normalize("NFKC")) || PHONE_VALUE_SHAPE.test(value.normalize("NFKC")) || ENCODED_VALUE_SHAPE.test(value.normalize("NFKC"));
const opaqueReference = (value) => OPAQUE_REFERENCE.test(value ?? "") && !hasSensitiveValueShape(value);
const observationCode = (value) => OBSERVATION_CODE.test(value ?? "") && !hasSensitiveValueShape(value);
const safeEnvironmentValue = (value) => typeof value === "string" && TECHNICAL_ASCII_VALUE.test(value) && value === value.trim() && !hasSensitiveValueShape(value);

function canonicalUtcSecond(value) {
  if (!CANONICAL_UTC_SECOND.test(value ?? "")) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === `${value.slice(0, -1)}.000Z`;
}

function canonicalHttpsOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    const ipCandidate = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]") ? parsed.hostname.slice(1, -1) : parsed.hostname;
    const validDns = parsed.hostname.length <= 253 && parsed.hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
    const validHost = isIP(ipCandidate) !== 0 || validDns;
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && validHost && parsed.port === "" && parsed.pathname === "/" && parsed.search === "" && parsed.hash === "" && value === parsed.origin;
  } catch {
    return false;
  }
}

function rejectParticipantPii(value, trail = "evidence") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectParticipantPii(item, `${trail}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_PII_KEYS.test(normalizedKey)) throw new Error(`${trail}.${key}: participant PII field is forbidden.`);
    rejectParticipantPii(child, `${trail}.${key}`);
  }
}

export function validateProtocol(protocol) {
  if (createHash("sha256").update(JSON.stringify(protocol)).digest("hex") !== PROTOCOL_SHA256) throw new Error("External-checkpoint protocol differs from the reviewed canonical protocol.");
  if (protocol.schemaVersion !== "witness-tree/phase3-external-checkpoint-protocol/1" || protocol.status !== "execution-ready-protocol" || protocol.resultsStatus !== "pending-real-human-and-external-evidence" || protocol.productionEligible !== false) throw new Error("External-checkpoint protocol boundary is invalid.");
  const usability = protocol.usability;
  exact(usability?.locales, LOCALES, "Usability locales must be exact.");
  if (usability.separatePanels !== true || usability.participantsPerLocale !== 10 || usability.tasksPerParticipant !== 5 || usability.secondsPerTaskExclusive !== 180 || usability.participantPassTasks !== 4 || usability.languagePassParticipants !== 8 || usability.assistanceAllowed !== false) throw new Error("Normative usability arithmetic is invalid.");
  exact(usability.tasks?.map(({ id }) => id), TASK_IDS, "Exactly five ordered usability tasks are required.");
  for (const task of usability.tasks) if (!nonempty(task.prompt?.en) || !nonempty(task.prompt?.fr) || !nonempty(task.completion) || !task.startPath?.startsWith("/en/") || !task.startPathFr?.startsWith("/fr/")) throw new Error(`${task.id}: bilingual task protocol is incomplete.`);
  for (const locale of LOCALES) if (usability.participantEligibility?.[locale]?.length !== 6 || usability.participantExclusion?.[locale]?.length !== 2) throw new Error(`${locale}: eligibility/exclusion protocol is incomplete.`);
  if (!usability.privacy?.participantIdentifier?.includes("never encode") || usability.privacy.store?.length !== 6 || usability.privacy.neverStore?.length !== 12 || !usability.privacy.retention?.includes("must approve")) throw new Error("Privacy-minimizing protocol is incomplete.");
  exact(protocol.manualAccessibility?.keyboard?.templates, TEMPLATES, "Keyboard template scope is incomplete.");
  exact(protocol.manualAccessibility?.keyboard?.locales, LOCALES, "Keyboard locale scope is incomplete.");
  exact(protocol.manualAccessibility?.screenReader?.templates, SCREEN_READER_TEMPLATES, "Screen-reader template scope is incomplete.");
  exact(protocol.manualAccessibility?.screenReader?.locales, LOCALES, "Screen-reader locale scope is incomplete.");
  exact(protocol.manualAccessibility?.forcedColorsAndCvd?.templates, TEMPLATES, "Forced-colors/CVD template scope is incomplete.");
  exact(protocol.manualAccessibility?.forcedColorsAndCvd?.locales, LOCALES, "Forced-colors/CVD locale scope is incomplete.");
  exact(protocol.manualAccessibility?.forcedColorsAndCvd?.modes, CVD_MODES, "Forced-colors/CVD mode scope is incomplete.");
  if (protocol.fieldPerformance?.surface !== "place" || protocol.fieldPerformance?.metric !== "LCP" || protocol.fieldPerformance?.statistic !== "p75" || protocol.fieldPerformance?.thresholdMsExclusive !== 2000) throw new Error("Field-performance protocol is invalid.");
  exact(protocol.fieldPerformance?.locales, LOCALES, "Field-performance locale scope is incomplete.");
  exact(protocol.outsideAccessibilityReview?.standards, ["WCAG 2.2 AA", "EN 301 549"], "Outside-review standards are incomplete.");
  exact(protocol.outsideAccessibilityReview?.templates, TEMPLATES, "Outside-review template scope is incomplete.");
  exact(protocol.outsideAccessibilityReview?.locales, LOCALES, "Outside-review locale scope is incomplete.");
  exact(protocol.outsideAccessibilityReview?.severity, SEVERITIES, "Issue severity vocabulary is incomplete.");
  return protocol;
}

function taskPassed(task, protocol) {
  const duration = (Date.parse(task.endedAt) - Date.parse(task.startedAt)) / 1000;
  return task.completedUnassisted === true && task.assistanceProvided === false && duration > 0 && duration < protocol.usability.secondsPerTaskExclusive;
}

function validateParticipant(participant, protocol) {
  exactKeys(participant, ["participantId", "panelId", "locale", "eligibility", "consent", "sessionStartedAt", "sessionEndedAt", "tasks", "moderation"], "Participant evidence contains missing or unapproved fields.");
  if (!opaque(participant.participantId) || !opaque(participant.panelId) || !LOCALES.includes(participant.locale)) throw new Error("Participant identity or locale is invalid.");
  const eligibility = participant.eligibility;
  exactKeys(eligibility, ["age18Plus", "languageComfortable", "noWitnessTreeExposure", "nonGis24Months", "noOtherPanel", "consentBeforeTasks"], `${participant.participantId}: eligibility attestations are incomplete or altered.`);
  if (Object.values(eligibility).some((value) => value !== true)) throw new Error(`${participant.participantId}: every eligibility attestation must be explicit true.`);
  if (participant.consent?.status !== "explicit-recorded" || !opaqueReference(participant.consent?.receiptReference) || participant.consent?.protocolVersion !== protocol.schemaVersion || !canonicalUtcSecond(participant.consent?.recordedAt)) throw new Error(`${participant.participantId}: explicit consent evidence is missing.`);
  exactKeys(participant.consent, ["status", "receiptReference", "protocolVersion", "recordedAt"], `${participant.participantId}: consent evidence contains missing or unapproved fields.`);
  if (!canonicalUtcSecond(participant.sessionStartedAt) || !canonicalUtcSecond(participant.sessionEndedAt) || Date.parse(participant.sessionEndedAt) <= Date.parse(participant.sessionStartedAt)) throw new Error(`${participant.participantId}: session timestamps are invalid.`);
  exact(participant.tasks?.map(({ taskId }) => taskId), TASK_IDS, `${participant.participantId}: all five ordered tasks are required.`);
  for (const task of participant.tasks) {
    exactKeys(task, ["taskId", "startedAt", "endedAt", "completedUnassisted", "assistanceProvided"], `${participant.participantId}/${task.taskId}: task evidence contains missing or unapproved fields.`);
    if (!canonicalUtcSecond(task.startedAt) || !canonicalUtcSecond(task.endedAt) || typeof task.completedUnassisted !== "boolean" || typeof task.assistanceProvided !== "boolean") throw new Error(`${participant.participantId}/${task.taskId}: task evidence is incomplete.`);
    if (Date.parse(task.startedAt) < Date.parse(participant.sessionStartedAt) || Date.parse(task.endedAt) > Date.parse(participant.sessionEndedAt)) throw new Error(`${participant.participantId}/${task.taskId}: task timestamps fall outside the session.`);
  }
  const firstTaskStartedAt = Math.min(...participant.tasks.map((task) => Date.parse(task.startedAt)));
  if (Date.parse(participant.consent.recordedAt) >= firstTaskStartedAt) throw new Error(`${participant.participantId}: consent must be recorded strictly before the first task starts.`);
  exactKeys(participant.moderation, ["evidenceOrigin", "automationGenerated", "attestationReference"], `${participant.participantId}: moderation evidence contains missing or unapproved fields.`);
  if (participant.moderation?.evidenceOrigin !== "human-moderated" || participant.moderation?.automationGenerated !== false || !opaqueReference(participant.moderation?.attestationReference)) throw new Error(`${participant.participantId}: human moderation attestation is missing or self-generated.`);
  const passedTasks = participant.tasks.filter((task) => taskPassed(task, protocol)).length;
  return { participantId: participant.participantId, locale: participant.locale, panelId: participant.panelId, passedTasks, passed: passedTasks >= protocol.usability.participantPassTasks };
}

export function evaluateUsability(participants, protocol) {
  if (!Array.isArray(participants)) throw new Error("Usability participant evidence must be an array.");
  const evaluated = participants.map((participant) => validateParticipant(participant, protocol));
  if (new Set(evaluated.map(({ participantId }) => participantId)).size !== evaluated.length) throw new Error("Participant IDs must be unique.");
  const summary = {};
  const panelIds = [];
  for (const locale of LOCALES) {
    const rows = evaluated.filter((row) => row.locale === locale);
    if (rows.length !== protocol.usability.participantsPerLocale) throw new Error(`${locale}: exactly 10 eligible participants are required.`);
    const localePanels = [...new Set(rows.map(({ panelId }) => panelId))];
    if (localePanels.length !== 1) throw new Error(`${locale}: exactly one locale-specific panel is required.`);
    panelIds.push(localePanels[0]);
    const passingParticipants = rows.filter(({ passed }) => passed).length;
    summary[locale] = { participants: rows.length, passingParticipants, passed: passingParticipants >= protocol.usability.languagePassParticipants };
  }
  if (panelIds[0] === panelIds[1]) throw new Error("English and French panels must be separate.");
  return { ...summary, passed: LOCALES.every((locale) => summary[locale].passed) };
}

function expectedScope(templates, locales, modes = [null]) {
  return templates.flatMap((template) => locales.flatMap((locale) => modes.map((mode) => ({ template, locale, ...(mode ? { mode } : {}) }))));
}

function validateManualRows(rows, expected, kind) {
  if (!Array.isArray(rows) || rows.length !== expected.length) throw new Error(`${kind}: exact manual scope is required.`);
  exact(rows.map(({ template, locale, mode }) => ({ template, locale, ...(mode ? { mode } : {}) })), expected, `${kind}: manual scope is missing or reordered.`);
  for (const row of rows) {
    exactKeys(row, ["template", "locale", ...(row.mode ? ["mode"] : []), "evidenceOrigin", "automationGenerated", "testerAttestationReference", "startedAt", "endedAt", "passed", "blockedTasks", "issueIds", "environment"], `${kind}/${row.locale}/${row.template}: manual evidence contains missing or unapproved fields.`);
    const baseValid = row.evidenceOrigin === "human-manual" && row.automationGenerated === false && opaqueReference(row.testerAttestationReference) && canonicalUtcSecond(row.startedAt) && canonicalUtcSecond(row.endedAt) && Date.parse(row.endedAt) > Date.parse(row.startedAt) && row.passed === true && row.blockedTasks === 0 && Array.isArray(row.issueIds) && row.issueIds.every((issueId) => /^issue-[a-f0-9]{12}$/.test(issueId));
    if (!baseValid) throw new Error(`${kind}/${row.locale}/${row.template}: real manual evidence is incomplete.`);
    if (kind === "screen-reader") {
      exactKeys(row.environment, ["assistiveTechnology", "assistiveTechnologyVersion", "browser", "browserVersion", "operatingSystem", "operatingSystemVersion"], `${kind}/${row.locale}/${row.template}: structured environment is incomplete or altered.`);
      const values = Object.values(row.environment);
      if (values.some((value) => !safeEnvironmentValue(value) || /(?:test|fixture|placeholder|unknown|n\/a|generic)/i.test(value))) throw new Error(`${kind}/${row.locale}/${row.template}: exact real assistive-technology environment is required.`);
      if ([row.environment.assistiveTechnologyVersion, row.environment.browserVersion, row.environment.operatingSystemVersion].some((value) => !/\d/.test(value))) throw new Error(`${kind}/${row.locale}/${row.template}: explicit version numbers are required.`);
    } else if (!safeEnvironmentValue(row.environment)) throw new Error(`${kind}/${row.locale}/${row.template}: environment is required.`);
  }
}

function validateIssues(issues) {
  if (!Array.isArray(issues)) throw new Error("Issue evidence must be an array.");
  for (const issue of issues) {
    exactKeys(issue, ["issueId", "severity", "observationCode", "observedAt", "status"], "Issue evidence contains missing or unapproved fields.");
    if (!/^issue-[a-f0-9]{12}$/.test(issue.issueId ?? "") || !SEVERITIES.includes(issue.severity) || !observationCode(issue.observationCode) || !canonicalUtcSecond(issue.observedAt) || !["open", "resolved", "accepted"].includes(issue.status)) throw new Error("Issue evidence is incomplete or invalid.");
  }
}

export function validateEvidence(evidence, protocol) {
  rejectParticipantPii(evidence);
  exactKeys(evidence, EVIDENCE_KEYS, "External-checkpoint evidence contains missing or unapproved top-level fields.");
  exactKeys(evidence.ownerInputs, OWNER_KEYS, "Owner inputs contain missing or unapproved fields.");
  exactKeys(evidence.usability, ["participants", "excludedCandidateCounts", "issues", "summary"], "Usability evidence contains missing or unapproved fields.");
  exactKeys(evidence.usability.excludedCandidateCounts, LOCALES, "Excluded-candidate counts must contain exactly both locales.");
  exactKeys(evidence.manualAccessibility, ["keyboard", "screenReader", "forcedColorsAndCvd", "issues"], "Manual-accessibility evidence contains missing or unapproved fields.");
  exactKeys(evidence.outsideAccessibilityReview, ["status", "reviewerName", "organisation", "independenceAttestation", "signedReportReference", "scopeResults", "issues"], "Outside-review evidence contains missing or unapproved fields.");
  exactKeys(evidence.currentResult, ["usability", "keyboard", "screenReader", "forcedColorsAndCvd", "fieldPerformance", "outsideAccessibilityReview"], "Current-result evidence contains missing or unapproved fields.");
  if (evidence.schemaVersion !== "witness-tree/phase3-external-checkpoint-evidence/2" || evidence.protocolVersion !== protocol.schemaVersion || evidence.productionEligible !== false) throw new Error("External-checkpoint evidence boundary is invalid.");
  if (evidence.status === "pending-real-evidence") {
    if (evidence.completionClaimed !== false || evidence.completionEvidenceOrigin !== "none") throw new Error("Pending evidence cannot claim completion or an evidence origin.");
    if (Object.values(evidence.ownerInputs ?? {}).some((value) => value !== null) || Object.values(evidence.usability?.excludedCandidateCounts ?? {}).some((value) => value !== null) || evidence.usability?.participants?.length !== 0 || evidence.usability?.issues?.length !== 0 || evidence.usability?.summary !== null || evidence.manualAccessibility?.keyboard?.length !== 0 || evidence.manualAccessibility?.screenReader?.length !== 0 || evidence.manualAccessibility?.forcedColorsAndCvd?.length !== 0 || evidence.manualAccessibility?.issues?.length !== 0 || evidence.fieldPerformance?.length !== 0 || evidence.outsideAccessibilityReview?.status !== "not-started" || [evidence.outsideAccessibilityReview?.reviewerName, evidence.outsideAccessibilityReview?.organisation, evidence.outsideAccessibilityReview?.independenceAttestation, evidence.outsideAccessibilityReview?.signedReportReference].some((value) => value !== null) || evidence.outsideAccessibilityReview?.scopeResults?.length !== 0 || evidence.outsideAccessibilityReview?.issues?.length !== 0) throw new Error("Pending evidence must not contain inferred or fabricated results.");
    exact(evidence.currentResult, PENDING_RESULTS, "Pending checkpoint statuses must remain fail-closed.");
    return { status: evidence.status, passed: false, usability: null };
  }
  if (evidence.status !== "complete" || evidence.completionClaimed !== true || evidence.completionEvidenceOrigin !== "human-and-external") throw new Error("Completion must be supported by human and external evidence.");
  const owner = evidence.ownerInputs;
  if (!RELEASE_ID.test(owner?.releaseId ?? "") || !nonempty(owner?.studyOwnerName) || !Number.isInteger(owner?.approvedRetentionDays) || owner.approvedRetentionDays < 1 || !CONSENT_FORM_VERSION.test(owner?.consentFormVersion ?? "") || !opaqueReference(owner?.recruitmentApprovalReference) || !opaqueReference(owner?.privacyReviewReference) || !opaqueReference(owner?.fieldPerformanceSamplingDecisionReference) || !Number.isInteger(owner?.fieldPerformanceMinimumSamplesPerLocale) || owner.fieldPerformanceMinimumSamplesPerLocale < 1 || !canonicalHttpsOrigin(owner?.fieldPerformanceUrlOrigin) || !canonicalUtcSecond(owner?.fieldPerformanceWindowStartedAt) || !canonicalUtcSecond(owner?.fieldPerformanceWindowEndedAt) || Date.parse(owner.fieldPerformanceWindowEndedAt) <= Date.parse(owner.fieldPerformanceWindowStartedAt) || !safeEnvironmentValue(owner?.fieldPerformanceProvider) || !opaqueReference(owner?.fieldPerformanceConfigurationReference)) throw new Error("Required owner-provided execution inputs are incomplete.");
  validateIssues(evidence.usability.issues);
  if (LOCALES.some((locale) => !Number.isInteger(evidence.usability.excludedCandidateCounts?.[locale]) || evidence.usability.excludedCandidateCounts[locale] < 0)) throw new Error("Excluded-candidate counts must be de-identified locale aggregates.");
  const usability = evaluateUsability(evidence.usability.participants, protocol);
  exact(evidence.usability.summary, usability, "Usability summary must be recomputed exactly.");
  if (!usability.passed) throw new Error("Both language panels must independently meet the 8-of-10 rule.");
  validateManualRows(evidence.manualAccessibility.keyboard, expectedScope(TEMPLATES, LOCALES), "keyboard");
  validateManualRows(evidence.manualAccessibility.screenReader, expectedScope(SCREEN_READER_TEMPLATES, LOCALES), "screen-reader");
  validateManualRows(evidence.manualAccessibility.forcedColorsAndCvd, expectedScope(TEMPLATES, LOCALES, CVD_MODES), "forced-colors/CVD");
  validateIssues(evidence.manualAccessibility.issues);
  const fieldExpected = LOCALES.map((locale) => ({ locale }));
  if (evidence.fieldPerformance.length !== 2) throw new Error("Field-performance evidence is required separately for both locales.");
  exact(evidence.fieldPerformance.map(({ locale }) => ({ locale })), fieldExpected, "Field-performance locale scope is incomplete.");
  for (const row of evidence.fieldPerformance) {
    exactKeys(row, ["locale", "metric", "statistic", "valueMs", "eligibleSamples", "windowStartedAt", "windowEndedAt", "urlOrigin", "provider", "configurationReference", "samplingDecisionReference", "privacyReviewReference", "aggregateReportReference", "containsParticipantIdentifiers"], `${row.locale}: field-performance evidence contains missing or unapproved fields.`);
    if (row.metric !== "LCP" || row.statistic !== "p75" || !Number.isFinite(row.valueMs) || row.valueMs >= 2000 || !Number.isInteger(row.eligibleSamples) || row.eligibleSamples < owner.fieldPerformanceMinimumSamplesPerLocale || !canonicalUtcSecond(row.windowStartedAt) || !canonicalUtcSecond(row.windowEndedAt) || row.windowStartedAt !== owner.fieldPerformanceWindowStartedAt || row.windowEndedAt !== owner.fieldPerformanceWindowEndedAt || !canonicalHttpsOrigin(row.urlOrigin) || row.urlOrigin !== owner.fieldPerformanceUrlOrigin || !safeEnvironmentValue(row.provider) || row.provider !== owner.fieldPerformanceProvider || row.configurationReference !== owner.fieldPerformanceConfigurationReference || row.samplingDecisionReference !== owner.fieldPerformanceSamplingDecisionReference || row.privacyReviewReference !== owner.privacyReviewReference || !opaqueReference(row.aggregateReportReference) || row.containsParticipantIdentifiers !== false) throw new Error(`${row.locale}: field-performance evidence is incomplete, unbound, or over threshold.`);
  }
  const review = evidence.outsideAccessibilityReview;
  if (review.status !== "complete" || !nonempty(review.reviewerName) || !nonempty(review.organisation) || !opaqueReference(review.independenceAttestation) || !opaqueReference(review.signedReportReference)) throw new Error("Outside accessibility review attestation is incomplete.");
  validateIssues(review.issues);
  const reviewExpected = expectedScope(TEMPLATES, LOCALES);
  if (review.scopeResults.length !== reviewExpected.length) throw new Error("Outside accessibility review scope is incomplete.");
  exact(review.scopeResults.map(({ template, locale }) => ({ template, locale })), reviewExpected, "Outside accessibility review scope is missing or reordered.");
  for (const row of review.scopeResults) {
    exactKeys(row, ["template", "locale", "wcag22aaReviewed", "en301549Reviewed", "unresolvedCritical", "reportSectionReference"], "Outside accessibility scope result contains missing or unapproved fields.");
    if (row.wcag22aaReviewed !== true || row.en301549Reviewed !== true || row.unresolvedCritical !== 0 || !opaqueReference(row.reportSectionReference)) throw new Error("Outside accessibility scope result is incomplete or has an unresolved critical defect.");
  }
  if (review.issues.some((issue) => issue.severity === "critical" && issue.status !== "resolved")) throw new Error("Outside review has an unresolved critical defect.");
  exact(evidence.currentResult, { usability: "passed", keyboard: "passed", screenReader: "passed", forcedColorsAndCvd: "passed", fieldPerformance: "passed", outsideAccessibilityReview: "passed" }, "Completed checkpoint statuses must match validated evidence.");
  return { status: evidence.status, passed: true, usability };
}

export async function checkPhase3ExternalCheckpoints({ protocol = null, evidence = null } = {}) {
  const loadedProtocol = protocol ?? JSON.parse(await readFile(protocolPath, "utf8"));
  const loadedEvidence = evidence ?? JSON.parse(await readFile(evidencePath, "utf8"));
  validateProtocol(loadedProtocol);
  return validateEvidence(loadedEvidence, loadedProtocol);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkPhase3ExternalCheckpoints();
  console.log(`Phase 3 external checkpoints remain fail-closed: ${result.status}; no usability, human accessibility, field-performance, or outside-review completion is claimed.`);
}
