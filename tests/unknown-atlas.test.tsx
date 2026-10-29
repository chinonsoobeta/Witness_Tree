import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UnknownAtlasPage } from "../components/transparency/UnknownAtlasPage";
import { OfficialPublishedHarvestComparison } from "../components/transparency/OfficialPublishedHarvestComparison";
import { federalRidingComparison, MINIMUM_RANKED_FOREST_HECTARES, rankRidings } from "../lib/comparison";
import { CELL_HECTARES } from "../lib/domain/loss-vocabulary";
import { conditionRecoveryMeasurements } from "../lib/explore/condition-recovery";
import { PROVINCE_SPANS } from "../lib/explore/province-spans";
import { ridingIntervalMeasurements } from "../lib/explore/riding-intervals";
import { BLOCKED_SOURCE_RECORDS, blockedSourceRegister, resolve } from "../lib/sources/blocked";
import { unmappedLand, withheldFigures } from "../lib/unknown/atlas";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const comparisonRecord = JSON.parse(read("data/phase2-official-published-harvest-comparison.json"));
const gapReceipt = JSON.parse(read("data/coverage-gap-investigation-2026-09-08.json"));
const render = (locale: "en" | "fr") => renderToStaticMarkup(createElement(UnknownAtlasPage, { locale }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const section = (html: string, id: string) => {
  const match = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`));
  assert.ok(match, `section ${id} must render`);
  return match[0];
};
const rowFor = (id: string) => {
  const row = withheldFigures().find((entry) => entry.id === id);
  assert.ok(row, `withheld row ${id} must exist`);
  return row;
};
const sorted = (items: Iterable<string>) => [...items].sort();

test("Section A reads the four provinces' unmapped land from the receipt Methods uses", () => {
  const land = unmappedLand();
  assert.equal(land.totalHectares, gapReceipt.findings.gap.totalHectares);
  assert.deepEqual(land.provinces.map((row) => row.code), ["BC", "AB", "ON", "QC"]);
  for (const row of land.provinces) {
    const span = PROVINCE_SPANS.find((entry) => entry.code === row.code)!;
    assert.equal(row.unmappedHectares, gapReceipt.findings.gap.provinceHectares[row.code]);
    assert.ok(Math.abs(row.unmappedHectares - span.unmappedCells * CELL_HECTARES) < 0.01);
    assert.equal(row.unmappedSharePercent, (span.unmappedCells / span.cells) * 100);
    assert.ok(row.unmappedSharePercent > 0, "land with no data is never shown as zero");
  }
  for (const locale of ["en", "fr"] as const) {
    const html = section(render(locale), "no-data");
    // The bars carry no meaning of their own: every value is in text beside them and in the table.
    assert.match(html, /<ul class="explore-chart unknown-atlas-chart" aria-label="[^"]+">/);
    assert.equal((html.match(/explore-bar--unmapped/g) ?? []).length, 4);
    assert.equal((html.match(/<span class="explore-bar-track" aria-hidden="true">/g) ?? []).length, 4);
    assert.match(html, /<caption id="no-data-caption">/);
    assert.equal((html.match(/<th scope="row">/g) ?? []).length, 4);
    assert.match(html, locale === "en" ? /Missing data never means no loss\./ : /Des données manquantes ne signifient jamais une absence de perte\./);
    assert.match(html, locale === "en" ? /href="\/en\/methods#coverage-gap"/ : /href="\/fr\/methodes#coverage-gap"/);
    // British Columbia's sliver is shown as under a hundredth of a percent, never as 0%.
    assert.match(html, locale === "en" ? /&lt;0\.01%/ : /&lt;0,01\s%/);
  }
});

test("every figure the official comparison withholds appears in Section B", () => {
  const html = renderToStaticMarkup(createElement(OfficialPublishedHarvestComparison, { rows: comparisonRecord.rows, locale: "en" }));
  const shownWithheld = [...html.matchAll(/<tr><th scope="row">([A-Z]{2})<\/th><td class="nowrap">\d{4}–(\d{4})<\/td>[\s\S]*?<\/tr>/g)]
    .filter(([row]) => row.includes("<strong>Not published</strong>"))
    .map(([, province, year]) => `${province}:${year}`);
  assert.equal(shownWithheld.length, 14, "the view's own sentence says fourteen");
  const row = rowFor("licence-official-harvest-comparison");
  assert.equal(row.reasonClass, "licence");
  assert.deepEqual(sorted(row.items), sorted(shownWithheld));
  assert.equal(Object.values(row.byProvince!).reduce((sum, value) => sum + value, 0), shownWithheld.length);
});

test("every Compare riding left unranked appears in Section B under coverage or the floor", () => {
  const unranked = rankRidings(federalRidingComparison.comparisonRows).unranked;
  const coverage = rowFor("coverage-compare-federal");
  const floor = rowFor("floor-compare-federal");
  assert.equal(coverage.reasonClass, "coverage");
  assert.equal(floor.reasonClass, "floor");
  assert.deepEqual(sorted([...coverage.items, ...floor.items]), sorted(unranked.map((riding) => riding.id)));
  assert.deepEqual(
    sorted(coverage.items),
    sorted(unranked.filter((riding) => riding.measurementCoverage !== "complete").map((riding) => riding.id)),
  );
  for (const id of floor.items) {
    const riding = unranked.find((entry) => entry.id === id)!;
    assert.equal(riding.measurementCoverage, "complete");
    assert.ok(riding.forestedHectares < MINIMUM_RANKED_FOREST_HECTARES);
  }
  // Every riding whose share Compare does not print is in the list, and no ranked riding is.
  const withheldShare = federalRidingComparison.comparisonRows.filter((riding) => riding.detectedChangePercent === null).map((riding) => riding.id);
  assert.ok(withheldShare.every((id) => coverage.items.includes(id)));
  // Counted per province, and the counts add up to the list.
  assert.equal(Object.values(coverage.byProvince!).reduce((sum, value) => sum + value, 0), coverage.items.length);
  assert.equal(Object.values(floor.byProvince!).reduce((sum, value) => sum + value, 0), floor.items.length);

  const provincial = rowFor("coverage-explore-provincial");
  const explore = ridingIntervalMeasurements({ fromYear: 2021, toYear: 2022 }).filter((entry) => entry.overlay === "provincial-ridings");
  assert.deepEqual(sorted(provincial.items), sorted(explore.filter((entry) => entry.observedLossPercent === null).map((entry) => entry.boundaryId)));
  assert.ok(explore.filter((entry) => entry.coverage !== "complete").every((entry) => provincial.items.includes(entry.boundaryId)));
});

test("condition and recovery: the floor row lists what the view withholds, and only unmapped regions fall under the floor otherwise", () => {
  const rows = conditionRecoveryMeasurements();
  const four = rows.find((row) => row.kind === "four-provinces")!;
  const expected = [
    ...rows.filter((row) => row.mapped && (row.belowFloor || row.latestRecoveredPercent === null)).map((row) => row.id),
    ...four.decades.filter((row) => row.recoveredPercent === null).map((row) => row.decade),
    ...four.causes.filter((row) => row.recoveredPercent === null).map((row) => row.cause),
  ];
  assert.deepEqual(sorted(rowFor("floor-condition-recovery").items), sorted(expected));
  assert.deepEqual(sorted(rowFor("not-mapped-condition-recovery").items), sorted(rows.filter((row) => !row.mapped).map((row) => row.id)));
  // The wording for an empty floor row says the only rows under the floor are the unmapped ones.
  if (!expected.length) assert.ok(rows.filter((row) => row.belowFloor).every((row) => !row.mapped));
});

test("Section B renders one row per withheld class, with its count, reason, view words and link", () => {
  for (const locale of ["en", "fr"] as const) {
    const html = section(render(locale), "withheld");
    const rows = withheldFigures();
    assert.deepEqual(sorted(new Set(rows.map((row) => row.reasonClass))), sorted(["licence", "coverage", "floor", "too-recent", "not-mapped"]));
    for (const row of rows) {
      const tr = html.match(new RegExp(`<tr data-withheld="${row.id}" data-count="${row.items.length}">[\\s\\S]*?</tr>`))?.[0];
      assert.ok(tr, `${locale}: ${row.id} renders with its count`);
      assert.match(tr, new RegExp(`<th scope="row"><a href="${row.href[locale].replace(/[?]/g, "\\?").replace(/&/g, "&amp;")}">`));
      assert.match(tr, /<q>[^<]+<\/q>/, `${locale}: ${row.id} quotes the view's own words`);
      const count = new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA").format(row.items.length);
      if (row.reasonClass !== "too-recent" && row.items.length) assert.ok(text(tr).includes(count), `${locale}: ${row.id} states ${count}`);
    }
    assert.match(html, /<caption id="withheld-caption">/);
    assert.equal((html.match(/<th scope="col">/g) ?? []).length, 4);
    // Nothing withheld becomes a number: apart from the floor itself, no hectare or percentage figure is printed in this table.
    const floor = new RegExp(`${MINIMUM_RANKED_FOREST_HECTARES}\\s?ha`, "g");
    assert.doesNotMatch(text(html).replace(floor, ""), /\d\s?(?:ha|%)(?![\p{L}])/u);
  }
});

