import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, ROOT), "utf8"));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function pointer(value, path, label) {
  assert.equal(typeof path, "string", `${label} needs a JSON pointer.`);
  assert.ok(path === "" || path.startsWith("/"), `${label} has an invalid JSON pointer.`);
  if (path === "") return value;
  return path.slice(1).split("/").reduce((current, rawSegment) => {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(current !== null && typeof current === "object", `${label} is missing ${path}.`);
    assert.ok(Object.hasOwn(current, segment), `${label} is missing ${path}.`);
    return current[segment];
  }, value);
}

function selected(record, assertion) {
  if (!assertion.selector) return record;
  assert.ok(assertion.selector.where && typeof assertion.selector.where === "object", `${assertion.id} selector needs a where object.`);
  const candidates = pointer(record, assertion.selector.arrayPath, `${assertion.id} selector`);
  assert.ok(Array.isArray(candidates), `${assertion.id} selector must target an array.`);
  const matches = candidates.filter((candidate) => Object.entries(assertion.selector.where).every(([key, value]) => same(candidate[key], value)));
  assert.equal(matches.length, 1, `${assertion.id} selector must match exactly one record.`);
  return matches[0];
}

function extract(record, assertion) {
  const target = selected(record, assertion);
  if (assertion.valuePath !== undefined) return pointer(target, assertion.valuePath, assertion.id);
  assert.ok(assertion.fields && typeof assertion.fields === "object" && Object.keys(assertion.fields).length > 0, `${assertion.id} needs valuePath or fields.`);
  return Object.fromEntries(Object.entries(assertion.fields).map(([name, field]) => {
    if (field.pointer !== undefined) return [name, pointer(target, field.pointer, `${assertion.id}.${name}`)];
    assert.ok(field.arrayCount && typeof field.arrayCount === "object", `${assertion.id}.${name} needs pointer or arrayCount.`);
    const candidates = pointer(target, field.arrayCount.arrayPath, `${assertion.id}.${name}`);
    assert.ok(Array.isArray(candidates), `${assertion.id}.${name} must count an array.`);
    const where = field.arrayCount.where ?? {};
    const count = candidates.filter((candidate) => Object.entries(where).every(([path, value]) => same(pointer(candidate, path, `${assertion.id}.${name}`), value))).length;
    return [name, count];
  }));
}

function validDate(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z)?$/);
  if (!match) return false;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day)
    && parsed.getUTCHours() === Number(hour)
    && parsed.getUTCMinutes() === Number(minute)
    && parsed.getUTCSeconds() === Number(second);
}

function assertionPair(left, right) {
  return [left, right].sort().join("\u0000");
}

function validateSupersessions(fact, byId, records, values) {
  const coveredPairs = new Set();
  for (const relation of fact.supersessions ?? []) {
    assert.deepEqual(Object.keys(relation).sort(), ["newerAssertion", "olderAssertion"], `${fact.id} supersession has unsupported fields.`);
    const older = byId.get(relation.olderAssertion);
    const newer = byId.get(relation.newerAssertion);
    assert.ok(older && newer, `${fact.id} supersession names an unknown assertion.`);
    assert.notEqual(older.id, newer.id, `${fact.id} supersession must name two assertions.`);
    assert.notDeepEqual(values.get(older.id), values.get(newer.id), `${fact.id} supersession must cover a disagreement.`);
    assert.ok(older.datePath && newer.datePath, `${fact.id} supersession requires both records to carry their own date qualifier.`);
    const olderDate = pointer(records.get(older.record), older.datePath, `${fact.id}.${older.id} date qualifier`);
    const newerDate = pointer(records.get(newer.record), newer.datePath, `${fact.id}.${newer.id} date qualifier`);
    assert.ok(validDate(olderDate) && validDate(newerDate), `${fact.id} supersession dates must be real ISO dates.`);
    assert.ok(Date.parse(olderDate) < Date.parse(newerDate), `${fact.id} supersession must run from an older record to a later record.`);
    const pair = assertionPair(older.id, newer.id);
    assert.ok(!coveredPairs.has(pair), `${fact.id} has a duplicate supersession relationship.`);
    coveredPairs.add(pair);
  }
  return coveredPairs;
}

function ledgerHasEntry(ledger, entry) {
  return ledger.split("\n").some((line) => line.startsWith("## ") && new RegExp(`\\b${entry}\\b`).test(line));
}

