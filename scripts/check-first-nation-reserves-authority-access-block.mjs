import { readFile } from "node:fs/promises";

export function validateFirstNationReservesAuthorityAccessBlock(record) {
  if (record?.schemaVersion !== 1 || record.status !== "authority-and-access-blocked" || record.productionRowId !== "first-nation-reserves") throw new Error("First-nation-reserves authority block identity drift.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewedAt ?? "")) throw new Error("First-nation-reserves block needs a UTC review timestamp.");
  const candidates = record.officialCandidates;
  if (candidates?.iscReserveBoundaryService?.publisher !== "Indigenous Services Canada" || candidates.iscReserveBoundaryService?.geometry !== "Polygon" || candidates.iscReserveBoundaryService?.isDataVersioned !== false) throw new Error("First-nation-reserves ISC polygon candidate drift.");
  if (candidates?.iscFirstNationLocationService?.publisher !== "Indigenous Services Canada" || candidates.iscFirstNationLocationService?.geometry !== "Point" || !/non-substitute/i.test(candidates.iscFirstNationLocationService?.scope ?? "")) throw new Error("First-nation-reserves point layer must remain a non-substitute.");
  const rights = record.authorityAndRights;
  for (const key of ["versionedReleasedBoundaryArtifactVerified", "exactArtifactLicenceAndAttributionVerified", "checksumAndArchiveRecoveryVerified", "engagementAndRightOfReplyRouteVerified"]) if (rights?.[key] !== false) throw new Error(`First-nation-reserves ${key} must remain unresolved.`);
  for (const [action, value] of Object.entries(record.actions ?? {})) if (value !== false) throw new Error(`First-nation-reserves ${action} must remain false.`);
  if (!Array.isArray(record.requiredBeforeAnyAcquisition) || record.requiredBeforeAnyAcquisition.length !== 4) throw new Error("First-nation-reserves block must retain every acquisition prerequisite.");
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(await readFile(new URL("../data/first-nation-reserves-authority-access-block.json", import.meta.url)));
  validateFirstNationReservesAuthorityAccessBlock(record);
  console.log("First-nation-reserves authority and access block passed.");
}
