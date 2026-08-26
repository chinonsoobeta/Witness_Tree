import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";
import "@bcgov/bc-sans/css/BC_Sans.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/app/globals.css";

/**
 * The document shell, and the single place the root stylesheets are imported.
 *
 * Every root layout renders exactly one of these, so the language a route
 * serves is the document language. A `lang` attribute on a wrapper element
 * inside `<body>` scopes pronunciation for content in that subtree, but it is
 * not the document language: assistive technology reads `<html lang>` to pick
 * the voice and language profile for the page as a whole, and a screen reader
 * announcing French prose under `<html lang="en">` is the defect this fixes.
 */
export function Document({ lang, children }: { lang: Locale; children: ReactNode }) {
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