export function validateCrossRecordFacts(register, readRecord = read) {
  assert.equal(register.schemaVersion, "witness-tree/cross-record-fact-register/1");
  assert.ok(validDate(register.asOf), "Register asOf must be a real ISO date.");
  assert.deepEqual(register.ledger, { path: "docs/RECORD_CONTRADICTION_LEDGER.md" });
  const ledger = readFileSync(new URL(register.ledger.path, ROOT), "utf8");
  assert.ok(Array.isArray(register.facts) && register.facts.length > 0, "Register needs facts.");
  assert.ok(Array.isArray(register.declaredCurrentExceptions), "Register must declare its current ledger exceptions.");
  assert.equal(new Set(register.declaredCurrentExceptions).size, register.declaredCurrentExceptions.length, "Register has duplicate current exceptions.");
  for (const entry of register.declaredCurrentExceptions) {
    assert.match(entry, /^C-[1-7]$/, "Register declares an invalid ledger exception.");
    assert.ok(ledgerHasEntry(ledger, entry), `Register declares missing ledger entry ${entry}.`);
  }

  const factIds = new Set();
  const attachedEntries = new Set();
  for (const fact of register.facts) {
    assert.equal(typeof fact.id, "string", "Each fact needs an id.");
    assert.ok(!factIds.has(fact.id), `Duplicate fact id ${fact.id}.`);
    factIds.add(fact.id);
    assert.match(fact.contradiction, /^C-[1-7]$/, `${fact.id} needs its ledger contradiction id.`);
    assert.ok(ledgerHasEntry(ledger, fact.contradiction), `${fact.id} cites a missing ledger contradiction.`);
    assert.ok(Array.isArray(fact.assertions) && fact.assertions.length >= 2, `${fact.id} needs at least two assertions.`);

    const assertionIds = new Set();
    const records = new Map();
    const values = new Map();
    for (const assertion of fact.assertions) {
      assert.equal(typeof assertion.id, "string", `${fact.id} has an assertion without an id.`);
      assert.ok(!assertionIds.has(assertion.id), `${fact.id} has duplicate assertion ${assertion.id}.`);
      assertionIds.add(assertion.id);
      assert.match(assertion.record, /^data\/[A-Za-z0-9_./-]+\.json$/, `${assertion.id} record must be a committed JSON record.`);
      assert.ok(typeof assertion.factValue === "string" && assertion.factValue.length > 0, `${assertion.id} needs a canonical factValue.`);
      const record = records.get(assertion.record) ?? readRecord(assertion.record);
      records.set(assertion.record, record);
      assert.deepEqual(extract(record, assertion), assertion.expected, `${assertion.id} no longer says what the register declares.`);
      values.set(assertion.id, assertion.factValue);
    }

    const distinct = new Set(values.values());
    const exceptions = fact.exceptions ?? [];
    assert.ok(Array.isArray(exceptions), `${fact.id} exceptions must be an array.`);
    if (distinct.size < 2) {
      assert.equal(exceptions.length, 0, `${fact.id} has a stale contradiction exception.`);
      assert.equal((fact.supersessions ?? []).length, 0, `${fact.id} has a stale supersession relationship.`);
      continue;
    }

    const byId = new Map(fact.assertions.map((assertion) => [assertion.id, assertion]));
    const coveredPairs = validateSupersessions(fact, byId, records, values);
    if (exceptions.length > 0) {
      assert.equal(exceptions.length, 1, `${fact.id} must use one exact current exception.`);
      assert.deepEqual(exceptions[0], { ledgerEntry: fact.contradiction }, `${fact.id} exception must cite its own ledger contradiction.`);
      attachedEntries.add(fact.contradiction);
      continue;
    }

    for (let leftIndex = 0; leftIndex < fact.assertions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < fact.assertions.length; rightIndex += 1) {
        const left = fact.assertions[leftIndex];
        const right = fact.assertions[rightIndex];
        if (values.get(left.id) === values.get(right.id)) continue;
        assert.ok(coveredPairs.has(assertionPair(left.id, right.id)), `${fact.id} disagreement ${left.id}/${right.id} lacks a dated supersession or declared current exception.`);
      }
    }
  }

  assert.deepEqual([...attachedEntries].sort(), [...register.declaredCurrentExceptions].sort(), "Every declared current contradiction must be attached to a disagreeing fact.");
  return register;
}

export function checkCrossRecordFacts() {
  return validateCrossRecordFacts(read("data/cross-record-facts.json"));
}

if (process.argv[1]?.endsWith("check-cross-record-facts.mjs")) {
  const register = checkCrossRecordFacts();
  console.log(`Cross-record fact register passed: ${register.facts.length} facts; ${register.declaredCurrentExceptions.join(", ")} are declared current exceptions.`);
}
