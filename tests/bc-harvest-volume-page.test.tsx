import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import indicator from "../data/bc-timber-harvest-aac-indicator.json";
import { BcHarvestVolumeIndicator } from "../components/transparency/BcHarvestVolumeIndicator";
import { BcHarvestVolumeChart, seriesRuns } from "../components/transparency/BcHarvestVolumeChart";
import { buildRecord, sheetRows } from "../scripts/build-bc-timber-harvest-indicator.mjs";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("both languages carry the instrument boundary beside the table, not in a footnote", () => {
  const english = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale="en" />);
  const french = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale="fr" />);
  assert.match(english, /policy number, not a measurement/);
  assert.match(english, /not standing timber/);
  assert.match(english, /No cubic-metres-per-hectare figure/);
  assert.match(english, /July 2023/);
  assert.match(english, /never zero/);
  assert.match(english, /Open Government Licence – British Columbia/);
  assert.match(french, /valeur de politique publique, et non une mesure/);
  assert.match(french, /pas du bois sur pied/);
  assert.match(french, /Aucun chiffre en mètres cubes par hectare/);
  assert.match(french, /juillet 2023/);
  assert.match(french, /jamais zéro/);
  assert.match(french, /Licence du gouvernement ouvert – Colombie-Britannique/);
  for (const html of [english, french]) {
    assert.equal((html.match(/scope="col"/g) ?? []).length, 8);
    assert.doesNotMatch(html, /\d[\d.,\s]*(?:m³|m3)\s*\/\s*ha\b|\d[\d.,\s]*(?:cubic metres|mètres cubes) (?:per|par) hectare/i);
    assert.doesNotMatch(html, /stumpage rate|taux des droits de coupe/i);
  }
});

test("unknown allowable cuts render as unknown and the share is computed only from published values", () => {
  const english = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale="en" />);
  const early = indicator.rows.filter((row) => row.allowableAnnualCutMillionCubicMetres === null);
  assert.equal(early.length, indicator.summary.allowableCutUnknownRows);
  assert.equal(early.every((row) => row.coverageGrade === "allowable-cut-unknown"), true);
  const row2023 = indicator.rows.find((row) => row.year === 2023);
  assert.deepEqual(row2023 && [row2023.totalHarvestMillionCubicMetres, row2023.harvestRegulatedByAacMillionCubicMetres, row2023.allowableAnnualCutMillionCubicMetres], [39.2, 33.16, 62.3]);
  assert.match(english, /53\.2%/);
  assert.match(english, /<th scope="row">1910<\/th><td>BC<\/td><td>0<\/td><td>0<\/td><td>0<\/td><td><span class="unknown-value">Unknown<\/span><\/td><td><span class="unknown-value">Unknown<\/span><\/td>/);
});

test("the public record claims no admission, release or per-hectare derivation", () => {
  assert.deepEqual(indicator.summary, { rows: 114, firstYear: 1910, lastYear: 2023, allowableCutUnknownRows: 32 });
  assert.equal(indicator.claims.perHectareDerivation, false);
  assert.equal(indicator.claims.admitted, false);
  assert.equal(indicator.claims.released, false);
  assert.equal(indicator.source.licenceId, "ogl-bc");
  const manifest = JSON.parse(read("data/staged-acquisitions.json"));
  const entry = manifest.entries.find((candidate: { id: string }) => candidate.id === indicator.source.manifestId);
  assert.equal(entry?.sha256, indicator.source.sha256);
});

test("the builder maps by header, keeps blanks null and refuses a changed header", () => {
  const cell = (reference: string, value: string | null, shared = false) => value === null ? `<c r="${reference}"/>` : `<c r="${reference}"${shared ? ' t="s"' : ""}><v>${value}</v></c>`;
  const header = ["Year", "Total_harvest_millions_m3", "Harvest_regulated_by_AACs_millions_m3", "Harvest_not_regulated_by_AACs_millions_m3", "Total_sum_of_AACs_millions_m3"];
  const workbook = (names: string[]) => zip({
    "xl/sharedStrings.xml": `<sst>${names.map((name) => `<si><t>${name}</t></si>`).join("")}</sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1">${names.map((_, index) => cell(`${"ABCDE"[index]}1`, String(index), true)).join("")}</row><row r="2">${cell("A2", "1941")}${cell("B2", "17.450000000000003")}${cell("C2", "0")}${cell("D2", "17.45")}</row></sheetData></worksheet>`,
  });
  assert.deepEqual(sheetRows(workbook(header))[1], ["1941", "17.450000000000003", "0", "17.45", null]);
  const record = buildRecord(workbook(header), {});
  assert.equal(record.rows[0].allowableAnnualCutMillionCubicMetres, null);
  assert.equal(record.rows[0].totalHarvestMillionCubicMetres, 17.45);
  assert.throws(() => buildRecord(workbook([...header.slice(0, 4), "AAC"]), {}), /header changed/);
});

