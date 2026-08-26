import { assignConfidence } from "../domain/confidence";
import { localized, type LocalizedString } from "../domain/localized";
import type {
  AcceptedFact,
  AcceptedSourceState,
  Evidenced,
  ObservedSourceState,
  ReAcceptanceRequirement,
  ReAcceptanceRequirementId,
  RecordedLicence,
  ReviewEvidence,
  NonEmptyEvents,
  ReviewField,
  SourceReviewDecision,
  SourceReviewEvent,
  UnresolvedQuestion,
} from "./types";

const NO_EVENTS = Object.freeze([]) as readonly [];

const SHA_256 = /^[a-f0-9]{64}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const REQUIREMENTS: Record<ReAcceptanceRequirementId, LocalizedString> = {
  "re-verify-source-checksum": localized(
    "Retrieve the source again and record its exact byte length and SHA-256.",
    "Récupérer de nouveau la source et consigner sa longueur exacte en octets et son SHA-256.",
  ),
  "re-record-source-provenance": localized(
    "Record the publisher, catalogue URL, version, effective date and retrieval time for the new bytes.",
    "Consigner l’éditeur, l’URL du catalogue, la version, la date d’entrée en vigueur et l’heure de récupération des nouveaux octets.",
  ),
  "re-review-licence-and-attribution": localized(
    "Have the licence, redistribution terms and required attribution wording reviewed again before any reuse.",
    "Faire réexaminer la licence, les conditions de rediffusion et le libellé d’attribution exigé avant toute réutilisation.",
  ),
  "re-run-transformation-design": localized(
    "Re-run the staged profile and transformation-admission decision against the new bytes.",
    "Réexécuter le profil de préparation et la décision d’admission à la transformation sur les nouveaux octets.",
  ),
  "publish-correction-notice": localized(
    "Open a correction case, because content changed while the publisher asserted the same version.",
    "Ouvrir un dossier de correction, car le contenu a changé alors que l’éditeur affirme la même version.",
  ),
  "obtain-checksum-evidence": localized(
    "Obtain a comparable SHA-256 for the observed source before any conclusion is recorded.",
    "Obtenir un SHA-256 comparable pour la source observée avant de consigner une conclusion.",
  ),
  "obtain-version-evidence": localized(
    "Obtain the version the publisher asserts for the observed source.",
    "Obtenir la version que l’éditeur attribue à la source observée.",
  ),
  "obtain-licence-evidence": localized(
    "Obtain the current licence identifier, version, URL and required attribution wording.",
    "Obtenir l’identifiant, la version et l’URL de licence en vigueur ainsi que le libellé d’attribution exigé.",
  ),
};

function requirements(ids: readonly ReAcceptanceRequirementId[]): readonly ReAcceptanceRequirement[] {
  return Object.freeze([...new Set(ids)].map((id) => Object.freeze({ id, requirement: REQUIREMENTS[id] })));
}

function unresolvedQuestion(question: LocalizedString): UnresolvedQuestion {
  return Object.freeze({
    question,
    unknown: Object.freeze({
      kind: "unknown" as const,
      evidence: "unknown" as const,
      reason: question,
      coverageGrade: "not-applicable" as const,
    }),
  });
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Source review requires a non-empty ${field}.`);
  return value;
}

function requireTimestamp(value: string, field: string): number {
  if (!UTC_TIMESTAMP.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Source review requires a UTC ${field} timestamp.`);
  }
  return new Date(value).getTime();
}

function requireChecksum(value: string, field: string): string {
  if (!SHA_256.test(value)) throw new Error(`Source review requires a SHA-256 ${field}.`);
  return value.toLowerCase();
}

