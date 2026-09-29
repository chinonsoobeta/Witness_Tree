import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PLACE_NAME_INDEX,
  displayPlaceName,
  indexedPlace,
  parsePlaceNameIndex,
  placeTypeLabel,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/search/place-names.ts";

type RawPlace = {
  id: string;
  name: string;
  nameFr?: string;
  type: string;
  province: string;
  federal: [string, number][];
  provincial: [string, number][];
};
type RawIndex = {
  schema: string;
  builderSha256: string;
  claims: Record<string, boolean>;
  counts: { placesByProvince: Record<string, number>; leftOut: number };
  exclusions: { types: string[]; decision: string };
  source: { sha256: string; attribution: { en: string; fr?: string } };
  ridingLayers: { id: string; jurisdiction: string; boundaryEdition: string }[];
  gaps: { id: string; layer: string }[];
  places: RawPlace[];
};
type Measurements = { jurisdictions: { jurisdiction: string; boundaryEdition: string; districts: { boundaryId: string }[] }[] };

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const read = (file: string) => readFileSync(path.join(REPO_ROOT, file), "utf8");
const raw = read("data/place-name-index.json");
const index = JSON.parse(raw) as RawIndex;
const clone = () => JSON.parse(raw) as RawIndex;
const measurements = JSON.parse(read("data/phase3-riding-interval-measurements.json")) as Measurements;

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const D5_TYPES = ["IRI", `S-${String.fromCharCode(0xc9)}`, "IGD", "NL", "TAL", "TWL", "TC", "TI", "TK", "VC", "VK", "VN"];
const PROVINCE_CODES = ["59", "48", "35", "24"];

test("the committed index passes its own contract", () => {
  const parsed = parsePlaceNameIndex(index);
  assert.equal(parsed.places.length, 2291);
  assert.equal(PLACE_NAME_INDEX.places.length, 2291);
  const byProvince: Record<string, number> = {};
  for (const place of parsed.places) byProvince[place.province] = (byProvince[place.province] ?? 0) + 1;
  assert.deepEqual(byProvince, { AB: 337, BC: 320, ON: 430, QC: 1204 });
  assert.deepEqual(index.counts.placesByProvince, byProvince);
});

test("the builder in the repository is the one that wrote the index", () => {
  const builder = readFileSync(path.join(REPO_ROOT, "scripts/place_name_index.py"));
  assert.equal(createHash("sha256").update(builder).digest("hex"), index.builderSha256);
});

test("reserves, settlements, and treaty or agreement lands are left out, as D5 records", () => {
  assert.deepEqual(index.exclusions.types, D5_TYPES);
  assert.match(index.exclusions.decision, /Not an owner decision\./);
  assert.equal(index.counts.leftOut, 742);
  for (const place of PLACE_NAME_INDEX.places) assert.ok(!D5_TYPES.includes(place.type), place.id);
});

test("Prince George names its federal and provincial ridings, largest share first", () => {
  const place = indexedPlace("5953023");
  assert.ok(place);
  assert.equal(place.name, "Prince George");
  assert.equal(place.type, "CY");
  assert.equal(place.province, "BC");
  assert.equal(placeTypeLabel(place.type, "en"), "City");
  assert.ok(place.federal.length > 0 && place.federal.every((riding) => riding.id.startsWith("CA-59")));
  assert.ok(place.provincial.length > 0 && place.provincial.every((riding) => riding.id.startsWith("BC-")));
  for (const list of [place.federal, place.provincial]) {
    for (let at = 1; at < list.length; at += 1) assert.ok(list[at].share <= list[at - 1].share);
  }
});

test("every listed riding has released figures, and every riding in the four provinces is named", () => {
  const released = new Set<string>();
  const inScope = new Set<string>();
  for (const jurisdiction of measurements.jurisdictions) {
    for (const district of jurisdiction.districts) {
      const id = `${jurisdiction.jurisdiction}-${district.boundaryId}`;
      released.add(id);
      if (jurisdiction.jurisdiction !== "CA" || PROVINCE_CODES.includes(district.boundaryId.slice(0, 2))) inScope.add(id);
    }
  }
  const named = new Set<string>();
  for (const place of PLACE_NAME_INDEX.places) {
    for (const riding of [...place.federal, ...place.provincial]) {
      assert.ok(released.has(riding.id), `${place.id} lists ${riding.id}, which has no released figures`);
      named.add(riding.id);
    }
  }
  assert.equal(inScope.size, 280 + 93 + 87 + 124 + 127);
  assert.deepEqual([...inScope].filter((id) => !named.has(id)), []);
  for (const layer of index.ridingLayers) {
    const jurisdiction = measurements.jurisdictions.find((entry) => entry.jurisdiction === layer.jurisdiction);
    assert.equal(layer.boundaryEdition, jurisdiction?.boundaryEdition);
  }
});