const RECORD_TEXT = JSON.stringify(BLOCKED_SOURCE_RECORDS);
const EMAILS = [...new Set(RECORD_TEXT.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])];
const PERSON_NAMES = [
  ...new Set([
    // "Display Name <address>"
    ...[...RECORD_TEXT.matchAll(/"([^"<>@]+?)\s*<[^>"]+@[^>"]+>"/g)].map(([, name]) => name.trim()),
    // first.last@ and first.middle.last@ addresses
    ...EMAILS.map((address) => address.split("@")[0]!)
      .filter((local) => /^[a-z]+(?:\.[a-z]+)+$/i.test(local))
      .map((local) => local.split(".").filter((part) => part.length > 1).join(" ")),
  ]),
].filter((name) => name.length > 3);

/** Any file or request number in a record line that speaks of such a request. */
const FOI_REFERENCES = [
  ...new Set(
    (RECORD_TEXT.match(/"[^"]*(?:FOI|freedom of information|access to information)[^"]*"/gi) ?? [])
      .flatMap((line) => line.match(/\b[A-Z]{2,}[- ]?\d{2,4}[-\d]+\b/g) ?? []),
  ),
];

test("Section C names no person and shows no address or request reference", () => {
  // The check is only meaningful if the records really do hold addresses and names.
  assert.ok(EMAILS.length >= 5, "the records hold addresses to leave out");
  assert.ok(PERSON_NAMES.length >= 3, "the records hold personal names to leave out");
  for (const locale of ["en", "fr"] as const) {
    const html = render(locale);
    const blocked = text(section(html, "blocked-sources")).toLowerCase();
    assert.doesNotMatch(blocked, /@/);
    for (const address of EMAILS) assert.ok(!blocked.includes(address.toLowerCase()), `${locale}: no address`);
    for (const name of PERSON_NAMES) assert.ok(!blocked.includes(name.toLowerCase()), `${locale}: no personal name`);
    // The owner has not decided to publish any freedom-of-information request.
    assert.doesNotMatch(text(html), /\bFOI\b|freedom of information|access to information|accès à l’information/i);
    for (const reference of FOI_REFERENCES) assert.ok(!text(html).includes(reference), `${locale}: no request reference`);
  }
});

