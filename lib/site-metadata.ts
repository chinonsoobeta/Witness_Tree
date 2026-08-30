import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE, type Locale } from "@/lib/domain";

export const SITE_ORIGIN = "https://www.witnesstree.ca";

export const PUBLIC_LOCALE_ROUTE_PAIRS = [
  { en: "/en", fr: "/fr" },
  { en: "/en/explore", fr: "/fr/explorer" },
  { en: "/en/compare", fr: "/fr/comparer" },
  { en: "/en/search", fr: "/fr/recherche" },
  { en: "/en/methods", fr: "/fr/methodes" },
  { en: "/en/data", fr: "/fr/donnees" },
  { en: "/en/data/official-harvest-comparison", fr: "/fr/donnees/comparaison-recolte-officielle" },
  { en: "/en/wildfire", fr: "/fr/incendies" },
  { en: "/en/about", fr: "/fr/a-propos" },
  { en: "/en/account", fr: "/fr/compte" },
  { en: "/en/components", fr: "/fr/composants" },
  { en: "/en/glossary", fr: "/fr/glossaire" },
  { en: "/en/corrections", fr: "/fr/corrections" },
  { en: "/en/decisions", fr: "/fr/decisions" },
  { en: "/en/engagement", fr: "/fr/dialogue" },
  { en: "/en/privacy", fr: "/fr/confidentialite" },
  { en: "/en/terms", fr: "/fr/conditions" },
  { en: "/en/releases", fr: "/fr/versions" },
] as const;

/**
 * Metadata every root layout shares. There is no single root layout to inherit
 * it from: each locale owns its own `<html>` element so the document language
 * is correct, which means each root layout has to export the whole record.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: PRODUCT_NAME.en,
    template: `%s · ${PRODUCT_NAME.en}`,
  },
  description: PRODUCT_PURPOSE.en,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    title: PRODUCT_NAME.en,
    description: PRODUCT_PURPOSE.en,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${PRODUCT_NAME.en} / ${PRODUCT_NAME.fr}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME.en,
    description: PRODUCT_PURPOSE.en,
    images: ["/og.png"],
  },
};

/** The shared record plus the served language, for a locale root layout. */
export function localeMetadata(locale: Locale): Metadata {
  return { ...siteMetadata, other: { "content-language": locale } };
}

export function localizedAlternates(
  locale: Locale,
  paths: Readonly<{ en: string; fr: string }>,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: paths[locale],
    languages: { en: paths.en, fr: paths.fr },
  };
}

export const gatewayAlternates: NonNullable<Metadata["alternates"]> = {
  canonical: "/",
  languages: { en: "/en", fr: "/fr", "x-default": "/" },
};