test("a place with no riding in a layer is a recorded gap, not an empty answer", () => {
  // L'Ile-Dorval, the island municipality; the city of Dorval (2466087) has a riding.
  const ileDorval = indexedPlace("2466092");
  assert.ok(ileDorval);
  assert.deepEqual(ileDorval.provincial, []);
  assert.ok(ileDorval.federal.length > 0);
  assert.ok((indexedPlace("2466087")?.provincial.length ?? 0) > 0);
  assert.deepEqual(PLACE_NAME_INDEX.gaps, [{ id: "2466092", jurisdiction: "QC" }]);
});

test("the attribution is the one the boundary editions record requires, in both languages", () => {
  const editions = JSON.parse(read("data/boundary-editions.json")) as {
    editions: { id: string; sha256: string; requiredAttribution: string }[];
  };
  const edition = editions.editions.find((entry) => entry.id === "statcan-2021-census-subdivisions-cbf");
  assert.ok(edition);
  assert.equal(PLACE_NAME_INDEX.attribution.en, edition.requiredAttribution);
  assert.equal(index.source.sha256, edition.sha256);
  assert.match(PLACE_NAME_INDEX.attribution.fr, /^Adapt\S+ de Statistique Canada, .+ 2021\. Cela ne constitue pas une approbation/);
});

test("the index carries no em dash, in its bytes or in any string it decodes to", () => {
  assert.ok(!raw.includes(EM_DASH));
  const walk = (value: unknown): void => {
    if (typeof value === "string") assert.ok(!value.includes(EM_DASH), value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(index);
});

test("official bilingual names carry their French form, and the display name follows the locale", () => {
  const bilingual = PLACE_NAME_INDEX.places.filter((place) => place.nameFr !== null).map((place) => place.id);
  assert.deepEqual(bilingual, ["3502025", "3548055", "3552001", "3553005"]);
  const sudbury = indexedPlace("3553005");
  assert.ok(sudbury);
  assert.equal(displayPlaceName(sudbury, "en"), "Greater Sudbury");
  assert.equal(displayPlaceName(sudbury, "fr"), "Grand Sudbury");
  const saintLin = indexedPlace("2463048");
  assert.ok(saintLin);
  assert.equal(saintLin.name, "Saint-Lin--Laurentides");
  assert.equal(displayPlaceName(saintLin, "fr"), `Saint-Lin${EN_DASH}Laurentides`);
  assert.equal(PLACE_NAME_INDEX.places.filter((place) => place.name.includes("--")).length, 6);
});

test("every listed type has a label in both languages, and a left-out type has none", () => {
  for (const place of PLACE_NAME_INDEX.places) {
    assert.ok(placeTypeLabel(place.type, "en"));
    assert.ok(placeTypeLabel(place.type, "fr"));
  }
  assert.equal(placeTypeLabel("V", "fr"), "Ville");
  assert.equal(placeTypeLabel("CV", "fr"), "Ville");
  assert.throws(() => placeTypeLabel("IRI", "en"));
});

test("the reader fails closed on a damaged index", () => {
  const damage: [string, (value: RawIndex) => void][] = [
    ["a different schema", (value) => { value.schema = "witness-tree/place-name-index/0"; }],
    ["a claim that is not false", (value) => { value.claims.released = true; }],
    ["an extra claim", (value) => { value.claims.reviewed = false; }],
    ["a missing place", (value) => { value.places.pop(); }],
    ["a repeated place", (value) => { value.places[1] = value.places[0]; }],
    ["a left-out type", (value) => { value.places[0].type = "IRI"; }],
    ["a place in the wrong province", (value) => { value.places[0].province = "ON"; }],
    ["a riding from another province", (value) => { value.places[0].provincial = [["ON-1", 1]]; }],
    ["a federal riding from another province", (value) => { value.places[0].federal = [["CA-35001", 1]]; }],
    ["shares out of order", (value) => { value.places.find((place) => place.federal.length > 1)?.federal.reverse(); }],
    ["a share above one", (value) => { value.places[0].federal = [["CA-24024", 1.5]]; }],
    ["an empty list with no gap", (value) => { value.gaps = []; }],
    ["an em dash in a name", (value) => { value.places[0].name = `Les${EM_DASH}Iles`; }],
    ["a missing French attribution", (value) => { delete value.source.attribution.fr; }],
  ];
  for (const [label, change] of damage) {
    const value = clone();
    change(value);
    assert.throws(() => parsePlaceNameIndex(value), Error, label);
  }
});

test("the index reaches no client module, directly or through the search barrel", () => {
  assert.doesNotMatch(read("lib/search/index.ts"), /place-names/);
  assert.doesNotMatch(read("lib/search/fixtures.ts"), /place-names/);
  const offenders: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === ".git") continue;
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const text = readFileSync(full, "utf8");
      if (/^[\t ]*["']use client["'];?/m.test(text) && /place-names["']|place-name-index\.json/.test(text)) {
        offenders.push(path.relative(REPO_ROOT, full));
      }
    }
  };
  for (const directory of ["app", "components", "lib"]) walk(path.join(REPO_ROOT, directory));
  assert.deepEqual(offenders, []);
});
