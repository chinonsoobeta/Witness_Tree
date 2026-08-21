import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PUBLIC_CONTENT_REGISTRY, validatePublicContentRegistry } from "../lib/content/public-content.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { GENERATED_RECORDS, PLACE_REGISTRY, SOURCE_RECORDS, validateGeneratedRecordCompleteness, validatePlaceRegistry } from "../lib/places/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PublicContentPage } from "../components/transparency/PublicContentPage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PlacePage } from "../components/places/PlacePage.tsx";
import { checkPhase3Downloads } from "../scripts/check-phase3-downloads.mjs";
import downloadManifest from "../data/phase3-example-download-manifest.json";

test("coordinate permalinks are deterministic, unique, paired and retain complete containment", () => {
  assert.deepEqual(validatePlaceRegistry(), { places: 32, coordinatePermalinks: 32, containmentLinks: 256 });
  for (const entry of PLACE_REGISTRY) {
    assert.equal(entry.location.containingPlaceIds.length, 8);
    const records = GENERATED_RECORDS.filter((record) => record.kind === "location" && record.entityId === entry.location.coordinateId);
    assert.deepEqual(records.map(({ locale }) => locale).sort(), ["en", "fr"]);
    assert.equal(records[0]!.alternate.href, records[1]!.route);
    assert.equal(records[1]!.alternate.href, records[0]!.route);
  }
});

test("coordinate identity drift and missing containment fail closed", () => {
  const first = PLACE_REGISTRY[0]!;
  assert.throws(() => validatePlaceRegistry([{ ...first, location: { ...first.location, coordinateId: `${first.location.coordinateId}-drift` } }, ...PLACE_REGISTRY.slice(1)]), /identity drift/);
  assert.throws(() => validatePlaceRegistry([{ ...first, location: { ...first.location, containingPlaceIds: first.location.containingPlaceIds.slice(1) } }, ...PLACE_REGISTRY.slice(1)]), /missing or duplicate applicable/);
});

test("bilingual generated record and MDX completeness accepts injected records and fails closed", () => {
  assert.deepEqual(validateGeneratedRecordCompleteness(GENERATED_RECORDS), { records: 384, pairs: 192 });
  assert.throws(() => validateGeneratedRecordCompleteness(GENERATED_RECORDS.slice(1)), /incomplete/);
  const first = GENERATED_RECORDS[0]!;
  assert.throws(() => validateGeneratedRecordCompleteness([{ ...first, strings: { ...first.strings, title: "" } }, ...GENERATED_RECORDS.slice(1)]), /localized strings/);
  assert.throws(() => validateGeneratedRecordCompleteness([{ ...first, mdx: first.mdx.replace("productionEligible: false", "") }, ...GENERATED_RECORDS.slice(1)]), /MDX (front matter|boundary)/);
  assert.throws(() => validateGeneratedRecordCompleteness([{ ...first, mdx: first.mdx.replace("status: example", "status: example\nstatus: production") }, ...GENERATED_RECORDS.slice(1)]), /duplicate MDX front matter key/);
  assert.throws(() => validateGeneratedRecordCompleteness([{ ...first, mdx: first.mdx.replace("status: example", "status: production") }, ...GENERATED_RECORDS.slice(1)]), /contradictory/);
  assert.throws(() => validateGeneratedRecordCompleteness([{ ...first, alternate: { ...first.alternate, href: "/fabricated" } }, ...GENERATED_RECORDS.slice(1)]), /hreflang/);
});

test("one bilingual content/source registry drives all four surfaces and registered citations", () => {
  assert.deepEqual(validatePublicContentRegistry(), { pages: 4, sources: 32, citations: 32 });
  for (const kind of ["methods", "data", "glossary", "corrections"] as const) for (const locale of ["en", "fr"] as const) {
    const html = renderToStaticMarkup(<PublicContentPage kind={kind} locale={locale} />);
    assert.match(html, /<main id="main"/);
    assert.match(html, /example|illustrative|illustratif|illustrative|production/i);
  }
  const place = renderToStaticMarkup(<PlacePage locale="en" entry={PLACE_REGISTRY[0]!} view="table" />);
  assert.match(place, new RegExp(`/en/data#source-${PLACE_REGISTRY[0]!.source.id}`));
  const ledger = renderToStaticMarkup(<PublicContentPage kind="data" locale="en" />);
  assert.match(ledger, new RegExp(`id="source-${PLACE_REGISTRY[0]!.source.id}"`));
});

test("untranslated content and unregistered citation sources fail closed", () => {
  const firstPage = PUBLIC_CONTENT_REGISTRY[0]!;
  const untranslated = [{ ...firstPage, title: { ...firstPage.title, fr: "" } }, ...PUBLIC_CONTENT_REGISTRY.slice(1)];
  assert.throws(() => validatePublicContentRegistry(untranslated), /English and French/);
  const first = PLACE_REGISTRY[0]!;
  const unregistered = [{ ...first, citation: { ...first.citation, sourceIds: ["fabricated-source"] } }, ...PLACE_REGISTRY.slice(1)];
  assert.throws(() => validatePublicContentRegistry(PUBLIC_CONTENT_REGISTRY, SOURCE_RECORDS, unregistered), /Unregistered source/);
  assert.throws(() => validatePublicContentRegistry([...PUBLIC_CONTENT_REGISTRY, firstPage]), /exactly once/);
  assert.throws(() => validatePlaceRegistry([{ ...first, place: { ...first.place, citationId: "fabricated-citation" } }, ...PLACE_REGISTRY.slice(1)]), /citation identity/);
  assert.throws(() => validatePlaceRegistry([{ ...first, place: { ...first.place, sourceIds: [PLACE_REGISTRY[1]!.source.id] } }, ...PLACE_REGISTRY.slice(1)]), /source identifiers/);
  assert.throws(() => validatePlaceRegistry([{ ...first, citation: { ...first.citation, status: "production" as never } }, ...PLACE_REGISTRY.slice(1)]), /example boundary/);
});

test("all deterministic example downloads match their checksum manifest", async () => {
  assert.deepEqual(await checkPhase3Downloads(), { files: 32 });
  assert.ok(PLACE_REGISTRY.every(({ download }) => !download.href.startsWith("data:") && downloadManifest.entries.some((entry) => entry.id === download.id && entry.sha256 === download.sha256 && entry.bytes === download.bytes)));
});

test("download checksum drift fails closed", async () => {
  const drifted = { ...downloadManifest, entries: downloadManifest.entries.map((entry, index) => index ? entry : { ...entry, sha256: "a".repeat(64) }) };
  await assert.rejects(checkPhase3Downloads({ manifest: drifted }), /checksum or byte-length drift/);
  const substituted = { ...downloadManifest, entries: downloadManifest.entries.map((entry, index) => index ? entry : { ...entry, id: "fabricated-place-download", placeId: "fabricated-place", href: "/examples/downloads/fabricated-place.csv" }) };
  await assert.rejects(checkPhase3Downloads({ manifest: substituted }), /registry place-ID set/);
});
