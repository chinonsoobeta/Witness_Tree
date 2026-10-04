#!/usr/bin/env node
// Builds data/nfd-provincial-volume-wood-supply.json from the National Forestry
// Database's volume-harvested and wood-supply tables, for Alberta, Ontario and
// Québec: the equivalents of BC's harvest volume and allowable annual cut that
// the owner asked for on 2026-10-03.
//
// Both figures are for provincial land, which is what a provincial allowable
// cut governs. Harvest is industrial roundwood (logs and bolts, pulpwood, other
// industrial roundwood and unspecified products); fuelwood and firewood are
// left out, because the wood supply is a supply of industrial roundwood.
//
// A cell qualified "n" (not applicable) is left out of a sum. Any other blank
// cell is unknown, never zero: the year keeps the sum of what is known and is
// marked incomplete. A year where nothing is known is null.
//
// Usage: node scripts/build-nfd-provincial-volume.mjs --raw <dir with the two CSVs>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(REPO, "data", "nfd-provincial-volume-wood-supply.json");
const PROVINCES = ["AB", "ON", "QC"];
const QUALIFIERS = new Set(["", "a", "u", "U", "E", "e", "n", "p", "s", "r"]);
const FILES = {
  harvest: "nfd-volume-harvested-en-fr.csv",
  supply: "nfd-wood-supply-en-fr.csv",
};

/** A small RFC 4180 reader: the NFD files quote some French labels. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name.replace(/^\uFEFF/, ""), values[index] ?? ""])));
}

function totals(rows, keep) {
  const byKey = new Map();
  for (const row of rows) {
    if (!PROVINCES.includes(row.ISO) || row["Tenure (En)"] !== "Provincial land" || !keep(row)) continue;
    const qualifier = row["Data qualifier"];
    if (!QUALIFIERS.has(qualifier)) throw new Error(`Unknown qualifier ${qualifier} in ${row.ISO} ${row.Year}.`);
    const key = `${row.ISO}:${row.Year}`;
    const entry = byKey.get(key) ?? { province: row.ISO, year: Number(row.Year), known: 0, numeric: 0, unknown: 0, estimated: false };
    const value = row["Volume (cubic metres)"];
    if (value !== "") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) throw new Error(`Bad volume ${value} in ${key}.`);
      entry.known += number;
      entry.numeric += 1;
      if (qualifier === "E" || qualifier === "e") entry.estimated = true;
    } else if (qualifier !== "n") entry.unknown += 1;
    byKey.set(key, entry);
  }
  return byKey;
}

function main() {
  const at = process.argv.indexOf("--raw");
  if (at < 0) throw new Error("Pass --raw <directory>.");
  const raw = process.argv[at + 1];
  const sources = Object.fromEntries(Object.entries(FILES).map(([id, name]) => {
    const bytes = readFileSync(path.join(raw, name));
    return [id, { name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }];
  }));
  const harvest = totals(parseCsv(sources.harvest.bytes.toString("utf8")), (row) => !row.Category.startsWith("Fuelwood"));
  const supply = totals(parseCsv(sources.supply.bytes.toString("utf8")), () => true);
  const figure = (entry) =>
    entry && entry.numeric > 0
      ? { cubicMetres: Math.round(entry.known), complete: entry.unknown === 0, estimated: entry.estimated }
      : null;
  const keys = [...new Set([...harvest.keys(), ...supply.keys()])];
  const rows = keys
    .map((key) => {
      const [province, year] = key.split(":");
      return { province, year: Number(year), harvest: figure(harvest.get(key)), woodSupply: figure(supply.get(key)) };
    })
    .filter((row) => row.year >= 1990 && (row.harvest || row.woodSupply))
    .sort((a, b) => a.province.localeCompare(b.province) || a.year - b.year);
  const release = {
    schema: "witness-tree/nfd-provincial-volume-wood-supply/1",
    builtFrom: "scripts/build-nfd-provincial-volume.mjs",
    source: {
      publisher: "Canadian Council of Forest Ministers, National Forestry Database",
      downloadPage: "http://nfdp.ccfm.org/en/download.php",
      termsUrl: "https://nfdp.ccfm.org/en/terms.php",
      licence: "Open Government Licence – Canada version 2.0",
      retrieved: "2026-10-03",
      files: Object.values(sources).map(({ name, bytes, sha256 }) => ({ fileName: name, byteLength: bytes.length, sha256 })),
    },
    method: {
      tenure: "Provincial land only.",
      harvest: "Net merchantable volume of industrial roundwood harvested: logs and bolts, pulpwood, other industrial roundwood and unspecified products. Fuelwood and firewood are excluded.",
      woodSupply: "Wood supply estimate for industrial roundwood on provincial land, all species groups.",
      estimated: "estimated is true where any summed cell carries the publisher's estimate qualifier (E or e).",
      missingness: "A cell qualified n is not applicable and is left out. Any other blank cell is unknown, never zero; the year keeps the known sum and is marked incomplete. A year with no known cell is null.",
      years: "The publisher's year label is carried verbatim; 1990 onward, the years both tables cover.",
    },
    claims: { measurement: "reported-harvest-volume", woodSupply: "administrative-determination", perHectareDerivation: false },
    rows,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(release, null, 1)}\n`);
  console.log(`Wrote ${rows.length} rows to ${path.relative(REPO, OUTPUT)}.`);
}

main();
