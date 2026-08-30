import assert from "node:assert/strict";
import test from "node:test";
import { requireExactBilingualJoin, resolveBoundaryNames } from "../scripts/boundary-overlay-names.mjs";

test("bilingual boundary names require the exact same identifier set", () => {
  assert.doesNotThrow(() => requireExactBilingualJoin(["a", "b"], new Map([["b", "B"], ["a", "A"]]), "fixture"));
  assert.throws(
    () => requireExactBilingualJoin(["a", "b"], new Map([["x", "X"], ["y", "Y"]]), "fixture"),
    /missing a, b; extra x, y/,
  );
});

test("a configured French field cannot silently fall back to English", () => {
  const source = { id: "fixture", en_field: "en", fr_field: "fr" };
  assert.throws(() => resolveBoundaryNames(source, { en: "Name", fr: "" }, null, "1"), /no French name/);
  assert.deepEqual(
    resolveBoundaryNames({ ...source, fr_field: null }, { en: "Name" }, null, "1"),
    { en: "Name", fr: "Name" },
  );
});
