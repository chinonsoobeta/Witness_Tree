import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateVlce2RemotePromotionEvidence } from "../scripts/check-vlce2-remote-promotion-evidence.mjs";

const record = JSON.parse(readFileSync(new URL("../data/vlce2-remote-promotion-evidence.json", import.meta.url), "utf8"));
const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
test("the post-promotion record preserves preparation chronology and binds all 39 remote read-backs", () => assert.equal(validateVlce2RemotePromotionEvidence(record, plan), record));
test("remote evidence fails closed for a missing sidecar, altered payload version, or absent compliance retention", () => {
  const missingSidecar = structuredClone(record); missingSidecar.entries[0].sidecar.versionId = "";
  assert.throws(() => validateVlce2RemotePromotionEvidence(missingSidecar, plan), /32/);
  const changedPayload = structuredClone(record); changedPayload.entries[1].payload.versionId = "x".repeat(32);
  assert.throws(() => validateVlce2RemotePromotionEvidence(changedPayload, plan), /payload/);
  const unlocked = structuredClone(record); unlocked.entries[2].retention.mode = "GOVERNANCE";
  assert.throws(() => validateVlce2RemotePromotionEvidence(unlocked, plan), /COMPLIANCE/);
});
