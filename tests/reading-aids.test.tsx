import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ComponentGallery } from "../components/gallery/ComponentGallery";
import { SiteFooter } from "../components/site/SiteFooter";
import { MethodologyPage } from "../components/transparency/MethodologyPage";
import { UnknownAtlasPage } from "../components/transparency/UnknownAtlasPage";

/*
 * Methods is the way in to the reading aids: the glossary, how figures are
 * marked and what the record cannot see (audit 2026-11-10, L5). The pages keep
 * their own addresses; they are linked, not merged or redirected.
 */
const ROUTES = {
  en: { methods: "/en/methods", glossary: "/en/glossary", marks: "/en/components", unknown: "/en/unknown" },
  fr: { methods: "/fr/methodes", glossary: "/fr/glossaire", marks: "/fr/composants", unknown: "/fr/inconnu" },
} as const;
const LABEL = { en: "Reading aids", fr: "Aides à la lecture" } as const;

const pages = [
  ["methods", (locale: "en" | "fr") => renderToStaticMarkup(createElement(MethodologyPage, { locale }))],
  ["marks", (locale: "en" | "fr") => renderToStaticMarkup(createElement(ComponentGallery, { locale }))],
  ["unknown", (locale: "en" | "fr") => renderToStaticMarkup(createElement(UnknownAtlasPage, { locale }))],
] as const;

test("Methods, the marks page and the Unknown page each link the other reading aids from their masthead", () => {
  for (const locale of ["en", "fr"] as const) {
    for (const [current, render] of pages) {
      const markup = render(locale);
      const masthead = markup.slice(markup.indexOf('<header class="masthead">'), markup.indexOf("</header>"));
      const start = masthead.indexOf(`<nav class="reading-aids" aria-label="${LABEL[locale]}">`);
      assert.ok(start > masthead.indexOf("</h1>"), `${locale} ${current}: the row sits in the masthead, under the title`);
      const nav = masthead.slice(start, masthead.indexOf("</nav>", start));
      const links = [...nav.matchAll(/<a href="([^"]+)">/g)].map((match) => match[1]);
      const expected = Object.entries(ROUTES[locale]).filter(([id]) => id !== current).map(([, href]) => href);
      assert.deepEqual(links, expected, `${locale} ${current}`);
      // The page the reader is on is named, not linked to itself.
      assert.match(nav, /<span aria-current="page">[^<]+<\/span>/);
      assert.equal((markup.match(/class="reading-aids"/g) ?? []).length, 1);
    }
  }
});

test("the footer leads to Methods and keeps the Glossary", () => {
  for (const locale of ["en", "fr"] as const) {
    const footer = renderToStaticMarkup(createElement(SiteFooter, { locale }));
    const hrefs = [...footer.matchAll(/<a href="([^"]+)">/g)].map((match) => match[1]);
    assert.equal(hrefs[0], ROUTES[locale].methods);
    assert.ok(hrefs.includes(ROUTES[locale].glossary));
  }
});

test("all four pages keep their own routes; nothing is redirected", () => {
  for (const locale of ["en", "fr"] as const) {
    for (const route of Object.values(ROUTES[locale])) {
      assert.ok(existsSync(new URL(`../app${route}/page.tsx`, import.meta.url)), route);
    }
  }
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const route of [...Object.values(ROUTES.en), ...Object.values(ROUTES.fr)]) {
    assert.doesNotMatch(config, new RegExp(`source: "${route}"`), route);
  }
});
