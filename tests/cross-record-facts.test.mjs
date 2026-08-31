import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { validateCrossRecordFacts } from "../scripts/check-cross-record-facts.mjs";

const ROOT = new URL("../", import.meta.url);
const load = async () => JSON.parse(await readFile(new URL("data/cross-record-facts.json", ROOT), "utf8"));
const readRecord = (path) => JSON.parse(readFileSync(new URL(path, ROOT), "utf8"));

function resolve(register, contradiction, factId) {
  const fact = register.facts.find(({ id }) => id === factId);
  fact.exceptions = [];
  register.declaredCurrentExceptions = register.declaredCurrentExceptions.filter((entry) => entry !== contradiction);
  return fact;
}

function containsKey(value, keys) {
  if (value === null || typeof value !== "object") return false;
  if (Object.keys(value).some((key) => keys.has(key))) return true;
  return Object.values(value).some((child) => containsKey(child, keys));
}

test("the register binds every currently declared cross-record contradiction", async () => {
  const register = await load();
  assert.doesNotThrow(() => validateCrossRecordFacts(register));
  assert.deepEqual(register.declaredCurrentExceptions, ["C-1", "C-2", "C-3", "C-5", "C-6"]);
});

test("the numeric facts cover every committed JSON record that asserts either baseline", async () => {
  const register = await load();
  const files = (await readdir(new URL("data/", ROOT), { recursive: true }))
    .filter((path) => path.endsWith(".json") && path !== "cross-record-facts.json")
    .map((path) => `data/${path}`);
  const rawKeys = new Set(["rawEvidenceNumerator", "rawEvidenceNumeratorBefore", "rawEvidenceNumeratorAfter", "baselineRawEvidenceNumerator"]);
  const archiveKeys = new Set(["immutableArchiveCompleteRows", "immutableRows"]);
  const rawRecords = new Set();
  const archiveRecords = new Set(["data/phase1-production-source-ledger.json"]);
  for (const file of files) {
    const record = readRecord(file);
    if (containsKey(record, rawKeys)) rawRecords.add(file);
    if (containsKey(record, archiveKeys)) archiveRecords.add(file);
  }
  const assertionsFor = (id) => new Set(register.facts.find((fact) => fact.id === id).assertions.map(({ record }) => record));
  assert.deepEqual([...assertionsFor("phase1-raw-credit-numerator")].sort(), [...rawRecords].sort());
  assert.deepEqual([...assertionsFor("phase1-immutable-archive-row-count")].sort(), [...archiveRecords].sort());
});

test("C-4 binds the claimed specification, run, and exact output through a dated supersession", async () => {
  const register = await load();
  const facts = register.facts.filter(({ contradiction }) => contradiction === "C-4");
  assert.deepEqual(
    facts.map(({ id }) => id),
    ["ntems-canopy-cover-production-specification", "ntems-canopy-cover-transformation-run", "ntems-canopy-cover-derived-output"],
  );
  for (const fact of facts) {
    assert.deepEqual(fact.exceptions ?? [], []);
    assert.deepEqual(fact.supersessions, [{ olderAssertion: "historical-gate", newerAssertion: "successor" }]);
    assert.equal(fact.assertions.find(({ id }) => id === "successor").record, "data/phase1-nrcan-cover-processing-gate-supersession-2026-08-31.json");
  }
});

test("C-5 includes the direct admission and append-only evolution records", async () => {
  const register = await load();
  const records = new Set(register.facts.filter(({ contradiction }) => contradiction === "C-5").flatMap(({ assertions }) => assertions.map(({ record }) => record)));
  assert.ok(records.has("data/phase1-federal-electoral-production-admission.json"));
  assert.ok(records.has("data/phase1-ledger-post-scope-approval-evolution.json"));
});

test("C-7 numeric disagreements are completely covered by dated baseline supersessions", async () => {
  const register = await load();
  for (const fact of register.facts.filter(({ contradiction }) => contradiction === "C-7")) {
    assert.deepEqual(fact.exceptions ?? [], []);
    for (const assertion of fact.assertions) assert.ok(assertion.datePath, `${fact.id}/${assertion.id} needs its own date qualifier`);
  }
});

