import assert from "node:assert/strict";
import test from "node:test";
import protocol from "../data/phase3-external-checkpoint-protocol.json" with { type: "json" };
import pendingEvidence from "../data/phase3-external-checkpoint-evidence.json" with { type: "json" };
import { CVD_MODES, LOCALES, SCREEN_READER_TEMPLATES, TASK_IDS, TEMPLATES, evaluateUsability, validateEvidence, validateProtocol } from "../scripts/check-phase3-external-checkpoints.mjs";

const clone = (value) => structuredClone(value);

function participant(locale, index) {
  const base = Date.parse(`2026-09-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`);
  const passing = index < 8;
  return {
    participantId: (locale === "en" ? index + 1 : index + 101).toString(16).padStart(16, "0"),
    panelId: locale === "en" ? "eeeeeeeeeeeeeeee" : "ffffffffffffffff",
    locale,
    eligibility: { age18Plus: true, languageComfortable: true, noWitnessTreeExposure: true, nonGis24Months: true, noOtherPanel: true, consentBeforeTasks: true },
    consent: { status: "explicit-recorded", receiptReference: `consent-${locale}-${index}`, protocolVersion: protocol.schemaVersion, recordedAt: new Date(base - 60_000).toISOString() },
    sessionStartedAt: new Date(base).toISOString(),
    sessionEndedAt: new Date(base + 10 * 60_000).toISOString(),
    tasks: TASK_IDS.map((taskId, taskIndex) => ({ taskId, startedAt: new Date(base + taskIndex * 100_000).toISOString(), endedAt: new Date(base + taskIndex * 100_000 + 60_000).toISOString(), completedUnassisted: passing || taskIndex < 3, assistanceProvided: false })),
    moderation: { evidenceOrigin: "human-moderated", automationGenerated: false, attestationReference: `moderator-attestation-${locale}-${index}` },
  };
}

const scopes = (templates, locales, modes = [null], screenReader = false) => templates.flatMap((template) => locales.flatMap((locale) => modes.map((mode) => ({ template, locale, ...(mode ? { mode } : {}), evidenceOrigin: "human-manual", automationGenerated: false, testerAttestationReference: `attestation-${template}-${locale}-${mode ?? "default"}`, startedAt: "2026-09-20T16:00:00.000Z", endedAt: "2026-09-20T16:30:00.000Z", passed: true, blockedTasks: 0, issueIds: [], environment: screenReader ? { assistiveTechnology: "VoiceOver", assistiveTechnologyVersion: "15.6", browser: "Safari", browserVersion: "18.6", operatingSystem: "macOS", operatingSystemVersion: "15.6" } : "Chrome 151 on macOS 15.6" }))));

function completeEvidence() {
  const participants = LOCALES.flatMap((locale) => Array.from({ length: 10 }, (_, index) => participant(locale, index)));
  const usability = evaluateUsability(participants, protocol);
  return {
    schemaVersion: "witness-tree/phase3-external-checkpoint-evidence/2",
    protocolVersion: protocol.schemaVersion,
    status: "complete",
    completionClaimed: true,
    completionEvidenceOrigin: "human-and-external",
    productionEligible: false,
    ownerInputs: {
      releaseId: "test-only-release",
      studyOwnerName: "Test-only accountable owner",
      approvedRetentionDays: 30,
      consentFormVersion: "test-only-consent-v1",
      recruitmentApprovalReference: "test-only-recruitment-approval",
      privacyReviewReference: "test-only-privacy-review",
      fieldPerformanceSamplingDecisionReference: "test-only-sampling-decision",
      fieldPerformanceMinimumSamplesPerLocale: 100,
      fieldPerformanceUrlOrigin: "https://example.invalid",
      fieldPerformanceWindowStartedAt: "2026-09-01T00:00:00.000Z",
      fieldPerformanceWindowEndedAt: "2026-09-29T00:00:00.000Z",
      fieldPerformanceProvider: "ApprovedAggregateRUM",
      fieldPerformanceConfigurationReference: "test-only-field-config"
    },
    usability: { participants, excludedCandidateCounts: { en: 0, fr: 0 }, issues: [], summary: usability },
    manualAccessibility: {
      keyboard: scopes(TEMPLATES, LOCALES),
      screenReader: scopes(SCREEN_READER_TEMPLATES, LOCALES, [null], true),
      forcedColorsAndCvd: scopes(TEMPLATES, LOCALES, CVD_MODES),
      issues: []
    },
    fieldPerformance: LOCALES.map((locale) => ({ locale, metric: "LCP", statistic: "p75", valueMs: 1500, eligibleSamples: 100, windowStartedAt: "2026-09-01T00:00:00.000Z", windowEndedAt: "2026-09-29T00:00:00.000Z", urlOrigin: "https://example.invalid", provider: "ApprovedAggregateRUM", configurationReference: "test-only-field-config", samplingDecisionReference: "test-only-sampling-decision", privacyReviewReference: "test-only-privacy-review", aggregateReportReference: `test-only-field-report-${locale}`, containsParticipantIdentifiers: false })),
    outsideAccessibilityReview: {
      status: "complete",
      reviewerName: "Test-only outside reviewer",
      organisation: "Test-only outside organisation",
      independenceAttestation: "test-only-independence-attestation",
      signedReportReference: "test-only-signed-report",
      scopeResults: scopes(TEMPLATES, LOCALES).map(({ template, locale }) => ({ template, locale, wcag22aaReviewed: true, en301549Reviewed: true, unresolvedCritical: 0, reportSectionReference: `test-only-${template}-${locale}` })),
      issues: []
    },
    currentResult: { usability: "passed", keyboard: "passed", screenReader: "passed", forcedColorsAndCvd: "passed", fieldPerformance: "passed", outsideAccessibilityReview: "passed" }
  };
}

