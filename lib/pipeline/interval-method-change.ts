import { gateMethodChange, type MethodChangeMarker, type MethodParameterManifest } from "./method-manifest";

const SHA256 = /^[a-f0-9]{64}$/;

export type FileBinding = Readonly<{ path: string; sha256: string }>;

export type IntervalMethodChangeRecord = Readonly<{
  schemaVersion: "witness-tree/phase3-interval-method-change/1";
  marker: MethodChangeMarker;
  manifests: Readonly<{ previous: FileBinding; next: FileBinding }>;
  releaseNote: Readonly<{ id: string; path: string; sha256: string; en: string; fr: string }>;
  recomputation: Readonly<{
    product: FileBinding;
    derivedFrom: string;
    reason: string;
    reproduced: Readonly<{ annualSpans: string; shippedAnnualTable: string }>;
  }>;
  claims: Readonly<{ admitted: false; released: false; productionEligible: false; expertReviewed: false; externalAction: false }>;
}>;

export type IntervalReleaseEnvelope = Readonly<{
  firstYear: number;
  lastYear: number;
  annualStepCount: number;
  spanCount: number;
  summedPercentAllowed: boolean;
  netChangeIncluded: boolean;
  jurisdictions: readonly Readonly<{ jurisdiction: string; methodVersion: string }>[];
  claims: Readonly<{ admitted: boolean; released: boolean; productionEligible: boolean }>;
}>;

/** Files the record binds, resolved to the digest of what is actually on disk. */
export type DigestLookup = (path: string) => string;

function binding(actual: DigestLookup, bound: FileBinding, label: string): void {
  if (!SHA256.test(bound.sha256)) throw new Error(`${label} requires a SHA-256 checksum.`);
  const digest = actual(bound.path);
  if (digest !== bound.sha256) throw new Error(`${label} is bound to ${bound.sha256} but ${bound.path} hashes to ${digest}.`);
}

/**
 * The version bump is only worth something if the thing it names is the thing that shipped.
 * Every arm here exists to stop the bump from becoming decorative: the marker must gate a real
 * parameter change, the parameters must be the annual ones plus the span block and nothing else,
 * the release note must exist at the digest it claims, and the shipped table must carry the new
 * version in every jurisdiction rather than the old one.
 */
export function validateIntervalMethodChange(
  record: IntervalMethodChangeRecord,
  previous: MethodParameterManifest,
  next: MethodParameterManifest,
  release: IntervalReleaseEnvelope,
  digestOf: DigestLookup,
): Readonly<{ methodVersion: string; parameterSha256: string; spanCount: number }> {
  if (record.schemaVersion !== "witness-tree/phase3-interval-method-change/1") throw new Error("Interval method change record has an unknown schema version.");

  const gated = gateMethodChange(previous, next, record.marker);
  if (!gated.changed) throw new Error("An interval method change record must gate a real parameter change.");

  binding(digestOf, record.manifests.previous, "The previous method manifest binding");
  binding(digestOf, record.manifests.next, "The next method manifest binding");
  binding(digestOf, record.releaseNote, "The release note binding");
  binding(digestOf, record.recomputation.product, "The recomputed product binding");

  if (record.releaseNote.id !== record.marker.releaseNoteId) throw new Error("The release note ID must be the one the marker requires.");
  if (!record.releaseNote.en.trim() || !record.releaseNote.fr.trim()) throw new Error("The release note must be bilingual.");
  if (record.releaseNote.en.trim() === record.releaseNote.fr.trim()) throw new Error("The release note must be translated, not duplicated.");
  if (!record.recomputation.derivedFrom.trim() || !record.recomputation.reason.trim()) throw new Error("A recomputation must state what it was derived from and why it was needed.");
  if (!record.recomputation.reproduced.annualSpans.trim() || !record.recomputation.reproduced.shippedAnnualTable.trim()) throw new Error("A recomputation must state what it reproduced.");

  const interval = next.parameters.interval;
  if (!interval) throw new Error("The next method must declare the span block that the bump exists for.");
  if (previous.parameters.interval !== undefined) throw new Error("The previous method must be the annual one, which declares no span block.");

  // The note claims the span block is the entire delta. This is where that claim is checked.
  const withoutInterval = { ...next.parameters };
  delete (withoutInterval as { interval?: unknown }).interval;
  if (JSON.stringify(withoutInterval) !== JSON.stringify(previous.parameters)) {
    throw new Error("The span block must be the only parameter that changed between the annual method and the interval method.");
  }

  if (release.firstYear !== interval.firstYear || release.lastYear !== interval.lastYear) throw new Error("The shipped interval table covers a different record than the method declares.");
  if (release.annualStepCount !== interval.annualStepCount || release.spanCount !== interval.spanCount) throw new Error("The shipped interval table enumerates a different number of steps or spans than the method declares.");
  if (release.summedPercentAllowed !== false || release.netChangeIncluded !== false) throw new Error("The shipped interval table must carry the same summed-percentage and net-change bans as the method.");
  if (release.claims.admitted !== false || release.claims.released !== false || release.claims.productionEligible !== false) throw new Error("A method version bump does not admit, release, or qualify a product for production.");
  if (record.claims.admitted !== false || record.claims.released !== false || record.claims.productionEligible !== false || record.claims.expertReviewed !== false || record.claims.externalAction !== false) {
    throw new Error("The interval method change record must claim nothing beyond the bump.");
  }

  if (release.jurisdictions.length === 0) throw new Error("The shipped interval table declares no jurisdictions.");
  const stale = release.jurisdictions.filter((entry) => entry.methodVersion !== next.methodVersion);
  if (stale.length > 0) throw new Error(`The shipped interval table still names an older method version in ${stale.map((entry) => entry.jurisdiction).join(", ")}.`);

  return Object.freeze({ methodVersion: gated.identity.methodVersion, parameterSha256: gated.identity.parameterSha256, spanCount: interval.spanCount });
}
