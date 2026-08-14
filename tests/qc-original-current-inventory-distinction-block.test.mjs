import assert from "node:assert/strict";
import test from "node:test";
import record from "../data/qc-original-current-inventory-distinction-block.json" with { type: "json" };
import { validateQcOriginalCurrentInventoryDistinctionBlock } from "../scripts/check-qc-original-current-inventory-distinction-block.mjs";
test("QC original/current inventory rejects a current-map substitution or incomplete-acquisition claim", () => {
  assert.doesNotThrow(() => validateQcOriginalCurrentInventoryDistinctionBlock(record));
  for (const altered of [{ ...record, distinction: { ...record.distinction, sameArtifact: true } }, { ...record, authorityAndAccess: { ...record.authorityAndAccess, exactArtifactProfileVerified: true } }, { ...record, actions: { ...record.actions, reusedCurrentArchive: true } }, { ...record, actions: { ...record.actions, untrustedConcurrentPartialQuarantined: false } }, { ...record, actions: { ...record.actions, cleanResumableDownloadCompleted: true } }, { ...record, actions: { ...record.actions, downloadComplete: true } }]) assert.throws(() => validateQcOriginalCurrentInventoryDistinctionBlock(altered));
});
