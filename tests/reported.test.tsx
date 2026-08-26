import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportedValue } from "../components/policy/ReportedValue";
import { EVIDENCE_CLASSES, EVIDENCE_DEFINITIONS, formatReported, GLOSSARY, isEvidenceClass, type Figure, type Unknown } from "../lib/domain";

const unknown: Unknown = {
  kind: "unknown",
  evidence: "unknown",
  reason: { en: "No authoritative record has been integrated.", fr: "Aucun registre faisant autorité n’a été intégré." },
  coverageGrade: "national-baseline",
};

const percentage: Figure = {
  kind: "figure",
  value: 12.5,
  unit: "%",
  evidence: "satellite-observation",
  confidence: { level: "medium", ruleId: "CONF-MEDIUM-001", reason: { en: "Strong evidence with a material limitation.", fr: "Preuve solide comportant une limite importante." } },
  provenance: { dataset: "Example", version: "1", retrievedDate: "2026-08-25", licence: "ogl-canada-2.0" },
};

test("Unknown formatting selects the requested language and never becomes zero", () => {
  assert.equal(formatReported(unknown, "en"), "— No authoritative record has been integrated.");
  assert.equal(formatReported(unknown, "fr"), "— Aucun registre faisant autorité n’a été intégré.");
  assert.equal(formatReported(unknown, "fr").includes("0"), false);
});

test("every percentage links to the versioned forest definition", () => {
  const english = renderToStaticMarkup(<ReportedValue reported={percentage} coverageGrade="national-baseline" locale="en" />);
  const french = renderToStaticMarkup(<ReportedValue reported={percentage} coverageGrade="national-baseline" locale="fr" />);
  assert.match(english, /href="\/en\/glossary#forest"/);
  assert.match(french, /href="\/fr\/glossaire#forest"/);
});

test("the complete bilingual plan-seed glossary remains present", () => {
  assert.equal(GLOSSARY.length, 14);
  assert.equal(new Set(GLOSSARY.map((entry) => entry.id)).size, GLOSSARY.length);
  assert.ok(GLOSSARY.every((entry) => entry.term.en.trim() && entry.term.fr.trim() && entry.definition.en.trim() && entry.definition.fr.trim()));
  const forest = GLOSSARY.find((entry) => entry.id === "forest");
  assert.ok(forest);
  assert.match(forest.definition.en, /For a future production calculation/);
  assert.match(forest.definition.fr, /Pour un futur calcul de production/);
  assert.doesNotMatch(forest.definition.en, /Witness Tree applies/i);
});

test("all and only the four evidence classes carry bilingual claim rules", () => {
  assert.deepEqual(EVIDENCE_CLASSES, ["official-record", "satellite-observation", "derived-estimate", "unknown"]);
  for (const evidence of EVIDENCE_CLASSES) {
    assert.equal(isEvidenceClass(evidence), true);
    const definition = EVIDENCE_DEFINITIONS[evidence];
    assert.ok(definition.label.en.trim() && definition.label.fr.trim());
    assert.ok(definition.maySay.en.trim() && definition.maySay.fr.trim());
    assert.ok(definition.mayNotSay.en.trim() && definition.mayNotSay.fr.trim());
  }
  assert.equal(isEvidenceClass("missing"), false);
});
