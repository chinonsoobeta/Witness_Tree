#!/usr/bin/env node
// Builds the public BC harvest-versus-allowable-cut record from the staged
// Environmental Reporting BC indicator workbook.
//
// The workbook is the only volume source this site may publish: it carries the
// Open Government Licence - British Columbia. The Harvest Billing System reports
// it summarizes are all-rights-reserved and stay on the data root.
//
// Blank workbook cells are unknown and stay null. A zero the publisher wrote is
// kept as the publisher's zero; it is never manufactured from a blank.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_PATH = "data/bc-timber-harvest-aac-indicator.json";
export const SOURCE_RELATIVE_PATH = "raw/bc-timber-harvesting-indicator/2026-09-12/bctimberharvest.xlsx";
export const EXPECTED_HEADER = ["Year", "Total_harvest_millions_m3", "Harvest_regulated_by_AACs_millions_m3", "Harvest_not_regulated_by_AACs_millions_m3", "Total_sum_of_AACs_millions_m3"];

/** Reads one member of a zip archive with node:zlib; no third-party parser. */
export function zipMember(buffer, name) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Workbook is not a zip archive.");
  let cursor = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Workbook central directory is corrupt.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const memberName = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (memberName === name) {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`Unsupported zip method ${method}.`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const decode = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Returns sheet rows as arrays indexed by column, with blanks as null. */
export function sheetRows(buffer) {
  const shared = [...(zipMember(buffer, "xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((match) => decode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
  const sheet = zipMember(buffer, "xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Workbook has no first sheet.");
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
      if (!reference) throw new Error("Workbook cell has no reference.");
      const column = [...reference].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2] ?? "")?.[1];
      cells[column] = raw === undefined ? null : /\bt="s"/.test(cell[1]) ? shared[Number(raw)] : decode(raw);
    }
    return Array.from({ length: Math.max(cells.length, EXPECTED_HEADER.length) }, (_, index) => cells[index] ?? null);
  });
}

// The workbook publishes two decimals; its binary floats carry noise past that.
const millions = (value) => {
  if (value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Non-numeric volume ${value}.`);
  return Math.round(number * 100) / 100;
};

export function buildRecord(buffer, source) {
  const rows = sheetRows(buffer);
  if (JSON.stringify(rows[0].slice(0, EXPECTED_HEADER.length)) !== JSON.stringify(EXPECTED_HEADER)) throw new Error("Workbook header changed; refusing to map columns by position.");
  const series = rows.slice(1).map((cells) => {
    const year = Number(cells[0]);
    if (!Number.isInteger(year)) throw new Error(`Invalid year ${cells[0]}.`);
    const row = {
      year,
      region: "BC",
      sourceId: "bc-timber-harvesting-indicator",
      totalHarvestMillionCubicMetres: millions(cells[1]),
      harvestRegulatedByAacMillionCubicMetres: millions(cells[2]),
      harvestNotRegulatedByAacMillionCubicMetres: millions(cells[3]),
      allowableAnnualCutMillionCubicMetres: millions(cells[4]),
    };
    const aacKnown = row.allowableAnnualCutMillionCubicMetres !== null;
    return { ...row, coverageGrade: aacKnown && row.totalHarvestMillionCubicMetres !== null ? "complete" : "allowable-cut-unknown" };
  });
  return {
    schemaVersion: "witness-tree/bc-timber-harvest-aac-indicator/1",
    status: "prepared-not-released",
    source,
    units: "million cubic metres per year",
    method: {
      mapping: "Workbook columns are mapped by exact header name. Values are rounded to the two decimals the indicator publishes.",
      blanks: "A blank workbook cell is unknown and stays null. It is never zero.",
      derivation: "None. No per-hectare, per-cell or area-joined figure is derived from these volumes.",
    },
    summary: {
      rows: series.length,
      firstYear: series[0].year,
      lastYear: series.at(-1).year,
      allowableCutUnknownRows: series.filter((row) => row.coverageGrade === "allowable-cut-unknown").length,
    },
    claims: { measurement: "scaled-harvest-volume", allowableAnnualCut: "administrative-determination", stumpage: "not-included", perHectareDerivation: false, admitted: false, released: false, productionEligible: false },
    rows: series,
  };
}

function main() {
  const dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  const input = path.join(dataRoot, SOURCE_RELATIVE_PATH);
  if (!existsSync(input)) throw new Error(`Data root unavailable: ${input} is not present. Unavailable is not contradicted; nothing was written.`);
  const buffer = readFileSync(input);
  const manifest = JSON.parse(readFileSync(path.join(root, "data/staged-acquisitions.json"), "utf8"));
  const entry = manifest.entries.find((candidate) => candidate.sourceId === "bc-timber-harvesting-indicator");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (!entry || entry.sha256 !== sha256) throw new Error("Workbook bytes do not match the staged manifest entry.");
  const record = buildRecord(buffer, { manifestId: entry.id, sha256, byteLength: buffer.length, sourceUrl: entry.sourceUrl, licenceId: entry.licenceId, licenceUrl: entry.licenceUrl, attribution: entry.attribution, publisherLastModified: entry.sourceVersion });
  writeFileSync(path.join(root, OUTPUT_PATH), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT_PATH, rows: record.summary.rows, sha256 }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