test("C-7 common-later supersession fails closed for a missing or non-later edge", async () => {
  const register = await load();
  const raw = register.facts.find(({ id }) => id === "phase1-raw-credit-numerator");
  raw.supersessions = raw.supersessions.filter(({ olderAssertion }) => olderAssertion !== "owner-queue");
  assert.throws(() => validateCrossRecordFacts(register), /lacks a dated supersession/);

  const reversed = await load();
  const archive = reversed.facts.find(({ id }) => id === "phase1-immutable-archive-row-count");
  archive.supersessions[0] = { olderAssertion: "ledger", newerAssertion: "owner-queue" };
  assert.throws(() => validateCrossRecordFacts(reversed), /must run from an older record to a later record/);

  const sameDate = await load();
  const sameDateRaw = sameDate.facts.find(({ id }) => id === "phase1-raw-credit-numerator");
  sameDateRaw.supersessions.find(({ olderAssertion }) => olderAssertion === "owner-queue").newerAssertion = "remaining-actions";
  assert.throws(() => validateCrossRecordFacts(sameDate), /must run from an older record to a later record/);
});

test("a disagreement without its ledger exception or supersession fails closed", async () => {
  const register = await load();
  resolve(register, "C-2", "ntems-canopy-cover-transformation-status");
  assert.throws(() => validateCrossRecordFacts(register), /lacks a dated supersession or declared current exception/);
});

test("an exception must cite the fact's exact ledger contradiction", async () => {
  const register = await load();
  register.facts.find(({ id }) => id === "ntems-canopy-cover-transformation-status").exceptions[0].ledgerEntry = "C-5";
  assert.throws(() => validateCrossRecordFacts(register), /exception must cite its own ledger contradiction/);
});

test("a source record that disappears fails closed", async () => {
  const register = await load();
  register.facts[0].assertions[0].record = "data/does-not-exist.json";
  assert.throws(() => validateCrossRecordFacts(register), /ENOENT/);
});

test("a selector that no longer identifies one row fails closed", async () => {
  const register = await load();
  register.facts[0].assertions[0].selector.where.id = "missing-row";
  assert.throws(() => validateCrossRecordFacts(register), /selector must match exactly one record/);
});

test("an exception becomes stale when its assertions agree", async () => {
  const register = await load();
  const fact = register.facts.find(({ id }) => id === "ntems-canopy-cover-transformation-status");
  fact.assertions.find(({ id }) => id === "readback").factValue = "not-transformed";
  assert.throws(() => validateCrossRecordFacts(register), /stale contradiction exception/);
});

test("a supersession requires a date qualifier in both records", async () => {
  const register = await load();
  const fact = resolve(register, "C-2", "ntems-canopy-cover-transformation-status");
  fact.supersessions = [{ olderAssertion: "queue", newerAssertion: "readback" }];
  assert.throws(() => validateCrossRecordFacts(register), /requires both records to carry their own date qualifier/);
});

test("a malformed calendar date cannot qualify a disagreement", async () => {
  const register = await load();
  const fact = resolve(register, "C-2", "ntems-canopy-cover-transformation-status");
  fact.assertions.find(({ id }) => id === "queue").datePath = "/asOf";
  fact.assertions.find(({ id }) => id === "readback").datePath = "/authorization/createdAt";
  fact.supersessions = [{ olderAssertion: "queue", newerAssertion: "readback" }];
  const malformedDateReader = (path) => {
    const record = readRecord(path);
    if (path === "data/phase1-owner-decision-queue.json") record.asOf = "2026-02-30";
    return record;
  };
  assert.throws(() => validateCrossRecordFacts(register, malformedDateReader), /dates must be real ISO dates/);
});

test("a supersession must cover every disagreeing assertion pair", async () => {
  const register = await load();
  const fact = resolve(register, "C-5", "federal-electoral-evidence-state");
  fact.assertions.find(({ id }) => id === "queue-ridings").datePath = "/asOf";
  fact.assertions.find(({ id }) => id === "ledger-ridings").datePath = "/asOf";
  fact.supersessions = [{ olderAssertion: "queue-ridings", newerAssertion: "ledger-ridings" }];
  assert.throws(() => validateCrossRecordFacts(register), /disagreement .* lacks a dated supersession/);
});

test("a complete dated supersession permits an honest historical snapshot", async () => {
  const register = await load();
  const fact = resolve(register, "C-2", "ntems-canopy-cover-transformation-status");
  fact.assertions.find(({ id }) => id === "queue").datePath = "/asOf";
  fact.assertions.find(({ id }) => id === "readback").datePath = "/authorization/createdAt";
  fact.supersessions = [{ olderAssertion: "queue", newerAssertion: "readback" }];
  assert.doesNotThrow(() => validateCrossRecordFacts(register));
});
