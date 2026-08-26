import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { LOCATIONS, PLACES, validatePhase3ExampleRegistry } from "../lib/places/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PlacePage } from "../components/places/PlacePage.tsx";

test("Phase 3 synthetic registry covers every Big Four province and place type with paired static pages", () => {
  assert.deepEqual(validatePhase3ExampleRegistry(), { places: 32, locations: 32, locales: 2, localizedStaticPages: 128, placeTypes: 8, provinces: 4 });
  assert.ok(PLACES.every((place) => place.status === "example"));
  assert.ok(LOCATIONS.every((location) => location.status === "example"));
});

test("registry fails closed for missing cross-product records, untranslated Unknowns, or fabricated production data", () => {
  assert.throws(() => validatePhase3ExampleRegistry(PLACES.slice(1), LOCATIONS.slice(1)), /cross-product/);
  const first = PLACES[0]!;
  const untranslatedUnknown = { ...first, stats: first.stats.map((stat) => stat.kind === "unknown" ? { ...stat, reason: { ...stat.reason, fr: "" } } : stat) };
  assert.throws(() => validatePhase3ExampleRegistry([untranslatedUnknown, ...PLACES.slice(1)], LOCATIONS), /bilingual reason/);
  assert.throws(() => validatePhase3ExampleRegistry([{ ...first, status: "production" as never }, ...PLACES.slice(1)], LOCATIONS), /only example/);
});

test("French Unknown output retains an en dash and its French reason rather than an English fallback or zero", () => {
  const html = renderToStaticMarkup(<PlacePage locale="fr" place={PLACES[0]!} view="table" />);
  assert.match(html, /– Aucun registre public faisant autorité n/);
  assert.doesNotMatch(html, /– No authoritative public record/);
  assert.doesNotMatch(html, />0</);
});
