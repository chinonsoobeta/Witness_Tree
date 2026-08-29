import type { ReactNode } from "react";
import type { Locale } from "@/lib/domain";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
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
  // The boot script below sets data-theme on the root element before React
  // hydrates, so the server markup and the live DOM differ there by design.
  // Suppression is scoped to that one element's own attributes; its children
  // are still checked.
  return (
    <html lang={lang} suppressHydrationWarning>
      <body>
        {/*
          The stored colour theme, applied before anything paints.

          It is the first node in the body rather than a head script because this
          shell owns no <head>; the framework composes that. Position still gets
          what is needed: the script is synchronous and precedes every element it
          affects, so the attribute is on the root element before the first paint
          and no reader sees a flash of the palette they did not choose.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
