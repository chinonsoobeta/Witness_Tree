import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { SiteShell } from "../components/site/SiteShell.tsx";

/*
 * The System / Light / Dark control moved from the header to the footer
 * (audit 2026-11-10, L3): in the header it took the room of three menu items.
 * Every page with the header has the footer, through SiteShell, so the control
 * is still on every page, once, as native radios a keyboard reaches with Tab
 * and moves through with the arrow keys.
 */
test("the colour-theme control is in the footer, once, and not in the header", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<SiteShell locale={locale}><main id="main" /></SiteShell>);
    const header = markup.slice(markup.indexOf('<header class="site-header">'), markup.indexOf("</header>"));
    const footer = markup.slice(markup.indexOf('<footer class="site-footer">'), markup.indexOf("</footer>"));
    assert.doesNotMatch(header, /theme-toggle|type="radio"/);
    assert.equal((markup.match(/class="theme-toggle"/g) ?? []).length, 1);
    assert.match(footer, /<div class="theme-toggle" role="radiogroup" aria-labelledby="witness-tree-theme-label">/);
    assert.match(footer, locale === "en" ? />Colour theme<\/span>/ : />Thème de couleur<\/span>/);
    const radios = [...footer.matchAll(/<input type="radio"[^>]*name="witness-tree-theme-choice"[^>]*value="(\w+)"/g)].map((match) => match[1]);
    assert.deepEqual(radios, ["system", "light", "dark"]);
    // A setting, not a link, so it sits outside the footer's nav landmark.
    const nav = footer.slice(footer.indexOf("<nav"), footer.indexOf("</nav>"));
    assert.doesNotMatch(nav, /theme-toggle/);
    // No tabindex takes it out of the tab order.
    assert.doesNotMatch(footer, /tabindex="-1"/);
  }
});
