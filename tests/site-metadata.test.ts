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
  SITE_ORIGIN,
  siteMetadata,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/site-metadata.ts";

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
      assert.match(source, new RegExp('localizedAlternates\\("' + locale + '"'), "Missing " + locale + " canonical on " + paths[locale] + ".");
    }
  }
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
