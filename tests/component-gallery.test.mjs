import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("English and French gallery routes select their locale", async () => {
  const [english, french] = await Promise.all([
    read("../app/en/components/page.tsx"),
    read("../app/fr/composants/page.tsx"),
  ]);

  assert.match(english, /<ComponentGallery locale="en" \/>/);
  assert.match(french, /<ComponentGallery locale="fr" \/>/);
});

test("gallery retains the required policy representations", async () => {
  const [gallery, evidence, confidence, reported] = await Promise.all([
    read("../components/gallery/ComponentGallery.tsx"),
    read("../components/policy/EvidenceChip.tsx"),
    read("../components/policy/ConfidenceBadge.tsx"),
    read("../components/policy/ReportedValue.tsx"),
  ]);

  assert.match(gallery, /data-theme={theme}/);
  assert.match(gallery, /"official-record", "satellite-observation", "derived-estimate", "unknown"/);
  assert.match(gallery, /"national-baseline", "extended-record-sparse-official-matching", "national-baseline-plus-local-context"/);
  assert.match(evidence, /"official-record": "■"/);
  assert.match(evidence, /"satellite-observation": "●"/);
  assert.match(evidence, /"derived-estimate": "▲"/);
  assert.match(evidence, /unknown: "○"/);
  assert.match(confidence, /\[0, 1, 2\]/);
  assert.match(confidence, /<button type="button"/);
  assert.match(reported, /— {reason}/);
  assert.doesNotMatch(reported.match(/if \(reported.kind === "unknown"\)[\s\S]*?\n {2}}/)?.[0] ?? "", /\b0\b/);
});
