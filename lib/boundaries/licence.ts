import { localized } from "../domain/localized";
import type { LocalizedString } from "../domain/localized";
import type { BoundaryLicence, LicenceVersion } from "./types";

/**
 * Renders a licence version for display. An unversioned licence renders as `Unknown` with
 * an em dash and the reason it is unknown. It never renders as `0`, `1.0`, or a blank.
 */
export function formatLicenceVersion(version: LicenceVersion): LocalizedString {
  if (version.kind === "unknown") {
    if (!version.reason.trim()) throw new Error("An unknown licence version requires a reason.");
    return localized(`Unknown — ${version.reason}`, `Inconnu — ${version.reason}`);
  }
  if (!version.value.trim()) throw new Error("A known licence version requires a value.");
  return localized(version.value, version.value);
}

/** Rejects any attempt to coerce a missing licence version into a number or a blank. */
export function requireLicenceVersion(version: LicenceVersion): string {
  if (version.kind === "unknown") {
    throw new Error(`This licence carries no version number: ${version.reason}`);
  }
  return version.value;
}

/**
 * Collects the required attribution statements for a set of licences. Two publishers means
 * two statements; neither one covers the other, so neither may be dropped.
 */
export function requiredAttributions(licences: readonly BoundaryLicence[]): readonly string[] {
  if (licences.length === 0) throw new Error("At least one licence attribution is required.");
  const seen = new Set<string>();
  const statements: string[] = [];
  for (const licence of licences) {
    if (!licence.requiredAttributionTemplate.trim()) {
      throw new Error(`Licence ${licence.id} is missing its required attribution statement.`);
    }
    if (seen.has(licence.id)) continue;
    seen.add(licence.id);
    statements.push(licence.requiredAttributionTemplate);
  }
  return Object.freeze(statements);
}
