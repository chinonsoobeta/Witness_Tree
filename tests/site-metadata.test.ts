import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import nextConfig
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../next.config.ts";
import robots
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/robots.ts";
import sitemap
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/sitemap.ts";
import {
  gatewayAlternates,
  localizedAlternates,
  PUBLIC_LOCALE_ROUTE_PAIRS,
  PUBLIC_ROUTE_TEXT,
  routeMetadata,
  SITE_ORIGIN,
  siteMetadata,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/site-metadata.ts";
import {
  PRODUCT_NAME,
  PRODUCT_PURPOSE,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/domain/brand.ts";

test("the shared metadata uses the canonical public host and compressed social card", async () => {
  assert.ok(siteMetadata.metadataBase instanceof URL);
  assert.equal(siteMetadata.metadataBase.href, SITE_ORIGIN + "/");

  const images = (siteMetadata.openGraph as { images?: Array<{ width?: number; height?: number }> }).images;
  assert.deepEqual(images?.map(({ width, height }) => ({ width, height })), [{ width: 1200, height: 630 }]);

  const bytes = await readFile(new URL("../public/og.png", import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual(
    { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
    { width: 1200, height: 630 },
  );
  assert.ok(bytes.byteLength < 200_000, "Expected og.png below 200 KB, found " + bytes.byteLength + " bytes.");
});

test("localized canonical records and the gateway x-default are explicit", () => {
  assert.deepEqual(
    localizedAlternates("en", { en: "/en/example", fr: "/fr/exemple" }),
    {
      canonical: "/en/example",
      languages: { en: "/en/example", fr: "/fr/exemple" },
    },
  );
  assert.deepEqual(gatewayAlternates, {
    canonical: "/",
    languages: { en: "/en", fr: "/fr", "x-default": "/" },
  });
});

test("every public sitemap page declares its locale-specific canonical", async () => {
  for (const paths of PUBLIC_LOCALE_ROUTE_PAIRS) {
    for (const locale of ["en", "fr"] as const) {
      const source = await readFile(new URL("../app" + paths[locale] + "/page.tsx", import.meta.url), "utf8");
      assert.match(source, new RegExp('routeMetadata\\("' + locale + '"'), "Missing " + locale + " metadata on " + paths[locale] + ".");
      assert.deepEqual(routeMetadata(locale, paths).alternates, localizedAlternates(locale, paths));
    }
  }
});

test("every public route has its own title and description in each language", () => {
  for (const locale of ["en", "fr"] as const) {
    const titles = new Set<string>();
    for (const paths of PUBLIC_LOCALE_ROUTE_PAIRS) {
      const text = PUBLIC_ROUTE_TEXT[paths.en];
      const metadata = routeMetadata(locale, paths);
      const description = metadata.description ?? "";
      assert.ok(description.length > 0, "No description on " + paths[locale] + ".");
      assert.notEqual(description, PRODUCT_PURPOSE[locale], paths[locale] + " repeats the site description.");
      assert.ok(description.length <= 160, paths[locale] + " description is " + description.length + " characters.");
      assert.equal((description.match(/[.?!](?=\s|$)/g) ?? []).length, 1, paths[locale] + " description is not one sentence.");
      assert.ok(!titles.has(text.title[locale]), paths[locale] + " shares its title with another page.");
      titles.add(text.title[locale]);
      // The rendered title, with the product name the template adds.
      const rendered = text.title[locale] + " · " + PRODUCT_NAME[locale];
      assert.ok(rendered.length <= 60, paths[locale] + " title is " + rendered.length + " characters.");
      assert.ok(!text.title[locale].includes(PRODUCT_NAME[locale]), paths[locale] + " title repeats the product name.");
    }
    assert.ok(!titles.has(PRODUCT_NAME[locale]));
  }
  // The home page shares its segment with the layout, so the template does not
  // reach it and it carries the product name itself.
  assert.deepEqual(routeMetadata("en", PUBLIC_LOCALE_ROUTE_PAIRS[0]).title, { absolute: PUBLIC_ROUTE_TEXT["/en"].title.en + " · " + PRODUCT_NAME.en });
  assert.equal(routeMetadata("fr", PUBLIC_LOCALE_ROUTE_PAIRS[1]).title, PUBLIC_ROUTE_TEXT["/en/explore"].title.fr);
});

test("robots and sitemap expose both locales without fixture routes", () => {
  const robotsRecord = robots();
  assert.deepEqual(robotsRecord.rules, { userAgent: "*", allow: "/" });
  assert.equal(robotsRecord.sitemap, SITE_ORIGIN + "/sitemap.xml");
  assert.equal(robotsRecord.host, SITE_ORIGIN);

  const entries = sitemap();
  assert.equal(entries.length, 1 + PUBLIC_LOCALE_ROUTE_PAIRS.length * 2);
  const urls = entries.map(({ url }) => url);
  assert.equal(urls[0], SITE_ORIGIN);
  for (const paths of PUBLIC_LOCALE_ROUTE_PAIRS) {
    assert.ok(urls.includes(SITE_ORIGIN + paths.en));
    assert.ok(urls.includes(SITE_ORIGIN + paths.fr));
  }
  assert.ok(urls.includes(SITE_ORIGIN + "/en/components"));
  assert.ok(urls.includes(SITE_ORIGIN + "/fr/composants"));
  assert.ok(urls.includes(SITE_ORIGIN + "/en/explore/draw"));
  assert.ok(urls.includes(SITE_ORIGIN + "/fr/explorer/dessiner"));
  assert.equal(urls.some((url) => /\/(?:places|lieux|location|emplacement)\//.test(url)), false);
  assert.equal(entries[0]?.alternates?.languages?.["x-default"], SITE_ORIGIN);
});

test("fixture place and location routes are noindex", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app/en/places/[placeId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fr/lieux/[placeId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/en/location/[locationId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fr/emplacement/[locationId]/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.match(source, /robots: \{ index: false, follow: false \}/);
  }
});

test("the apex host permanently redirects to www without changing the path", async () => {
  assert.equal(typeof nextConfig.redirects, "function");
  const redirects = await nextConfig.redirects!();
  assert.deepEqual(redirects, [
    {
      source: "/:path*",
      has: [{ type: "host", value: "witnesstree.ca" }],
      destination: "https://www.witnesstree.ca/:path*",
      permanent: true,
    },
  ]);
});
