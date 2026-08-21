import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { GENERATED_RECORD_KINDS, GENERATED_RECORDS, LOCATIONS, PAGE_COUNT_MANIFEST, PLACE_PROVINCES, PLACE_REGISTRY, PLACE_TYPES, PLACES } from "../lib/places/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PlacePage } from "../components/places/PlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { LocationResult } from "../components/places/LocationResult.tsx";

const numeric = (value: (typeof LOCATIONS)[number]["events"][number]["year"]): number => value.kind === "figure" ? value.value : Number.NEGATIVE_INFINITY;

test("synthetic registry covers every place-type and province cross-product", () => {
  assert.equal(PLACE_REGISTRY.length, 32);
  assert.equal(PLACES.length, 32);
  assert.equal(LOCATIONS.length, 32);
  assert.deepEqual(new Set(PLACE_REGISTRY.map(({ place }) => `${place.type}:${place.province}`)), new Set(PLACE_TYPES.flatMap((type) => PLACE_PROVINCES.map((province) => `${type}:${province}`))));
  assert.ok(PLACE_REGISTRY.every(({ place, location, search, source, citation, download }) => [place, location, search, source, citation, download].every((record) => record.status === "example" && record.reviewStatus === "unapproved" && record.productionEligible === false)));
});

test("every public numeric field is a Figure or localized Unknown with coverage and provenance", () => {
  const numbers = PLACE_REGISTRY.flatMap(({ place, location, citation }) => [
    place.forestHectares, ...place.coverage.map(({ share }) => share), ...place.annual.flatMap(({ year, hectares }) => [year, hectares]), ...place.events.map(({ year }) => year), ...place.stats,
    location.latitude, location.longitude, location.accuracyMetres, ...location.events.map(({ year }) => year), citation.timeRange.from, citation.timeRange.to,
  ]);
  assert.ok(numbers.every((value) => (value.kind === "figure" || value.kind === "unknown") && Boolean(value.coverageGrade) && Boolean(value.provenance.dataset) && Boolean(value.provenance.version)));
  assert.ok(numbers.filter((value) => value.kind === "unknown").every((value) => Boolean(value.reason.en) && Boolean(value.reason.fr) && !("value" in value)));
  assert.ok(PLACES.every((place) => place.coverage.every(({ share }) => share.kind === "figure") && place.coverage.reduce((sum, { share }) => sum + (share.kind === "figure" ? share.value : 0), 0) === 100));
});

test("annual rows retain event identifiers and location events are newest first", () => {
  assert.ok(PLACES.every((place) => place.annual.every((summary) => summary.eventIds.every((id) => place.events.some((event) => event.id === id)))));
  assert.ok(LOCATIONS.every((location) => location.events.every((event, index, events) => index === 0 || numeric(events[index - 1]!.year) >= numeric(event.year))));
});

test("generator emits exact bilingual record pairs, hreflang pairs and page counts", () => {
  assert.equal(GENERATED_RECORDS.length, 384);
  const { byteLengths: _byteLengths, ...counts } = PAGE_COUNT_MANIFEST;
  assert.equal(_byteLengths.length, 192);
  assert.deepEqual(counts, { schemaVersion: "witness-tree/phase3-page-manifest/1", status: "example", reviewStatus: "unapproved", productionEligible: false, placeTypes: 8, provinces: 4, entities: 32, localizedRecords: 384, localizedStaticPages: 128, recordPairs: 192 });
  for (const kind of GENERATED_RECORD_KINDS) {
    const ids = new Set(GENERATED_RECORDS.filter((record) => record.kind === kind).map(({ entityId }) => entityId));
    assert.equal(ids.size, 32);
    for (const entityId of ids) {
      const pair = GENERATED_RECORDS.filter((record) => record.kind === kind && record.entityId === entityId);
      assert.deepEqual(pair.map(({ locale }) => locale).sort(), ["en", "fr"]);
      const [en, fr] = [pair.find(({ locale }) => locale === "en")!, pair.find(({ locale }) => locale === "fr")!];
      assert.equal(en.alternate.locale, "fr");
      assert.equal(fr.alternate.locale, "en");
      assert.equal(en.alternate.href, fr.route);
      assert.equal(fr.alternate.href, en.route);
      assert.deepEqual(Object.keys(en.strings).sort(), Object.keys(fr.strings).sort());
      assert.ok(Object.values(en.strings).every(Boolean) && Object.values(fr.strings).every(Boolean));
      assert.match(en.mdx, /status: example[\s\S]*reviewStatus: unapproved[\s\S]*productionEligible: false/);
      assert.match(fr.mdx, /status: example[\s\S]*reviewStatus: unapproved[\s\S]*productionEligible: false/);
    }
  }
});

