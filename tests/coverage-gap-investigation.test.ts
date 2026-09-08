import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { MethodologyPage } from "../components/transparency/MethodologyPage.tsx";
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
import { EXPLORE_PRODUCTION_LAYER } from "../lib/explore/map-style.ts";

const receipt = JSON.parse(readFileSync(new URL("../data/coverage-gap-investigation-2026-09-08.json", import.meta.url), "utf8"));
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const render = (locale: "en" | "fr") => renderToStaticMarkup(createElement(MethodologyPage, { locale }));

/*
 * The investigation explains existing coverage values. It admits no source
 * and supplies no publishable gap-loss estimate. Bind the rendered numbers,
 * including the baseline definition, so prose cannot silently change a claim.
 */
test("every figure in both new methods sections matches the research receipt", () => {
  const { gap, samplingAttempt } = receipt.findings;
  const expected = [gap.totalHectares, ...Object.values(gap.provinceHectares),
    samplingAttempt.baselineYear, samplingAttempt.forestDefinition.minimumCrownClosurePercent,
    samplingAttempt.forestDefinition.matureTreeHeightMetres, samplingAttempt.baselineYear];
  for (const locale of ["en", "fr"] as const) {
    const html = render(locale);
    const sections = html.match(/<section\b[^>]*id="coverage-gap"[^>]*>[\s\S]*?<\/section><section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
    assert.ok(sections, `${locale}: the linked gap section and its following section must render`);
    const paragraphs = [...sections.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => match[1]).join(" ");
    const numbers = [...paragraphs.matchAll(/(?<![\p{L}\d])\d+(?:[ ,.\u00a0\u202f]\d+)*/gu)].map(([number]) =>
      Number(locale === "en" ? number.replaceAll(",", "") : number.replace(/[ \u00a0\u202f]/g, "").replace(",", ".")),
    );
    assert.deepEqual(numbers, expected, `${locale}: missing, additional or changed figure`);
  }
  const byId = { "24": "QC", "35": "ON", "48": "AB", "59": "BC" } as const;
  for (const row of EXPLORE_PRODUCTION_LAYER.rows) {
    assert.equal(gap.provinceHectares[byId[row.id]], row.unknownRequiredInputHectares);
  }
  assert.equal(Math.round(Object.values(gap.provinceHectares).reduce<number>((sum, value) => sum + Number(value), 0) * 100), Math.round(gap.totalHectares * 100));
});

test("the investigation remains research with no admission, release or gate change", () => {
  assert.equal(receipt.status, "research-non-admitted-nonproduction");
  assert.equal(receipt.execution.phase2, "2/4");
  assert.deepEqual(receipt.claims, { admitted: false, released: false, productionEligible: false, externalAction: false });
  assert.deepEqual(receipt.execution.sourceRuns, ["coverage-post-assessment-20260908T003028Z", "coverage-metric-production-20260908T030436Z"]);
  assert.equal(receipt.findings.samplingAttempt.envelope.notForPublication, true);
  assert.equal(receipt.findings.baselineYearTest.envelopeWidths.notForPublication, true);
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function unpublishedValues(value: unknown, held = false): number[] {
  if (typeof value === "number") return held ? [value] : [];
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return Object.values(record).flatMap((child) => unpublishedValues(child, held || record.notForPublication === true));
}

test("notForPublication values occur nowhere under app or components", () => {
  const values = unpublishedValues(receipt);
  assert.ok(values.length > 0, "the publication guard must not run against an empty set");
  // Check raw and localized spellings, including grouping spaces, comments
  // and hidden UI. These values belong only in the research receipt.
  const variants = (value: number) => new Set([
    String(value), value.toExponential(),
    ...["en-CA", "fr-CA"].flatMap((locale) => [true, false].map((useGrouping) =>
      new Intl.NumberFormat(locale, { useGrouping, maximumFractionDigits: 10 }).format(value))),
  ]);
  for (const directory of ["app", "components"]) {
    for (const file of sourceFiles(new URL(`../${directory}`, import.meta.url).pathname)) {
      const source = readFileSync(file, "utf8").replace(/\\u(?:00a0|202f)/gi, " ").replace(/[\u00a0\u202f]/g, " ");
      for (const value of values) {
        for (const variant of variants(value)) {
          assert.ok(!source.includes(variant.replace(/[\u00a0\u202f]/g, " ")), `${file}: contains held value ${value}`);
        }
      }
    }
  }
});

test("BC alone has a qualifier and every province presentation carries it", () => {
  assert.deepEqual(EXPLORE_PRODUCTION_LAYER.rows.filter((row) => "unmappedCharacter" in row).map((row) => row.id), ["59"]);
  for (const file of ["app/en/page.tsx", "app/fr/page.tsx", "components/explore/ExploreView.tsx", "components/explore/ExploreMapClient.tsx"]) {
    assert.match(read(file), /row\.unmappedCharacter\.(?:en|fr)|row\.unmappedCharacter\[locale\]/, file);
  }
  assert.match(read("components/explore/ExploreView.tsx"), /<p key=\{item\.id\}>[^\n]*item\.unmappedCharacter\[locale\]/, "the chart also needs a visible qualifier");
  assert.match(read("app/en/page.tsx"), /href="\/en\/methods#coverage-gap"/);
  assert.match(read("app/fr/page.tsx"), /href="\/fr\/methodes#coverage-gap"/);
});
