import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED = { sourceId: "alberta-historical-wildfire-2006-2025", stagedAcquisitionId: "alberta-historical-wildfire-2006-2025-2026-08-14", raw: { byteLength: 10400030, sha256: "8b6ed447ab0f958dbe845a53dc15362b8ef5c0810ad9420d2143f9f5ee010a72", contentIntegrity: "passed", rowCount: 27828, columnCount: 50 }, dictionary: { byteLength: 192870, sha256: "bfff81c0d0e4b5cb0684180a53ddab4da54ddb5dd63f0c0f9497fa67f2334cdf", contentIntegrity: "passed", pageCount: 16 } };

export function validateAlbertaHistoricalWildfireProfile(profile) {
  assert.equal(profile.status, "read-only-staging-profile");
  assert.match(profile.notice, /not a transformation, ingestion, immutable archive, current incident feed, perimeter dataset, or production dataset/i);
  assert.equal(profile.sourceId, EXPECTED.sourceId);
  assert.equal(profile.stagedAcquisitionId, EXPECTED.stagedAcquisitionId);
  assert.deepEqual(profile.raw, { localPath: "../Witness_Tree-data/raw/alberta-historical-wildfire/2026-08-14/fp-historical-wildfire-data-2006-2025.csv", ...EXPECTED.raw });
  assert.deepEqual(profile.dictionary, { localPath: "../Witness_Tree-data/raw/alberta-historical-wildfire/2026-08-14/fp-historical-wildfire-data-dictionary-2006-2025.pdf", ...EXPECTED.dictionary });
  assert.equal(profile.table.geometryKind, "none");
  assert.deepEqual(profile.table.yearRange, [2006, 2025]);
  assert.equal(profile.table.coordinateRange.missingLatitudeOrLongitude, 0);
  assert.equal(profile.table.identifierEvidence.duplicateKeyCount, 0);
  assert.equal(profile.productionEligible, false);
  assert.equal(profile.limitations.length, 4);
  return profile;
}

export async function checkAlbertaHistoricalWildfireProfile(file = new URL("../data/alberta-historical-wildfire-profile.json", import.meta.url)) {
  return validateAlbertaHistoricalWildfireProfile(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkAlbertaHistoricalWildfireProfile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/alberta-historical-wildfire-profile.json"));
  console.log("Alberta historical-wildfire staging profile passed.");
}
