import { readFile } from "node:fs/promises";
export function validateHistoricTreatiesAuthorityAccessBlock(record) {
  if (record?.schemaVersion !== 1 || record.status !== "authority-and-access-blocked" || record.productionRowId !== "historic-treaties") throw new Error("Historic-treaties authority block identity drift.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewedAt ?? "")) throw new Error("Historic-treaties block needs a UTC review timestamp.");
  const candidate = record.officialCandidate;
  if (candidate?.publisher !== "Crown-Indigenous Relations and Northern Affairs Canada and Indigenous Services Canada" || candidate?.primaryMappingSource !== true || !candidate?.advertisedFormats?.includes("SHP")) throw new Error("Historic-treaties official candidate drift.");
  const limit = record.legalGeometryLimit;
  if (limit?.boundariesUsuallySurveyed !== false || limit?.estimatedFromWrittenDescriptions !== true || limit?.informationalAndRepresentationalOnly !== true || limit?.illustrativePolygonsMayBeUsedWhereNoGeographicDescription !== true) throw new Error("Historic-treaties legal-geometry limit must remain explicit.");
  for (const key of ["legalBoundaryArtifactVerified", "exactArtifactLicenceAndAttributionVerified", "checksumAndArchiveRecoveryVerified", "engagementAndRightOfReplyRouteVerified"]) if (record.authorityAndRights?.[key] !== false) throw new Error(`Historic-treaties ${key} must remain unresolved.`);
  for (const [action, value] of Object.entries(record.actions ?? {})) if (value !== false) throw new Error(`Historic-treaties ${action} must remain false.`);
  if (!Array.isArray(record.requiredBeforeAnyAcquisition) || record.requiredBeforeAnyAcquisition.length !== 4) throw new Error("Historic-treaties block must retain every acquisition prerequisite.");
  return record;
}
if (import.meta.url === `file://${process.argv[1]}`) { const record = JSON.parse(await readFile(new URL("../data/historic-treaties-authority-access-block.json", import.meta.url))); validateHistoricTreatiesAuthorityAccessBlock(record); console.log("Historic-treaties authority and access block passed."); }