test("both routes are registered, independently citable and linked from the data page", () => {
  assert.match(read("app/en/data/bc-harvest-volume/page.tsx"), /routeMetadata\("en"/);
  assert.match(read("app/fr/donnees/volume-recolte-bc/page.tsx"), /routeMetadata\("fr"/);
  for (const file of ["scripts/check-bilingual.mjs", "lib/site-metadata.ts", "lib/locale-navigation.ts", "components/transparency/DataPage.tsx"]) {
    assert.match(read(file), /bc-harvest-volume/, file);
    assert.match(read(file), /volume-recolte-bc/, file);
  }
});

/*
 * The page leads with a chart (audit 2026-11-10, J1). It is server-rendered
 * SVG, it draws only the table's own columns, a missing value breaks its line
 * instead of being drawn as zero, and its caption carries the units, the
 * source and the table's caveats.
 */
test("the chart comes first, as SVG drawn on the server, with a caption and a text summary", () => {
  for (const locale of ["en", "fr"] as const) {
    const page = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale={locale} />);
    const chart = page.indexOf('class="content-section bc-volume-figure"');
    assert.ok(chart > page.indexOf("</header>"), `${locale}: chart after the masthead`);
    assert.ok(chart < page.indexOf("<table>"), `${locale}: chart before the table`);
    assert.ok(chart < page.indexOf(locale === "en" ? "A different kind of measure" : "Un autre type de mesure"), `${locale}: chart first`);
    assert.doesNotMatch(page, /<script|<canvas/);

    const figure = renderToStaticMarkup(<BcHarvestVolumeChart rows={indicator.rows} locale={locale} />);
    assert.match(figure, /<svg class="bc-volume-chart" role="img" aria-labelledby="bc-volume-chart-title" aria-describedby="bc-volume-chart-summary"/);
    assert.match(figure, /<p id="bc-volume-chart-summary" class="bc-volume-summary">/);
    const caption = figure.slice(figure.indexOf("<figcaption"), figure.indexOf("</figcaption>"));
    if (locale === "en") {
      assert.match(caption, /Million cubic metres a year/);
      assert.match(caption, /not standing timber/);
      assert.match(caption, /a policy number, not a measurement/);
      assert.match(caption, /gap in its line, never zero/);
      assert.match(caption, /no allowable-cut values before 1942/);
      assert.match(caption, /No cubic-metres-per-hectare figure/);
      assert.match(caption, /Environmental Reporting BC, Trends in Timber Harvesting indicator, summary data/);
      assert.match(caption, /Open Government Licence – British Columbia/);
    } else {
      assert.match(caption, /Millions de mètres cubes par année/);
      assert.match(caption, /non du bois sur pied/);
      assert.match(caption, /valeur de politique publique, et non une mesure/);
      assert.match(caption, /interruption de sa ligne, jamais zéro/);
      assert.match(caption, /avant 1942/);
      assert.match(caption, /Aucun chiffre en mètres cubes par hectare/);
      assert.match(caption, /Licence du gouvernement ouvert – Colombie-Britannique/);
    }
    assert.match(figure, locale === "en" ? /No allowable-cut values, 1910–1941/ : /Aucune valeur de possibilité de coupe, 1910–1941/);
    assert.doesNotMatch(figure, /\d[\d.,\s]*(?:m³|m3)\s*\/\s*ha\b|stumpage|droits de coupe/i);
  }
});

test("the chart draws only the table's columns and leaves years without a value as gaps", () => {
  const markup = renderToStaticMarkup(<BcHarvestVolumeChart rows={indicator.rows} locale="en" />);
  const plot = (html: string) => html.slice(html.indexOf('<svg class="bc-volume-chart"'), html.indexOf("</svg>", html.indexOf('<svg class="bc-volume-chart"')));
  const figure = plot(markup);
  // Three series, the three volume columns of the table; nothing derived.
  assert.deepEqual([...new Set([...figure.matchAll(/bc-volume-(?:line|dot)--(\w+)/g)].map((match) => match[1]))].sort(), ["allowable", "regulated", "total"]);
  // The allowable cut has no value before 1942, so its line starts there and nothing is drawn as zero before it.
  const allowable = seriesRuns([...indicator.rows].sort((a, b) => a.year - b.year), "allowable");
  assert.equal(allowable.length, 1);
  assert.equal(allowable[0][0].year, 1942);
  assert.equal(allowable[0].length, indicator.rows.length - indicator.summary.allowableCutUnknownRows);
  // A null or a missing year ends a run; a lone value is a dot, not a line to zero.
  const synthetic = [
    { year: 2000, totalHarvestMillionCubicMetres: 1, harvestRegulatedByAacMillionCubicMetres: null, allowableAnnualCutMillionCubicMetres: null },
    { year: 2001, totalHarvestMillionCubicMetres: null, harvestRegulatedByAacMillionCubicMetres: null, allowableAnnualCutMillionCubicMetres: null },
    { year: 2002, totalHarvestMillionCubicMetres: 3, harvestRegulatedByAacMillionCubicMetres: null, allowableAnnualCutMillionCubicMetres: null },
    { year: 2003, totalHarvestMillionCubicMetres: 4, harvestRegulatedByAacMillionCubicMetres: null, allowableAnnualCutMillionCubicMetres: null },
    { year: 2005, totalHarvestMillionCubicMetres: 5, harvestRegulatedByAacMillionCubicMetres: null, allowableAnnualCutMillionCubicMetres: null },
  ];
  assert.deepEqual(seriesRuns(synthetic, "total").map((run) => run.map((point) => point.year)), [[2000], [2002, 2003], [2005]]);
  assert.deepEqual(seriesRuns(synthetic, "regulated"), []);
  const whole = renderToStaticMarkup(<BcHarvestVolumeChart rows={synthetic} locale="en" />);
  const drawn = plot(whole);
  assert.equal((drawn.match(/<polyline class="bc-volume-line bc-volume-line--total"/g) ?? []).length, 1);
  assert.equal((drawn.match(/<circle class="bc-volume-dot bc-volume-dot--total"/g) ?? []).length, 2);
  assert.doesNotMatch(drawn, /bc-volume-(?:line|dot)--(?:regulated|allowable)/);
  // With no allowable-cut value at all, the caption still carries every caveat.
  assert.match(whole, /a policy number, not a measurement[\s\S]*gap in its line, never zero\. No cubic-metres-per-hectare/);
});

test("every figure in the chart's summary is a value the table prints", () => {
  for (const locale of ["en", "fr"] as const) {
    const page = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale={locale} />);
    const table = page.slice(page.indexOf("<table>"), page.indexOf("</table>"));
    const summary = page.slice(page.indexOf('id="bc-volume-chart-summary"'), page.indexOf("</p>", page.indexOf('id="bc-volume-chart-summary"')));
    const figures = [...summary.matchAll(/\d+(?:[.,]\d+)?(?:\u00a0%|%)?/g)].map((match) => match[0]).filter((value) => !/^(?:19|20)\d\d$/.test(value));
    assert.ok(figures.length >= 5, `${locale}: summary figures`);
    for (const value of figures) assert.ok(table.includes(`<td>${value}</td>`), `${locale}: ${value} is not a table cell`);
    assert.match(summary, locale === "en" ? /peaked at 90\.54 million m³ in 2005/ : /culminé à 90,54\u00a0millions de m³ en 2005/);
    assert.match(summary, locale === "en" ? /53\.2%/ : /53,2\u00a0%/);
  }
});

