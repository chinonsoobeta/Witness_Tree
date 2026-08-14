import { readFile } from "node:fs/promises";
export function validateModernTreatiesAuthorityAccessBlock(record) {
  if (record?.schemaVersion !== 1 || record.status !== "authority-and-access-blocked" || record.productionRowId !== "modern-treaties") throw new Error("Modern-treaties authority block identity drift.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewedAt ?? "")) throw new Error("Modern-treaties block needs a UTC review timestamp.");
  if (record.officialCandidate?.publisher !== "Crown-Indigenous Relations and Northern Affairs Canada" || record.officialCandidate?.datasetTitle !== "Modern treaties map") throw new Error("Modern-treaties official candidate drift.");
  const limit = record.legalGeometryLimit;
  if (limit?.distributedForInformalPurposes !== true || limit?.boundariesApproximateAndSubjectToRevision !== true || limit?.consultationRelianceForbidden !== true || limit?.machineReadableVectorArtifactVerified !== false) throw new Error("Modern-treaties legal-geometry limit must remain explicit.");
  for (const key of ["legalBoundaryArtifactVerified", "exactArtifactLicenceAndAttributionVerified", "checksumAndArchiveRecoveryVerified", "engagementAndRightOfReplyRouteVerified"]) if (record.authorityAndRights?.[key] !== false) throw new Error(`Modern-treaties ${key} must remain unresolved.`);
  for (const [action, value] of Object.entries(record.actions ?? {})) if (value !== false) throw new Error(`Modern-treaties ${action} must remain false.`);
  if (!Array.isArray(record.requiredBeforeAnyAcquisition) || record.requiredBeforeAnyAcquisition.length !== 4) throw new Error("Modern-treaties block must retain every acquisition prerequisite.");
  return record;
}
if (import.meta.url === `file://${process.argv[1]}`) { const record = JSON.parse(await readFile(new URL("../data/modern-treaties-authority-access-block.json", import.meta.url))); validateModernTreatiesAuthorityAccessBlock(record); console.log("Modern-treaties authority and access block passed."); }
