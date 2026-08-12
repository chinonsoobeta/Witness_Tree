import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateExampleSourceLedger, validateExampleSourceLedgerEntry }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/data/source-ledger.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../data/source-ledger.json", import.meta.url), "utf8"),
) as Parameters<typeof validateExampleSourceLedger>[0];

test("all source-ledger examples are valid and explicitly illustrative", () => {
  const ledger = validateExampleSourceLedger(fixture);

  assert.equal(ledger.status, "example");
  assert.equal(ledger.entries.length, 3);
  assert.deepEqual(ledger.entries.map((entry) => entry.evidenceClass), [
    "official-record",
    "satellite-observation",
    "derived-estimate",
  ]);
});

test("missing licence, bilingual explanation, checksum, or HTTPS is rejected", () => {
  const entry = fixture.entries?.[0];
  if (!entry) throw new Error("The example fixture requires an entry.");

  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, licenceId: undefined }), /licence/i);
  assert.throws(() => validateExampleSourceLedgerEntry({
    ...entry,
    explanation: { ...entry.explanation, fr: "" },
  }), /English and French/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, rawChecksumSha256: "missing" }), /SHA-256/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, catalogueUrl: "http://example.local/catalogue" }), /HTTPS/);
  assert.throws(() => validateExampleSourceLedgerEntry({ ...entry, licenceUrl: "http://example.local/licence" }), /HTTPS/);
});

test("the ledger has no invented Unknown zero", () => {
  const ledger = validateExampleSourceLedger(fixture);
  assert.equal(JSON.stringify(ledger).includes('"Unknown"'), false);
  assert.equal(JSON.stringify(ledger).includes('"unknown"'), false);
  assert.equal(ledger.entries.some((entry) => entry.explanation.en === "0" || entry.explanation.fr === "0"), false);
});
