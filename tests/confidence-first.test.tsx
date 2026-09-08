import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageStatement } from "../components/policy/CoverageStatement";
import { EvidenceLegend } from "../components/policy/EvidenceLegend";
import { EVIDENCE_CLASSES, EVIDENCE_DEFINITIONS } from "../lib/domain";
import { ratio } from "../scripts/check-contrast.mjs";

for (const locale of ["en", "fr"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`coverage statement and evidence legend retain their meaning in ${locale} ${theme}`, () => {
      const reason = locale === "en" ? "No record is held for this question." : "Aucun registre n’est détenu pour cette question.";
      const markup = renderToStaticMarkup(
        <section data-theme={theme}>
          <CoverageStatement locale={locale}><p>{reason}</p></CoverageStatement>
          <EvidenceLegend locale={locale} />
        </section>,
      );
      assert.ok(markup.includes(reason));
      assert.ok(markup.includes(locale === "en" ? "What this view can tell you" : "Ce que cette vue permet de savoir"));
      assert.equal((markup.match(/<li>/g) ?? []).length, 4);
      for (const evidence of EVIDENCE_CLASSES) assert.ok(markup.includes(EVIDENCE_DEFINITIONS[evidence].label[locale]));
      for (const shape of ["■", "●", "▲", "○"]) assert.ok(markup.includes(shape));
      assert.doesNotMatch(markup, />0</);
    });
  }
}

test("topbar stays dark with readable text and control edges in every palette", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const palettes = [...css.matchAll(/(?:^|\n)\s*(?::root|:root:not\(\[data-theme="light"\]\)|\[data-theme="(?:light|dark)"\]) \{([^}]+)\}/g)];
  assert.equal(palettes.length, 4);
  for (const [, block] of palettes) {
    const tokens = Object.fromEntries([...block.matchAll(/--topbar-([\w-]+):\s*(#[\da-f]+);/g)].map((match) => [match[1], match[2]]));
    assert.equal(Object.keys(tokens).length, 5);
    for (const ink of ["ink", "ink-2"]) assert.ok(ratio(tokens[ink], tokens.fill) >= 4.5);
    for (const edge of ["edge", "accent"]) assert.ok(ratio(tokens[edge], tokens.fill) >= 3);
  }
});