test("committed package is complete as a protocol and fail-closed as evidence", () => {
  assert.doesNotThrow(() => validateProtocol(protocol));
  assert.deepEqual(validateEvidence(pendingEvidence, protocol), { status: "pending-real-evidence", passed: false, usability: null });
  assert.deepEqual(pendingEvidence.ownerInputs, {
    releaseId: null, studyOwnerName: null, approvedRetentionDays: null, consentFormVersion: null, recruitmentApprovalReference: null, privacyReviewReference: null,
    fieldPerformanceSamplingDecisionReference: null, fieldPerformanceMinimumSamplesPerLocale: null, fieldPerformanceUrlOrigin: null,
    fieldPerformanceWindowStartedAt: null, fieldPerformanceWindowEndedAt: null, fieldPerformanceProvider: null, fieldPerformanceConfigurationReference: null
  });
});

test("canonical protocol rejects altered task, threshold, privacy, locale or scope", () => {
  for (const mutate of [
    (copy) => { copy.usability.tasks[0].prompt.en = "Changed task"; },
    (copy) => { copy.usability.participantsPerLocale = 9; },
    (copy) => { copy.usability.locales = ["en"]; },
    (copy) => { copy.usability.privacy.neverStore.pop(); },
    (copy) => { copy.manualAccessibility.screenReader.templates.pop(); },
    (copy) => { copy.fieldPerformance.thresholdMsExclusive = 2500; },
    (copy) => { copy.outsideAccessibilityReview.standards.pop(); }
  ]) {
    const copy = clone(protocol); mutate(copy);
    assert.throws(() => validateProtocol(copy));
  }
});

test("test-only complete fixture proves the exact 4-of-5 and 8-of-10 arithmetic", () => {
  const result = validateEvidence(completeEvidence(), protocol);
  assert.equal(result.passed, true);
  assert.deepEqual(result.usability, {
    en: { participants: 10, passingParticipants: 8, passed: true },
    fr: { participants: 10, passingParticipants: 8, passed: true },
    passed: true
  });
});

