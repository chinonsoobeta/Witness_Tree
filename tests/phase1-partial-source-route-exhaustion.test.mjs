import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1PartialSourceRouteExhaustion } from "../scripts/check-phase1-partial-source-route-exhaustion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const record = read("../data/phase1-partial-source-route-exhaustion.json");

test("official routes for both partial rows are exhausted without acquisition or credit", () => {
  assert.equal(validatePhase1PartialSourceRouteExhaustion(record), record);
});

test("a public URL cannot be promoted to lawful intended-scope evidence", () => {
  const changed = structuredClone(record);
  changed.routes.find(({ id }) => id === "elections-quebec-current-2017-atlas-shapefile").rights.lawfulForIntendedScope = true;
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(changed));
});

test("agreement acceptance, download, checksum and reply claims fail closed", () => {
  const accepted = structuredClone(record);
  accepted.routes.find(({ id }) => id === "cwfis-nbac-dated-shapefile-release").rights.agreementRequired = false;
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(accepted));

  const downloaded = structuredClone(record);
  downloaded.routes.find(({ id }) => id === "elections-alberta-current-ed-shapefile").downloaded = true;
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(downloaded));

  const checksum = structuredClone(record);
  checksum.routes.find(({ id }) => id === "elections-quebec-current-2017-atlas-shapefile").sha256 = "a".repeat(64);
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(checksum));

  const reply = structuredClone(record);
  reply.mailbox.partialRowsWithSubstantiveReply = 1;
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(reply));
});

test("future Québec edition cannot replace the current 2017 component", () => {
  const changed = structuredClone(record);
  changed.routes.find(({ id }) => id === "elections-quebec-2026-future-edition").currentForThisRow = true;
  assert.throws(() => validatePhase1PartialSourceRouteExhaustion(changed));
});
