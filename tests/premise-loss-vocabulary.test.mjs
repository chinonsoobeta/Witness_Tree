// Each case below breaks exactly one rule the vocabulary gate claims to hold.
// A checker that cannot fail is not a gate, and the failure that matters here
// is silent: wording drifts one component at a time, and a percentage on the
// sum produces a number that looks reasonable while being untrue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MODULE_PATH,
  RECORD_PATH,
  sourceFiles,
  validateLossVocabulary,
} from "../scripts/check-premise-loss-vocabulary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const record = () => JSON.parse(read(RECORD_PATH));
const moduleText = () => read(MODULE_PATH);
const files = () => sourceFiles();

test("the checked-in vocabulary passes its own gate", () => {
  const result = validateLossVocabulary(record(), moduleText(), files(), read);
  assert.ok(result.files > 0, "the sweep must actually read source files");
  assert.ok(result.retired > 0, "the retired register must not be empty");
});

test("a record term that drifts from the module is refused", () => {
  const drifted = record();
  drifted.terms.union.en = "Total forest change";
  assert.throws(
    () => validateLossVocabulary(drifted, moduleText(), files(), read),
    /union English term differs/,
  );
});

test("a percentage on the sum is refused", () => {
  const wrong = record();
  wrong.terms.sum.percentAllowed = true;
  assert.throws(
    () => validateLossVocabulary(wrong, moduleText(), files(), read),
    /the sum can double-count a cell/,
  );
});

test("dropping the module's sum-percentage prohibition is refused", () => {
  const withoutGuard = moduleText().replace(
    "export const SUM_PERCENT_IS_FORBIDDEN = true as const;",
    "export const SUM_PERCENT_IS_FORBIDDEN = false as const;",
  );
  assert.throws(
    () => validateLossVocabulary(record(), withoutGuard, files(), read),
    /sum-percentage prohibition/,
  );
});

test("retired wording reappearing in a source file is refused", () => {
  const target = files()[0];
  const readWithRelapse = (relativePath) =>
    relativePath === target ? 'const legend = "Observed loss (ha)";' : read(relativePath);
  assert.throws(
    () => validateLossVocabulary(record(), moduleText(), files(), readWithRelapse),
    /retired wording is still in user-facing source/,
  );
});

test("quietly shrinking the retired register is refused", () => {
  const shrunk = record();
  shrunk.retiredWording = shrunk.retiredWording.slice(1);
  assert.throws(
    () => validateLossVocabulary(shrunk, moduleText(), files(), read),
    /retired-wording register differs/,
  );
});

test("including net change without a gain product is refused", () => {
  const netted = record();
  netted.terms.netChange.included = true;
  assert.throws(
    () => validateLossVocabulary(netted, moduleText(), files(), read),
    /net change stays excluded/,
  );
});

test("a vocabulary decision that names no owner and no date is refused", () => {
  const undated = record();
  undated.decidedOn = "soon";
  assert.throws(() => validateLossVocabulary(undated, moduleText(), files(), read), /decision date/);

  const unowned = record();
  unowned.decidedBy = "engineering";
  assert.throws(() => validateLossVocabulary(unowned, moduleText(), files(), read), /name the owner/);
});