test("completion rejects participant, task, locale, threshold, consent and self-generation tampering", () => {
  const cases = [
    ["undercounted English panel", (copy) => { copy.usability.participants.splice(0, 1); }],
    ["missing task", (copy) => { copy.usability.participants[0].tasks.pop(); }],
    ["wrong locale count", (copy) => { copy.usability.participants.find(({ locale }) => locale === "fr").locale = "en"; }],
    ["only seven passing participants", (copy) => { const row = copy.usability.participants.filter(({ locale }) => locale === "en")[7]; row.tasks[3].completedUnassisted = false; row.tasks[4].completedUnassisted = false; }],
    ["task at 180-second boundary", (copy) => { const row = copy.usability.participants.filter(({ locale }) => locale === "en")[7]; row.tasks[4].completedUnassisted = false; row.tasks[0].endedAt = new Date(Date.parse(row.tasks[0].startedAt) + 180_000).toISOString(); }],
    ["missing consent", (copy) => { copy.usability.participants[0].consent.receiptReference = ""; }],
    ["self-generated participant evidence", (copy) => { copy.usability.participants[0].moderation.automationGenerated = true; }],
    ["self-generated completion claim", (copy) => { copy.completionEvidenceOrigin = "self-generated"; }],
    ["same bilingual panel", (copy) => { for (const row of copy.usability.participants.filter(({ locale }) => locale === "fr")) row.panelId = "eeeeeeeeeeeeeeee"; }],
    ["participant PII", (copy) => { copy.usability.participants[0].email = "forbidden@example.invalid"; }],
    ["missing screen-reader locale/template", (copy) => { copy.manualAccessibility.screenReader.pop(); }],
    ["missing CVD mode", (copy) => { copy.manualAccessibility.forcedColorsAndCvd.pop(); }],
    ["field LCP at boundary", (copy) => { copy.fieldPerformance[0].valueMs = 2000; }],
    ["missing field locale", (copy) => { copy.fieldPerformance.pop(); }],
    ["outside review not independent", (copy) => { copy.outsideAccessibilityReview.independenceAttestation = ""; }],
    ["outside unresolved critical", (copy) => { copy.outsideAccessibilityReview.scopeResults[0].unresolvedCritical = 1; }]
  ];
  for (const [name, mutate] of cases) {
    const copy = completeEvidence(); mutate(copy);
    assert.throws(() => validateEvidence(copy, protocol), name);
  }
});

test("recursive completed schema rejects arbitrary fields, fabricated results, and PII aliases", () => {
  const cases = [
    ["top-level field", (copy) => { copy.arbitrary = true; }],
    ["obsolete schema", (copy) => { copy.schemaVersion = "witness-tree/phase3-external-checkpoint-evidence/1"; }],
    ["fabricated top-level result", (copy) => { copy.result = "passed"; }],
    ["owner field", (copy) => { copy.ownerInputs.arbitrary = true; }],
    ["usability field", (copy) => { copy.usability.completion = "passed"; }],
    ["excluded-count field", (copy) => { copy.usability.excludedCandidateCounts.other = 0; }],
    ["manual container field", (copy) => { copy.manualAccessibility.result = "passed"; }],
    ["outside-review field", (copy) => { copy.outsideAccessibilityReview.completionStatus = "passed"; }],
    ["current-result field", (copy) => { copy.currentResult.fabricated = "passed"; }],
    ["participant field", (copy) => { copy.usability.participants[0].nickname = "x"; }],
    ["eligibility field", (copy) => { copy.usability.participants[0].eligibility.extra = true; }],
    ["consent field", (copy) => { copy.usability.participants[0].consent.extra = true; }],
    ["task field", (copy) => { copy.usability.participants[0].tasks[0].result = "passed"; }],
    ["moderation field", (copy) => { copy.usability.participants[0].moderation.result = "human"; }],
    ["manual-row field", (copy) => { copy.manualAccessibility.keyboard[0].result = "passed"; }],
    ["screen-reader environment field", (copy) => { copy.manualAccessibility.screenReader[0].environment.device = "laptop"; }],
    ["field-row field", (copy) => { copy.fieldPerformance[0].result = "passed"; }],
    ["outside-scope field", (copy) => { copy.outsideAccessibilityReview.scopeResults[0].result = "passed"; }],
    ["issue field", (copy) => { copy.usability.issues.push({ issueId: "issue-000000000001", severity: "low", observationCode: "coded-observation", observedAt: "2026-09-20T16:00:00.000Z", status: "resolved", extra: true }); }],
    ["participantContact", (copy) => { copy.usability.participants[0].participantContact = "forbidden"; }],
    ["participant_contact_details", (copy) => { copy.usability.participants[0].participant_contact_details = "forbidden"; }],
    ["fullName", (copy) => { copy.usability.participants[0].fullName = "forbidden"; }],
    ["full_legal_name", (copy) => { copy.usability.participants[0].full_legal_name = "forbidden"; }],
    ["email", (copy) => { copy.usability.participants[0].email = "forbidden@example.invalid"; }],
    ["contact_email", (copy) => { copy.usability.participants[0].contact_email = "forbidden@example.invalid"; }],
    ["reviewerEmail", (copy) => { copy.outsideAccessibilityReview.reviewerEmail = "forbidden@example.invalid"; }],
    ["reviewer_email_address", (copy) => { copy.outsideAccessibilityReview.reviewer_email_address = "forbidden@example.invalid"; }],
    ["client_ip", (copy) => { copy.usability.participants[0].client_ip = "192.0.2.1"; }]
  ];
  for (const [name, mutate] of cases) {
    const copy = completeEvidence(); mutate(copy);
    assert.throws(() => validateEvidence(copy, protocol), name);
  }
});

