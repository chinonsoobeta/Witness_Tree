import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSourceCandidates } from "../scripts/check-source-candidates.mjs";

const registry = JSON.parse(readFileSync(new URL("../data/source-candidates.json", import.meta.url), "utf8"));
const first = registry.entries[0];

test("official-source candidates are valid but remain pre-ingestion only", () => {
  assert.equal(validateSourceCandidates(registry), registry);
  assert.equal(registry.status, "candidate");
  assert.equal(registry.entries.every((entry) => entry.productionEligible === false), true);
});

test("national and provincial discovery entries retain their bounded role and uncertainty", () => {
  const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));
  for (const id of ["nrcan-annual-high-resolution-forest-land-cover", "nrcan-ca-forest-harvest-1985-2022", "nrcan-forest-canopy-cover-2022", "nrcan-forest-canopy-height-2022", "elections-canada-45th-electoral-boundaries", "canadian-protected-and-conserved-areas-database", "alberta-avi-crown", "ontario-fri-term-2-2018-2028", "qc-historical-wildfire"]) assert.equal(byId.get(id)?.productionEligible, false);
  assert.match(byId.get("nrcan-annual-high-resolution-forest-land-cover")?.intendedRole.en ?? "", /1984–2022/);
  assert.equal(byId.get("elections-canada-45th-electoral-boundaries")?.licence.state, "unresolved");
  assert.equal(byId.get("canadian-protected-and-conserved-areas-database")?.licence.state, "unresolved");
  assert.match(byId.get("qc-historical-wildfire")?.intendedRole.en ?? "", /not a live-fire source/);
  assert.equal(byId.get("nrcan-forest-canopy-cover-2022")?.access.url, "https://opendata.nfis.org/downloads/forest_change/CA_canopy_cover_2022.zip");
  assert.equal(byId.get("nrcan-forest-canopy-height-2022")?.access.url, "https://opendata.nfis.org/downloads/forest_change/CA_canopy_height_2022.zip");
});

test("the resolved harvest record carries a verified harvest URL and keeps the publisher link error open", () => {
  const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));
  const harvest = byId.get("nrcan-ca-forest-harvest-1985-2022");
  const wildfire = byId.get("nrcan-ca-forest-wildfire-1985-2022");
  assert.equal(harvest?.access.state, "verified");
  assert.equal(harvest?.access.url, "https://opendata.nfis.org/downloads/forest_change/CA_Forest_Harvest_1985-2022.zip");
  assert.deepEqual(harvest?.access.formats, ["zip"]);
  assert.equal(harvest?.licence.state, "verified");
  assert.equal(harvest?.licence.id, "ogl-canada");
  assert.equal(harvest?.productionEligible, false);
  // The catalogue conflict is resolved only because harvest and wildfire are proven to be
  // two distinct artifacts. If either URL ever collapses onto the other, the resolution is void.
  assert.equal(wildfire?.access.state, "verified");
  assert.equal(wildfire?.access.url, "https://opendata.nfis.org/downloads/forest_change/CA_Forest_Fire_1985-2022.zip");
  assert.notEqual(harvest?.access.url, wildfire?.access.url);
  assert.equal(wildfire?.productionEligible, false);
  // Resolving the download URL must not be mistaken for the publisher having fixed its catalogue.
  assert.match(harvest?.unresolvedFields.join(" ") ?? "", /publisher correction/i);
  assert.match(harvest?.verifiedFacts.join(" ") ?? "", /still points to a URL named CA_Forest_Fire_1985-2022\.zip/i);
});

test("BC Consolidated Cutblocks stays blocked when the authoritative catalogue says Access Only", () => {
  const cutblocks = registry.entries.find((entry) => entry.id === "bc-consolidated-cutblocks");
  assert.ok(cutblocks, "bc-consolidated-cutblocks candidate is missing");
  assert.equal(cutblocks?.licence.state, "unresolved");
  assert.equal(cutblocks?.access.state, "catalogue-listed");
  assert.match(cutblocks?.unresolvedFields.join(" ") ?? "", /redistributable licence/i);
  assert.equal(cutblocks?.productionEligible, false);
});

test("Ontario FRI Term 2 stays unresolved and records a request-based access route", () => {
  const fri = registry.entries.find((entry) => entry.id === "ontario-fri-term-2-2018-2028");
  assert.equal(fri?.access.state, "unresolved");
  assert.equal("url" in (fri?.access ?? {}), false);
  assert.equal(fri?.productionEligible, false);
  assert.match(fri?.unresolvedFields.join(" ") ?? "", /no open Term 2 bulk endpoint|none was found/i);
  assert.match(fri?.verifiedFacts.join(" ") ?? "", /info\.mnrfscience@ontario\.ca/);
  assert.match(fri?.verifiedFacts.join(" ") ?? "", /draft data/i);
});

test("candidate registry rejects production, unsafe URLs, incomplete bilingual purpose, and removed uncertainty", () => {
  assert.throws(() => validateSourceCandidates({ ...registry, status: "production" }), /candidate/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, status: "production" }] }), /production eligible/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, productionEligible: true }] }), /production eligible/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, catalogueUrl: "https://example.local/catalogue" }] }), /non-example HTTPS/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, catalogueUrl: "http://catalogue.example.org" }] }), /non-example HTTPS/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, intendedRole: { ...first.intendedRole, fr: "" } }] }), /English and French/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, unresolvedFields: [] }] }), /Unresolved/);
});

test("candidate registry rejects invented lineage and incomplete verified licences", () => {
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, retrievedAt: "2026-08-11" }] }), /retrieval or checksum/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, rawChecksumSha256: "a".repeat(64) }] }), /retrieval or checksum/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, access: { ...first.access, retrievalDate: "2026-08-11" } }] }), /retrieval or checksum/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, licence: { state: "verified", id: "cc-by-4.0" } }] }), /Official licence URL/);
  assert.throws(() => validateSourceCandidates({ ...registry, entries: [{ ...first, licence: { state: "verified", officialUrl: "https://www.donneesquebec.ca/licence/" } }] }), /Licence id/);
});
