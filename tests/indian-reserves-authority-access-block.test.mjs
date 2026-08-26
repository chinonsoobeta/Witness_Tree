import assert from "node:assert/strict";
import test from "node:test";
import record from "../data/indian-reserves-authority-access-block.json" with { type: "json" };
import { validateIndianReservesAuthorityAccessBlock } from "../scripts/check-indian-reserves-authority-access-block.mjs";

test("Indian reserves block rejects a non-authoritative, non-versioned, or production claim", () => {
  assert.doesNotThrow(() => validateIndianReservesAuthorityAccessBlock(record));
  for (const altered of [
    { ...record, observedAccess: { ...record.observedAccess, versionedCoherentArtifact: true } },
    { ...record, authorityAndRights: { ...record.authorityAndRights, iscAuthoredReserveReleaseVerified: true } },
    { ...record, actions: { ...record.actions, profiled: true } }
  ]) assert.throws(() => validateIndianReservesAuthorityAccessBlock(altered));
});
