import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateImmutableRestoreDrill } from "../scripts/check-immutable-restore-drill.mjs";

const drill = JSON.parse(readFileSync(new URL("../data/immutable-restore-drill.json", import.meta.url), "utf8"));
const promotions = JSON.parse(readFileSync(new URL("../data/immutable-promotions.json", import.meta.url), "utf8"));
const staging = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));

test("the restore drill binds every promoted payload to its exact immutable version and staged SHA-256", () => {
  assert.equal(validateImmutableRestoreDrill(drill, promotions, staging), drill);
});

test("the restore drill fails closed on a mutable key, a wrong SHA-256, or retained temporary copy", () => {
  const mutable = structuredClone(drill);
  mutable.entries[0].versionId = "wrong-version";
  assert.throws(() => validateImmutableRestoreDrill(mutable, promotions, staging), /VersionId/);
  const corrupt = structuredClone(drill);
  corrupt.entries[1].downloadedSha256 = "0".repeat(64);
  assert.throws(() => validateImmutableRestoreDrill(corrupt, promotions, staging), /downloadedSha256/);
  const retained = structuredClone(drill);
  retained.entries[2].temporaryCopyRemoved = false;
  assert.throws(() => validateImmutableRestoreDrill(retained, promotions, staging), /temporaryCopyRemoved/);
});
