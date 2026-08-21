import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkVisualAccessibility } from "../scripts/check-visual-accessibility.mjs";

test("canonical palettes, CVD proxies and non-colour cues pass", async () => {
  assert.deepEqual(await checkVisualAccessibility(), { palettes: 2, cvdModels: 3 });
});

test("gate rejects a plausible palette whose semantic colours collapse", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "phase3-colour-"));
  const canonical = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/globals.css", import.meta.url), "utf8"));
  const cssPath = path.join(root, "globals.css");
  await writeFile(cssPath, canonical.replace("--fire: #eb6834", "--fire: #2a78d6"));
  await assert.rejects(checkVisualAccessibility({ cssPath }), /collapse under/);
});

test("gate rejects colour-only evidence and confidence components", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "phase3-cues-"));
  const evidencePath = path.join(root, "EvidenceChip.tsx");
  const confidencePath = path.join(root, "ConfidenceBadge.tsx");
  await writeFile(evidencePath, "export const Chip = () => <span style={{color: 'red'}}>status</span>;");
  await writeFile(confidencePath, "export const Badge = () => <span style={{color: 'green'}}>status</span>;");
  await assert.rejects(checkVisualAccessibility({ evidencePath, confidencePath }), /non-colour shape|bars plus localized text/);
});