function requireByteLength(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Source review requires a positive ${field}.`);
  return value;
}

function requireEvidenced<T>(value: Evidenced<T>, field: string): Evidenced<T> {
  if (value?.kind === "observed") return value;
  if (value?.kind === "unavailable" && value.reason.en.trim() && value.reason.fr.trim()) return value;
  throw new Error(`Source review requires observed evidence or a stated reason for ${field}.`);
}

function requireLicence(value: Evidenced<RecordedLicence>, field: string): Evidenced<RecordedLicence> {
  const checked = requireEvidenced(value, field);
  if (checked.kind === "observed") {
    const licence = checked.value;
    requireText(licence.licenceId, `${field} licence identifier`);
    requireText(licence.licenceVersion, `${field} licence version`);
    requireText(licence.requiredAttribution, `${field} required attribution`);
    if (!/^https:\/\//.test(requireText(licence.licenceUrl, `${field} licence URL`))) {
      throw new Error(`Source review requires an HTTPS ${field} licence URL.`);
    }
  }
  return checked;
}

function bothObserved<T>(
  accepted: Evidenced<T>,
  observed: Evidenced<T>,
): Readonly<{ accepted: T; observed: T }> | null {
  if (accepted.kind !== "observed" || observed.kind !== "observed") return null;
  return { accepted: accepted.value, observed: observed.value };
}

function compare(field: ReviewField, accepted: string, observed: string): ReviewEvidence {
  return Object.freeze({
    field,
    comparison: accepted === observed ? ("equal" as const) : ("differs" as const),
    accepted,
    observed,
    evidence: "official-record" as const,
  });
}

const LICENCE_FIELDS: ReadonlyArray<Readonly<{ field: ReviewField; read: (licence: RecordedLicence) => string }>> = [
  { field: "licenceId", read: (licence) => licence.licenceId },
  { field: "licenceVersion", read: (licence) => licence.licenceVersion },
  { field: "licenceUrl", read: (licence) => licence.licenceUrl },
  { field: "requiredAttribution", read: (licence) => licence.requiredAttribution },
];

/**
 * Reviews an already accepted source against a later observation of the same
 * source identity. This is a pure decision: it performs no retrieval, hashing,
 * storage write, ingestion, or publication.
 *
 * A `throw` means the input is malformed or self-contradictory. Every other
 * result — including "there is not enough evidence to decide" — is a returned
 * decision that carries its own reasons.
 */
export function reviewSource(
  accepted: AcceptedSourceState,
  observed: ObservedSourceState,
  reviewedAt: string,
): SourceReviewDecision {
  const sourceId = requireText(accepted?.sourceId, "accepted source identifier");
  if (requireText(observed?.sourceId, "observed source identifier") !== sourceId) {
    throw new Error("A source review compares one source identity with a later observation of the same identity.");
  }
  const acceptedAt = requireTimestamp(requireText(accepted.acceptedAt, "acceptance time"), "acceptance");
  const observedAt = requireTimestamp(requireText(observed.observedAt, "observation time"), "observation");
  const reviewTime = requireTimestamp(requireText(reviewedAt, "review time"), "review");
  if (observedAt < acceptedAt) throw new Error("An observation cannot precede the acceptance it is reviewed against.");
  if (reviewTime < observedAt) throw new Error("A review cannot precede the observation it reads.");

  const acceptedSha256 = requireChecksum(accepted.sha256, "accepted checksum");
  const acceptedByteLength = requireByteLength(accepted.byteLength, "accepted byte length");
  const acceptedVersion = requireEvidenced(accepted.sourceVersion, "the accepted source version");
  const acceptedTag = requireEvidenced(accepted.entityTag, "the accepted entity tag");
  const acceptedModified = requireEvidenced(accepted.lastModified, "the accepted last-modified value");
  const acceptedLicence = requireLicence(accepted.licence, "accepted");
  if (!Array.isArray(accepted.acceptedFacts)) throw new Error("Source review requires a list of previously accepted facts.");
  const factIds = new Set<string>();
  for (const fact of accepted.acceptedFacts) {
    const id = requireText(fact?.id, "accepted fact identifier");
    if (factIds.has(id)) throw new Error("Previously accepted fact identifiers must be unique.");
    factIds.add(id);
  }

  const observedSha256 = requireEvidenced(observed.sha256, "the observed checksum");
  if (observedSha256.kind === "observed") requireChecksum(observedSha256.value, "observed checksum");
  const observedBytes = requireEvidenced(observed.byteLength, "the observed byte length");
  if (observedBytes.kind === "observed") requireByteLength(observedBytes.value, "observed byte length");
  const observedVersion = requireEvidenced(observed.sourceVersion, "the observed source version");
  const observedTag = requireEvidenced(observed.entityTag, "the observed entity tag");
  const observedModified = requireEvidenced(observed.lastModified, "the observed last-modified value");
  const observedLicence = requireLicence(observed.licence, "observed");

  const checksums = observedSha256.kind === "observed"
    ? { accepted: acceptedSha256, observed: observedSha256.value.toLowerCase() }
    : null;
  const byteLengths = observedBytes.kind === "observed"
    ? { accepted: acceptedByteLength, observed: observedBytes.value }
    : null;
  if (checksums && checksums.accepted === checksums.observed && byteLengths && byteLengths.accepted !== byteLengths.observed) {
    throw new Error("An identical SHA-256 cannot accompany a different byte length.");
  }

  const versions = bothObserved(acceptedVersion, observedVersion);
  const tags = bothObserved(acceptedTag, observedTag);
  const modified = bothObserved(acceptedModified, observedModified);
  const licences = bothObserved(acceptedLicence, observedLicence);

  const contentEvidence: ReviewEvidence[] = [];
  if (checksums) contentEvidence.push(compare("sha256", checksums.accepted, checksums.observed));
  else {
    if (byteLengths) contentEvidence.push(compare("byteLength", String(byteLengths.accepted), String(byteLengths.observed)));
    if (tags) contentEvidence.push(compare("entityTag", tags.accepted, tags.observed));
    if (modified) contentEvidence.push(compare("lastModified", modified.accepted, modified.observed));
  }
  const contentDiffs = contentEvidence.filter((item) => item.comparison === "differs");
  const contentChanged = contentDiffs.length > 0;

  const licenceEvidence = licences
    ? LICENCE_FIELDS.map((entry) => compare(entry.field, entry.read(licences.accepted), entry.read(licences.observed)))
    : [];
  const licenceDiffs = licenceEvidence.filter((item) => item.comparison === "differs");
  const licenceChanged = licenceDiffs.length > 0;

  const versionEvidence = versions ? compare("sourceVersion", versions.accepted, versions.observed) : null;

  if (contentChanged || licenceChanged) {
    const events: SourceReviewEvent[] = [];
    const invalidated: AcceptedFact[] = [];
    const required: ReAcceptanceRequirementId[] = [];
    let unresolved: UnresolvedQuestion | undefined;

    if (contentChanged) {
      required.push("re-verify-source-checksum", "re-record-source-provenance", "re-run-transformation-design");
      invalidated.push(...accepted.acceptedFacts.filter((fact) => fact.dependsOn === "source-bytes"));
      if (versionEvidence && versionEvidence.comparison === "equal") {
        invalidated.push(...accepted.acceptedFacts.filter((fact) => fact.dependsOn === "source-identity"));
        required.push("publish-correction-notice");
        events.push(
          Object.freeze({
            eventClass: "correction" as const,
            reason: localized(
              "The content changed while the publisher asserts the same version. Anything derived from the previously accepted bytes is now in question.",
              "Le contenu a changé alors que l’éditeur affirme la même version. Tout ce qui découle des octets acceptés auparavant est désormais remis en question.",
            ),
            evidence: Object.freeze([...contentDiffs, versionEvidence]),
          }),
        );
      } else if (versionEvidence) {
        events.push(
          Object.freeze({
            eventClass: "update" as const,
            reason: localized(
              "The publisher released new content at the same source identity under a new version.",
              "L’éditeur a publié un nouveau contenu à la même identité de source, sous une nouvelle version.",
            ),
            evidence: Object.freeze([...contentDiffs, versionEvidence]),
          }),
        );
      } else {
        required.push("obtain-version-evidence");
        unresolved = unresolvedQuestion(
          localized(
            "The content changed, but no comparable version is available on both sides, so this review cannot separate an update from a correction.",
            "Le contenu a changé, mais aucune version comparable n’est disponible des deux côtés; cet examen ne peut donc pas distinguer une mise à jour d’une correction.",
          ),
        );
      }
    }

    if (licenceChanged) {
      required.push("re-review-licence-and-attribution");
      invalidated.push(...accepted.acceptedFacts.filter((fact) => fact.dependsOn === "licence-terms"));
      events.push(
        Object.freeze({
          eventClass: "licence-change" as const,
          reason: localized(
            "The licence, licence version, licence URL or required attribution wording differs from what was accepted.",
            "La licence, la version de licence, l’URL de licence ou le libellé d’attribution exigé diffère de ce qui a été accepté.",
          ),
          evidence: Object.freeze(licenceDiffs),
        }),
      );
    }

    const allDiffs = Object.freeze([...contentDiffs, ...licenceDiffs]);
    const reprocessing: SourceReviewEvent = Object.freeze({
      eventClass: "reprocessing-needed" as const,
      reason: localized(
        "Work derived from this source must be recomputed and re-recorded before it can be relied on again.",
        "Les travaux dérivés de cette source doivent être recalculés et consignés de nouveau avant de pouvoir servir de nouveau.",
      ),
      evidence: allDiffs,
    });

    const allEvents: NonEmptyEvents = Object.freeze([...events, reprocessing]);

    const uniqueInvalidated = Object.freeze(
      invalidated.filter((fact, index) => invalidated.findIndex((other) => other.id === fact.id) === index),
    );

    return Object.freeze({
      sourceId,
      reviewedAt,
      outcome: "change-observed" as const,
      events: allEvents,
      acceptance: Object.freeze({
        state: "withdrawn" as const,
        withdrawnAt: reviewedAt,
        previouslyAcceptedSha256: acceptedSha256,
        invalidatedFacts: uniqueInvalidated,
        reAcceptanceRequirements: requirements(required),
      }),
      reason: localized(
        "The accepted state and the observed state differ, so the previous acceptance no longer holds.",
        "L’état accepté et l’état observé diffèrent; l’acceptation précédente ne tient donc plus.",
      ),
      evidence: allDiffs,
      confidence: assignConfidence({
        authoritativeRecord: true,
        geometryResolved: true,
        requiredAttributesPresent: true,
        partialAttribution: !checksums,
      }),
      unresolved,
      productionEligible: false as const,
      immutableObjectStorage: false as const,
    });
  }

  const checksumProven = Boolean(checksums && checksums.accepted === checksums.observed);
  if (checksumProven && licences) {
    return Object.freeze({
      sourceId,
      reviewedAt,
      outcome: "no-change-observed" as const,
      events: NO_EVENTS,
      acceptance: Object.freeze({
        state: "retained" as const,
        acceptedAt: accepted.acceptedAt,
        acceptedSha256,
      }),
      reason: localized(
        "The observed checksum matches the accepted checksum and every licence field compared as equal.",
        "La somme de contrôle observée correspond à celle qui a été acceptée et chaque champ de licence est identique.",
      ),
      evidence: Object.freeze([...contentEvidence, ...licenceEvidence]),
      confidence: assignConfidence({
        authoritativeRecord: true,
        geometryResolved: true,
        requiredAttributesPresent: true,
      }),
      productionEligible: false as const,
      immutableObjectStorage: false as const,
    });
  }

  const missing: ReAcceptanceRequirementId[] = [];
  const gaps: string[] = [];
  const gapsFr: string[] = [];
  if (!checksums) {
    missing.push("obtain-checksum-evidence");
    gaps.push("a comparable checksum");
    gapsFr.push("une somme de contrôle comparable");
  }
  if (!licences) {
    missing.push("obtain-licence-evidence");
    gaps.push("comparable licence terms");
    gapsFr.push("des conditions de licence comparables");
  }
  if (!versions) {
    missing.push("obtain-version-evidence");
    gaps.push("a comparable version");
    gapsFr.push("une version comparable");
  }

  const question = localized(
    `This review is missing ${gaps.join(", ")}. Absence of evidence is not evidence that the source is unchanged.`,
    `Il manque à cet examen ${gapsFr.join(", ")}. L’absence de preuve n’établit pas que la source est inchangée.`,
  );

  return Object.freeze({
    sourceId,
    reviewedAt,
    outcome: "evidence-insufficient" as const,
    events: NO_EVENTS,
    acceptance: Object.freeze({
      state: "suspended" as const,
      suspendedAt: reviewedAt,
      previouslyAcceptedSha256: acceptedSha256,
      reAcceptanceRequirements: requirements(missing),
    }),
    reason: question,
    evidence: Object.freeze([...contentEvidence, ...licenceEvidence, ...(versionEvidence ? [versionEvidence] : [])]),
    confidence: assignConfidence({
      authoritativeRecord: false,
      geometryResolved: false,
      requiredAttributesPresent: false,
    }),
    unresolved: unresolvedQuestion(question),
    productionEligible: false as const,
    immutableObjectStorage: false as const,
  });
}
