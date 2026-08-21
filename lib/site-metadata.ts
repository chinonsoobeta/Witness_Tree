import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE, type Locale } from "@/lib/domain";

export function siteMetadata(locale: Locale): Metadata {
  return {
    metadataBase: new URL("https://witness-tree-canada.r7bv67rgkk.chatgpt.site"),
    title: { default: PRODUCT_NAME[locale], template: `%s · ${PRODUCT_NAME[locale]}` },
    description: PRODUCT_PURPOSE[locale],
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title: PRODUCT_NAME[locale],
      description: PRODUCT_PURPOSE[locale],
      images: [{ url: "/og.png", width: 1731, height: 909, alt: `${PRODUCT_NAME.en} / ${PRODUCT_NAME.fr}` }],
    },
    twitter: { card: "summary_large_image", title: PRODUCT_NAME[locale], description: PRODUCT_PURPOSE[locale], images: ["/og.png"] },
  };
}
