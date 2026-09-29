import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import indicator from "../data/bc-timber-harvest-aac-indicator.json";
import { BcHarvestVolumeIndicator } from "../components/transparency/BcHarvestVolumeIndicator";
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
  assert.match(read("app/en/data/bc-harvest-volume/page.tsx"), /localizedAlternates\("en"/);
  assert.match(read("app/fr/donnees/volume-recolte-bc/page.tsx"), /localizedAlternates\("fr"/);
  for (const file of ["scripts/check-bilingual.mjs", "lib/site-metadata.ts", "lib/locale-navigation.ts", "components/transparency/DataPage.tsx"]) {
    assert.match(read(file), /bc-harvest-volume/, file);
    assert.match(read(file), /volume-recolte-bc/, file);
  }
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
