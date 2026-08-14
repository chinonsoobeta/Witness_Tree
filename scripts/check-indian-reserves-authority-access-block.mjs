import { readFile } from "node:fs/promises";

export function validateIndianReservesAuthorityAccessBlock(record) {
  if (record?.schemaVersion !== 1 || record.status !== "authority-and-access-blocked" || record.productionRowId !== "indian-reserves") throw new Error("Indian-reserves authority block identity drift.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewedAt ?? "")) throw new Error("Indian-reserves block needs a UTC review timestamp.");
  if (record.candidate?.catalogueUrl !== "https://open.canada.ca/data/en/dataset/522b07b9-78e2-4819-b736-ad9208eb1067" || record.candidate?.publisher !== "Natural Resources Canada, Surveyor General Branch / Canada Lands Survey System") throw new Error("Indian-reserves authoritative candidate drift.");
  const access = record.observedAccess;
  if (access?.officialRestServiceListed !== true || access?.downloadableShapefileListed !== true || access?.downloadTransport !== "HTTP" || access?.versionedCoherentArtifact !== false || !/former GeoBase product.*attributes differ.*alignment remains/i.test(access.reason ?? "")) throw new Error("Indian-reserves access evidence drift.");
  const rights = record.authorityAndRights;
  if (rights?.iscAuthoredReserveReleaseVerified !== false || rights?.exactArtifactReuseAndRedistributionVerified !== false || rights?.engagementAndRightOfReplyRouteVerified !== false) throw new Error("Indian-reserves authority and rights must remain unresolved.");
  for (const [action, value] of Object.entries(record.actions ?? {})) if (value !== false) throw new Error(`Indian-reserves ${action} must remain false.`);
  if (!Array.isArray(record.requiredBeforeAnyAcquisition) || record.requiredBeforeAnyAcquisition.length !== 4) throw new Error("Indian-reserves block must retain every acquisition prerequisite.");
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(await readFile(new URL("../data/indian-reserves-authority-access-block.json", import.meta.url)));
  validateIndianReservesAuthorityAccessBlock(record);
  console.log("Indian-reserves authority and access block passed.");
}