test("generated MDX byte manifest has exact deterministic EN/FR parity", () => {
  const encoder = new TextEncoder();
  assert.equal(PAGE_COUNT_MANIFEST.byteLengths.length, 192);
  for (const row of PAGE_COUNT_MANIFEST.byteLengths) {
    const en = GENERATED_RECORDS.find((record) => record.kind === row.kind && record.entityId === row.entityId && record.locale === "en")!;
    const fr = GENERATED_RECORDS.find((record) => record.kind === row.kind && record.entityId === row.entityId && record.locale === "fr")!;
    assert.equal(row.en, encoder.encode(en.mdx).byteLength);
    assert.equal(row.fr, encoder.encode(fr.mdx).byteLength);
  }
});

test("localized dynamic routes are exhaustively static and metadata comes from paired records", () => {
  const routePaths = ["../app/en/places/[placeId]/page.tsx", "../app/fr/lieux/[placeId]/page.tsx", "../app/en/location/[locationId]/page.tsx", "../app/fr/emplacement/[locationId]/page.tsx"];
  for (const path of routePaths) {
    const route = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(route, /export const dynamic = "force-static"/);
    assert.match(route, /export const dynamicParams = false/);
    assert.match(route, /generateStaticParams\(\)/);
    assert.match(route, /localizedRecord/);
  }
});

test("place and location renderers expose no direct numeric-field interpolation", () => {
  const files = ["../components/places/PlacePage.tsx", "../components/places/LocationResult.tsx", "../components/places/AnnualChangeChart.tsx"];
  const combined = files.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  assert.match(combined, /PublicNumberValue/);
  assert.doesNotMatch(combined, /<(?:dd|td|p|h[1-6]|span|output)>\{(?:place\.forestHectares|location\.(?:latitude|longitude|accuracyMetres)|row\.(?:year|hectares)|event\.year)\}/);
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /--record-serif: Georgia/);
  assert.match(styles, /\.generated-record h1,[\s\S]*font-family: var\(--record-serif\)/);
});

test("annual table has a caption and scoped column headers", () => {
  const chart = readFileSync(new URL("../components/places/AnnualChangeChart.tsx", import.meta.url), "utf8");
  assert.match(chart, /<caption>\{title\}<\/caption>/);
  assert.equal((chart.match(/<th scope="col">/g) ?? []).length, 3);
});

test("all generated Figure and Unknown markup keeps localized evidence, coverage, reason and provenance without JavaScript", () => {
  for (const entry of PLACE_REGISTRY) for (const locale of ["en", "fr"] as const) {
    const html = `${renderToStaticMarkup(<PlacePage locale={locale} entry={entry} view="table" />)}${renderToStaticMarkup(<LocationResult locale={locale} location={entry.location} places={PLACES} />)}`;
    const values = [...html.matchAll(/<section class="public-number" data-public-number="(figure|unknown)" data-locale="(en|fr)">([\s\S]*?)<\/section>/g)];
    assert.ok(values.length > 0);
    for (const [, kind, renderedLocale, value] of values) {
      assert.equal(renderedLocale, locale);
      assert.match(value, locale === "en" ? /(?:Official record|Satellite observation|Derived estimate|Unknown)/ : /(?:Registre officiel|Observation satellitaire|Estimation dérivée|Inconnu)/);
      assert.match(value, locale === "en" ? /(?:Enhanced local records|National baseline(?: plus local context)?|Extended record, sparse official matching|Not applicable)/ : /(?:Registres locaux enrichis|Référence nationale(?: avec contexte local)?|Registre prolongé, appariement officiel limité|Sans objet)/);
      assert.match(value, locale === "en" ? /<dt>Dataset<\/dt>[\s\S]*<dt>Version<\/dt>[\s\S]*<dt>Retrieved<\/dt>[\s\S]*<dt>Licence<\/dt>/ : /<dt>Jeu de données<\/dt>[\s\S]*<dt>Version<\/dt>[\s\S]*<dt>Récupéré<\/dt>[\s\S]*<dt>Licence<\/dt>/);
      if (kind === "unknown") assert.match(value, /<output aria-label="[^"]+">— [^<]+<\/output>/);
    }
  }
});
