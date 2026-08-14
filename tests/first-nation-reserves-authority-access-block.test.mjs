import assert from "node:assert/strict";
import test from "node:test";
import record from "../data/first-nation-reserves-authority-access-block.json" with { type: "json" };
import { validateFirstNationReservesAuthorityAccessBlock } from "../scripts/check-first-nation-reserves-authority-access-block.mjs";

test("First Nation reserve block rejects a point substitute, version claim, or production claim", () => {
  assert.doesNotThrow(() => validateFirstNationReservesAuthorityAccessBlock(record));
  for (const altered of [
    { ...record, officialCandidates: { ...record.officialCandidates, iscFirstNationLocationService: { ...record.officialCandidates.iscFirstNationLocationService, geometry: "Polygon" } } },
    { ...record, authorityAndRights: { ...record.authorityAndRights, versionedReleasedBoundaryArtifactVerified: true } },
    { ...record, actions: { ...record.actions, profiled: true } }
  ]) assert.throws(() => validateFirstNationReservesAuthorityAccessBlock(altered));
});
