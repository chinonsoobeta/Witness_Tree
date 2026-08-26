import type { ConfidenceResult } from "../domain/confidence";
import type { EvidenceClass } from "../domain/evidence";
import type { LocalizedString } from "../domain/localized";
import type { Unknown } from "../domain/reported";
import type { LicenceId } from "../domain/source-ledger";

/**
 * Evidence-shaped value. A review may only compare two sides when both are
 * `observed`. An `unavailable` side is never silently treated as equal.
 */
export type Evidenced<T> =
  | Readonly<{ kind: "observed"; value: T }>
  | Readonly<{ kind: "unavailable"; reason: LocalizedString }>;

export const SOURCE_REVIEW_EVENT_CLASSES = ["update", "correction", "licence-change", "reprocessing-needed"] as const;

export type SourceReviewEventClass = (typeof SOURCE_REVIEW_EVENT_CLASSES)[number];

/** What a previously accepted fact rests on, and therefore what invalidates it. */
export type AcceptedFactDependency = "source-bytes" | "source-identity" | "licence-terms";

export type AcceptedFact = Readonly<{ id: string; dependsOn: AcceptedFactDependency }>;

export type RecordedLicence = Readonly<{
  licenceId: LicenceId;
  licenceVersion: string;
  licenceUrl: string;
  requiredAttribution: string;
}>;

/** The state that was recorded when the source was accepted. */
export type AcceptedSourceState = Readonly<{
  sourceId: string;
  acceptedAt: string;
  sha256: string;
  byteLength: number;
  sourceVersion: Evidenced<string>;
  entityTag: Evidenced<string>;
  lastModified: Evidenced<string>;
  licence: Evidenced<RecordedLicence>;
  acceptedFacts: readonly AcceptedFact[];
}>;

/** The state observed later at the same source identity. */
export type ObservedSourceState = Readonly<{
  sourceId: string;
  observedAt: string;
  sha256: Evidenced<string>;
  byteLength: Evidenced<number>;
  sourceVersion: Evidenced<string>;
  entityTag: Evidenced<string>;
  lastModified: Evidenced<string>;
  licence: Evidenced<RecordedLicence>;
}>;

export const REVIEW_FIELDS = [
  "sha256",
  "byteLength",
  "entityTag",
  "lastModified",
  "sourceVersion",
  "licenceId",
  "licenceVersion",
  "licenceUrl",
  "requiredAttribution",
] as const;

export type ReviewField = (typeof REVIEW_FIELDS)[number];

export type ReviewComparison = "equal" | "differs";

export type ReviewEvidence = Readonly<{
  field: ReviewField;
  comparison: ReviewComparison;
  accepted: string;
  observed: string;
  evidence: EvidenceClass;
}>;

export type SourceReviewEvent = Readonly<{
  eventClass: SourceReviewEventClass;
  reason: LocalizedString;
  evidence: readonly ReviewEvidence[];
}>;

export const RE_ACCEPTANCE_REQUIREMENT_IDS = [
  "re-verify-source-checksum",
  "re-record-source-provenance",
  "re-review-licence-and-attribution",
  "re-run-transformation-design",
  "publish-correction-notice",
  "obtain-checksum-evidence",
  "obtain-version-evidence",
  "obtain-licence-evidence",
] as const;

export type ReAcceptanceRequirementId = (typeof RE_ACCEPTANCE_REQUIREMENT_IDS)[number];

export type ReAcceptanceRequirement = Readonly<{
  id: ReAcceptanceRequirementId;
  requirement: LocalizedString;
}>;

/** A question the available evidence cannot answer, in the project's Unknown vocabulary. */
export type UnresolvedQuestion = Readonly<{
  question: LocalizedString;
  unknown: Unknown;
}>;

/**
 * Acceptance can only be retained by the one decision that observed no change.
 * The other two acceptance states cannot carry a retained source.
 */
export type RetainedAcceptance = Readonly<{
  state: "retained";
  acceptedAt: string;
  acceptedSha256: string;
}>;

export type WithdrawnAcceptance = Readonly<{
  state: "withdrawn";
  withdrawnAt: string;
  previouslyAcceptedSha256: string;
  invalidatedFacts: readonly AcceptedFact[];
  reAcceptanceRequirements: readonly ReAcceptanceRequirement[];
}>;

export type SuspendedAcceptance = Readonly<{
  state: "suspended";
  suspendedAt: string;
  previouslyAcceptedSha256: string;
  reAcceptanceRequirements: readonly ReAcceptanceRequirement[];
}>;

/** At least one event. A change decision can never carry an empty event list. */
export type NonEmptyEvents = readonly [...SourceReviewEvent[], SourceReviewEvent];

type ReviewCommon = Readonly<{
  sourceId: string;
  reviewedAt: string;
  reason: LocalizedString;
  evidence: readonly ReviewEvidence[];
  confidence: ConfidenceResult;
  /** A source review can never grant production eligibility or claim remote storage. */
  productionEligible: false;
  immutableObjectStorage: false;
}>;

export type NoChangeObservedReview = ReviewCommon &
  Readonly<{
    outcome: "no-change-observed";
    events: readonly [];
    acceptance: RetainedAcceptance;
    unresolved?: never;
  }>;

export type ChangeObservedReview = ReviewCommon &
  Readonly<{
    outcome: "change-observed";
    events: NonEmptyEvents;
    acceptance: WithdrawnAcceptance;
    unresolved?: UnresolvedQuestion;
  }>;

export type EvidenceInsufficientReview = ReviewCommon &
  Readonly<{
    outcome: "evidence-insufficient";
    events: readonly [];
    acceptance: SuspendedAcceptance;
    unresolved: UnresolvedQuestion;
  }>;

export type SourceReviewDecision = NoChangeObservedReview | ChangeObservedReview | EvidenceInsufficientReview;

type Assert<T extends true> = T;

/**
 * Compile-time proof of the two rules this unit exists to enforce.
 * These aliases fail to compile if either rule is ever weakened.
 */
export type RetainedAcceptanceEventsAreEmpty = Assert<
  Extract<SourceReviewDecision, { acceptance: { state: "retained" } }>["events"] extends readonly [] ? true : false
>;

export type ChangeAlwaysWithdrawsAcceptance = Assert<
  Extract<SourceReviewDecision, { outcome: "change-observed" }>["acceptance"]["state"] extends "withdrawn" ? true : false
>;

export type MissingEvidenceIsNeverNoChange = Assert<
  Extract<SourceReviewDecision, { outcome: "evidence-insufficient" }>["acceptance"]["state"] extends "retained" ? false : true
>;