test("screen-reader completion requires an exact real assistive-technology environment", () => {
  const cases = [
    ["generic string", (copy) => { copy.manualAccessibility.screenReader[0].environment = "browser and screen reader"; }],
    ["missing assistive technology version", (copy) => { delete copy.manualAccessibility.screenReader[0].environment.assistiveTechnologyVersion; }],
    ["blank assistive technology", (copy) => { copy.manualAccessibility.screenReader[0].environment.assistiveTechnology = ""; }],
    ["missing browser version", (copy) => { delete copy.manualAccessibility.screenReader[0].environment.browserVersion; }],
    ["missing operating-system version", (copy) => { delete copy.manualAccessibility.screenReader[0].environment.operatingSystemVersion; }],
    ["generic current version", (copy) => { copy.manualAccessibility.screenReader[0].environment.browserVersion = "current"; }],
    ["placeholder environment", (copy) => { copy.manualAccessibility.screenReader[0].environment.browser = "test fixture"; }]
  ];
  for (const [name, mutate] of cases) {
    const copy = completeEvidence(); mutate(copy);
    assert.throws(() => validateEvidence(copy, protocol), name);
  }
});

test("field completion is exactly bound to owner-approved window, provider, configuration and decisions", () => {
  const cases = [
    ["missing owner window start", (copy) => { copy.ownerInputs.fieldPerformanceWindowStartedAt = null; }],
    ["reversed owner window", (copy) => { copy.ownerInputs.fieldPerformanceWindowEndedAt = "2026-08-01T00:00:00.000Z"; }],
    ["missing owner provider", (copy) => { copy.ownerInputs.fieldPerformanceProvider = ""; }],
    ["missing owner configuration", (copy) => { copy.ownerInputs.fieldPerformanceConfigurationReference = ""; }],
    ["row window start drift", (copy) => { copy.fieldPerformance[0].windowStartedAt = "2026-09-02T00:00:00.000Z"; }],
    ["row window end drift", (copy) => { copy.fieldPerformance[0].windowEndedAt = "2026-09-28T00:00:00.000Z"; }],
    ["row origin drift", (copy) => { copy.fieldPerformance[0].urlOrigin = "https://other.invalid"; }],
    ["row provider drift", (copy) => { copy.fieldPerformance[0].provider = "OtherProvider"; }],
    ["row configuration drift", (copy) => { copy.fieldPerformance[0].configurationReference = "other-config"; }],
    ["row sampling-decision drift", (copy) => { copy.fieldPerformance[0].samplingDecisionReference = "other-sampling"; }],
    ["row privacy-review drift", (copy) => { copy.fieldPerformance[0].privacyReviewReference = "other-privacy"; }]
  ];
  for (const [name, mutate] of cases) {
    const copy = completeEvidence(); mutate(copy);
    assert.throws(() => validateEvidence(copy, protocol), name);
  }
});

test("pending envelope rejects inferred placeholders, results, and completion claims", () => {
  for (const mutate of [
    (copy) => { copy.arbitrary = true; },
    (copy) => { copy.fabricatedResult = "passed"; },
    (copy) => { copy.ownerInputs.arbitrary = null; },
    (copy) => { copy.usability.result = null; },
    (copy) => { copy.usability.excludedCandidateCounts.other = null; },
    (copy) => { copy.manualAccessibility.completion = false; },
    (copy) => { copy.outsideAccessibilityReview.reviewPassed = false; },
    (copy) => { copy.currentResult.fabricated = "not-run"; },
    (copy) => { copy.participant_contact = null; },
    (copy) => { copy.outsideAccessibilityReview.reviewerEmail = null; },
    (copy) => { copy.ownerInputs.studyOwnerName = "inferred"; },
    (copy) => { copy.outsideAccessibilityReview.reviewerName = "inferred"; },
    (copy) => { copy.completionClaimed = true; },
    (copy) => { copy.completionEvidenceOrigin = "human-and-external"; },
    (copy) => { copy.usability.participants.push(participant("en", 0)); },
    (copy) => { copy.currentResult.keyboard = "passed"; }
  ]) {
    const copy = clone(pendingEvidence); mutate(copy);
    assert.throws(() => validateEvidence(copy, protocol));
  }
});
