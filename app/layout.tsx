import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_PURPOSE } from "@/lib/domain";
import "@bcgov/bc-sans/css/BC_Sans.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
