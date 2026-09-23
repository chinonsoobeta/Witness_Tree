import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverageStatement } from "../components/policy/CoverageStatement";
import { EvidenceKey } from "../components/policy/EvidenceKey";
import { EVIDENCE_CLASSES, EVIDENCE_DEFINITIONS } from "../lib/domain";
import { ratio } from "../scripts/check-contrast.mjs";

for (const locale of ["en", "fr"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`coverage note and evidence key retain their meaning in ${locale} ${theme}`, () => {
      const reason = locale === "en" ? "No record is held for this question." : "Aucun registre n’est détenu pour cette question.";
      const markup = renderToStaticMarkup(
        <section data-theme={theme}>
          <CoverageStatement locale={locale}><p>{reason}</p></CoverageStatement>
          <EvidenceKey locale={locale} classes={EVIDENCE_CLASSES} />
        </section>,
      );
      assert.ok(markup.includes(reason));
      assert.match(markup, /<details class="coverage-note">/);
      assert.ok(markup.includes(locale === "en" ? "What these figures can’t tell you" : "Ce que ces chiffres ne disent pas"));
      assert.equal((markup.match(/class="evidence-key-item"/g) ?? []).length, 4);
      for (const evidence of EVIDENCE_CLASSES) assert.ok(markup.includes(EVIDENCE_DEFINITIONS[evidence].label[locale]));
      assert.doesNotMatch(markup, />0</);
    });
  }
}

test("the evidence key lists only the classes shown beside it", () => {
  const markup = renderToStaticMarkup(<EvidenceKey locale="en" classes={["unknown", "satellite-observation"]} />);
  assert.equal((markup.match(/class="evidence-key-item"/g) ?? []).length, 2);
  assert.ok(markup.indexOf(EVIDENCE_DEFINITIONS["satellite-observation"].label.en) < markup.indexOf(EVIDENCE_DEFINITIONS.unknown.label.en));
  assert.equal(renderToStaticMarkup(<EvidenceKey locale="en" classes={[]} />), "");
});

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