/*
 * The whole table stays, collapsed under the chart in a native <details>
 * (J2), so it opens without script; the stylesheet forces it open when
 * printed and when the page is read without JavaScript.
 */
test("the whole table sits collapsed under the chart and opens for print and without script", () => {
  for (const locale of ["en", "fr"] as const) {
    const page = renderToStaticMarkup(<BcHarvestVolumeIndicator rows={indicator.rows} locale={locale} />);
    const details = page.indexOf('<details class="bc-volume-table">');
    assert.ok(details > page.indexOf("</figure>"), `${locale}: under the chart`);
    assert.ok(details < page.indexOf("<table>") && page.indexOf("</table>") < page.indexOf("</details>"), `${locale}: the table is inside`);
    assert.doesNotMatch(page, /<details class="bc-volume-table" open/);
    assert.match(page, locale === "en"
      ? /<summary>Every year as a table \(114 rows, 1910–2023\)<\/summary>/
      : /<summary>Toutes les années sous forme de tableau \(114\u00a0lignes, 1910–2023\)<\/summary>/);
    // Every row is still there.
    assert.equal((page.match(/<th scope="row">/g) ?? []).length, indicator.rows.length);
  }
  const css = read("app/globals.css");
  const start = css.indexOf("@media print, (scripting: none) {\n  .bc-volume-table");
  assert.ok(start >= 0, "print and no-script rule");
  const rule = css.slice(start);
  const block = rule.slice(0, rule.indexOf("\n}\n"));
  assert.match(block, /\.bc-volume-table::details-content \{\n {4}content-visibility: visible;/);
  assert.match(block, /\.bc-volume-table > \.table-scroll \{\n {4}display: block;/);
});

/** A stored (uncompressed) zip, enough to exercise the builder's reader. */
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
