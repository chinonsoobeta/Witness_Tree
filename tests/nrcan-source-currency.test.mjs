// Each case below breaks exactly one rule the currency gate claims to hold.
// The failure this gate exists to catch is an absence: NRCan publishes a year,
// nothing in this repository changes, and the site goes on presenting a stale
// range as the record. So the cases that matter most are the ones where the
// record still looks perfectly well formed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FRESHNESS_DAYS,
  PROBE_PATH,
  RECORD_PATH,
  YEARS_PATH,
  validateSourceCurrency,
} from "../scripts/check-nrcan-source-currency.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const record = () => JSON.parse(read(RECORD_PATH));
const probeText = () => read(PROBE_PATH);
const yearsText = () => read(YEARS_PATH);
const asOfRecord = (subject) => Date.parse(subject.observedAt) + 1000;
const check = (subject, options = {}) =>
  validateSourceCurrency(
    subject,
    options.probeText ?? probeText(),
    options.yearsText ?? yearsText(),
    options.now ?? asOfRecord(subject),
  );

test("the checked-in currency record passes its own gate", () => {
  assert.deepEqual(check(record()), []);
});

test("a later published year with no owner decision is refused", () => {
  const drifted = record();
  drifted.products[0].latestPublishedYear = drifted.products[0].ingestedThroughYear + 1;
  drifted.products[0].behindByYears = 1;
  drifted.laterYearPublished = true;
  const problems = check(drifted);
  assert.ok(
    problems.some((problem) => problem.includes("the publisher has moved and this project has not")),
    problems.join("\n"),
  );
});

test("an owner decision that names the exact gap clears it", () => {
  const drifted = record();
  const product = drifted.products[0];
  product.latestPublishedYear = product.ingestedThroughYear + 1;
  product.behindByYears = 1;
  drifted.laterYearPublished = true;
  drifted.acknowledgedGap = {
    decidedOn: "2026-09-01",
    decidedBy: "owner",
    gaps: [`${product.id} published through ${product.latestPublishedYear}, ingested through ${product.ingestedThroughYear}`],
  };
  assert.deepEqual(check(drifted), []);
});

test("an owner decision goes stale when the gap widens", () => {
  const drifted = record();
  const product = drifted.products[0];
  product.latestPublishedYear = product.ingestedThroughYear + 2;
  product.behindByYears = 2;
  drifted.laterYearPublished = true;
  drifted.acknowledgedGap = {
    decidedOn: "2026-09-01",
    decidedBy: "owner",
    gaps: [`${product.id} published through ${product.ingestedThroughYear + 1}, ingested through ${product.ingestedThroughYear}`],
  };
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.startsWith("acknowledgedGap does not cover")), problems.join("\n"));
  assert.ok(problems.some((problem) => problem.startsWith("acknowledgedGap names a gap that no longer exists")), problems.join("\n"));
});

test("a standing waiver with no gap behind it is refused", () => {
  const drifted = record();
  drifted.acknowledgedGap = { decidedOn: "2026-09-01", decidedBy: "owner", gaps: [] };
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("there is no gap")), problems.join("\n"));
});

test("a publisher reissue of an already-ingested year is refused", () => {
  const drifted = record();
  drifted.products[0].ingestedArchive.publisherRevisedSinceIngest = true;
  drifted.publisherRevisedAnIngestedYear = true;
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("reissued by the publisher")), problems.join("\n"));
});

test("a record whose positive control failed is not treated as evidence", () => {
  const drifted = record();
  drifted.products[0].positiveControl = { year: 2022, status: 302, contentLength: null };
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("positive control did not pass")), problems.join("\n"));
});

test("a host that answers 200 for an impossible year is refused", () => {
  const drifted = record();
  drifted.products[0].negativeControl = { year: 1900, status: 200, location: null };
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("negative control did not pass")), problems.join("\n"));
});

test("a look older than the freshness window is refused", () => {
  const subject = record();
  const now = Date.parse(subject.observedAt) + (FRESHNESS_DAYS + 1) * 86_400_000;
  const problems = check(subject, { now });
  assert.ok(problems.some((problem) => problem.includes("past the")), problems.join("\n"));
});

test("a selectable year the archives cannot answer is refused", () => {
  const problems = check(record(), {
    yearsText: yearsText().replace(/export const EXPLORE_YEAR_MAX = \d+;/, "export const EXPLORE_YEAR_MAX = 2026;"),
  });
  assert.ok(problems.some((problem) => problem.includes("fabricated year")), problems.join("\n"));
});

test("editing the record's ingested year instead of re-probing is refused", () => {
  const drifted = record();
  drifted.products[0].ingestedThroughYear = drifted.products[0].ingestedThroughYear + 1;
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("re-probe rather than edit the record")), problems.join("\n"));
});

test("a record that claims the data is current is refused", () => {
  const drifted = record();
  drifted.claims.dataIsCurrent = true;
  const problems = check(drifted);
  assert.ok(problems.some((problem) => problem.includes("claims.dataIsCurrent")), problems.join("\n"));
});

test("a future observation timestamp is refused", () => {
  const subject = record();
  const problems = check(subject, { now: Date.parse(subject.observedAt) - 86_400_000 });
  assert.ok(problems.some((problem) => problem.includes("in the future")), problems.join("\n"));
});
