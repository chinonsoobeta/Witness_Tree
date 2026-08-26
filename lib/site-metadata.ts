import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE, type Locale } from "@/lib/domain";

/**
 * Metadata every root layout shares. There is no single root layout to inherit
 * it from: each locale owns its own `<html>` element so the document language
 * is correct, which means each root layout has to export the whole record.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL("https://witness-tree-canada.r7bv67rgkk.chatgpt.site"),
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
    images: [{ url: "/og.png", width: 1731, height: 909, alt: `${PRODUCT_NAME.en} / ${PRODUCT_NAME.fr}` }],
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