test("Section C lists every still-blocked ledger source, each field read from its record", () => {
  const register = blockedSourceRegister();
  const ledger = BLOCKED_SOURCE_RECORDS.ledger.entries.filter((entry) => entry.evidenceState === "access-blocked").map((entry) => entry.id);
  const listed = register.sources.flatMap((source) => source.ledgerIds);
  assert.deepEqual(sorted([...listed, ...register.notListed.usable, ...register.notListed.withdrawn]), sorted(ledger));
  assert.deepEqual(sorted(register.notListed.withdrawn), sorted(BLOCKED_SOURCE_RECORDS.scopeDecision.withdrawnLedgerRows));
  for (const locale of ["en", "fr"] as const) {
    const html = section(render(locale), "blocked-sources");
    assert.match(html, /<caption id="blocked-caption">/);
    assert.equal((html.match(/<th scope="col">/g) ?? []).length, 5);
    for (const source of register.sources) {
      const tr = html.match(new RegExp(`<tr data-blocked-source="${source.id}">[\\s\\S]*?</tr>`))?.[0];
      assert.ok(tr, `${locale}: ${source.id} renders`);
      assert.equal((tr.match(/<td>/g) ?? []).length, 4);
      assert.match(tr, /\b20\d\d\b/, `${locale}: ${source.id} gives a date`);
    }
  }
});

test("the validator refuses a field a record lacks or no longer holds", () => {
  assert.equal(resolve({ record: "sopfeuBlock", path: "publisher", equals: "SOPFEU" }), "SOPFEU");
  assert.throws(() => resolve({ record: "sopfeuBlock", path: "current.missingField" }), /missing/);
  assert.throws(() => resolve({ record: "rights", path: "sources[sourceId=no-such-source].rightsStatus" }), /missing/);
  assert.throws(() => resolve({ record: "sopfeuBlock", path: "publisher", equals: "Someone else" }), /no longer reads/);
  assert.throws(() => resolve({ record: "rights", path: "noReplyYet", includes: "bc-vri" }), /no longer says/);
});

test("the page links Section D to the methods and keeps the record's wording", () => {
  for (const locale of ["en", "fr"] as const) {
    const html = section(render(locale), "settle");
    assert.match(html, locale === "en" ? /field plots, air photos or lidar/ : /placettes de terrain, des photos aériennes ou des données lidar/);
    assert.match(html, /href="#blocked-sources"/);
    assert.match(html, /href="https:\/\/doi\.org\/10\.1080\/07038992\.2018\.1437719"/);
  }
});

test("the Data page and the Methods gap section link to the page in both languages", () => {
  for (const file of ["components/transparency/DataPage.tsx", "components/transparency/MethodologyPage.tsx"]) {
    assert.match(read(file), /"\/en\/unknown"/);
    assert.match(read(file), /"\/fr\/inconnu"/);
  }
});
