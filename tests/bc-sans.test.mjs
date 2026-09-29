import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("BC Sans is imported once at the root and used as the primary family", async () => {
  const [shell, styles, manifest] = await Promise.all([
    read("../components/site/Document.tsx"), read("../app/globals.css"), read("../package.json"),
  ]);
  assert.equal((shell.match(/@bcgov\/bc-sans\/css\/BC_Sans\.css/g) ?? []).length, 1);
  assert.match(styles, /--ui: "BC Sans", "Noto Sans", Verdana, Arial, sans-serif;/);
  assert.match(styles, /body \{[\s\S]*font-family: var\(--ui\);/);
  assert.match(styles, /h1,\s*h2,\s*h3,\s*h4\s*\{\s*font-family: var\(--ui\);\s*\}/);
  assert.equal(JSON.parse(manifest).dependencies["@bcgov/bc-sans"], "^2.1.0");
});

test("BC Sans licence attribution is retained", async () => {
  const notice = await read("../docs/THIRD_PARTY.md");
  assert.match(notice, /@bcgov\/bc-sans/);
  assert.match(notice, /SIL Open Font License 1\.1/);
  assert.match(notice, /Apache-2\.0/);
  assert.match(notice, /https:\/\/github\.com\/bcgov\/bc-sans/);
});

test("no rule asks for a weight BC Sans does not ship", async () => {
  // The family has 300, 400 and 700 and nothing between. A 500 or a 600 is
  // synthesised by the browser, which is what made the figures read as soft.
  const styles = await read("../app/globals.css");
  const synthesised = styles.match(/font-weight: (500|600)\b/g) ?? [];
  assert.deepEqual(synthesised, [], "BC Sans ships 300, 400 and 700 only");
});

test("figures are set in BC Sans, not in a machine's own monospace", async () => {
  // --mono resolves to a different face on every visitor's machine. It used
  // to set every figure on the site; it is now reserved for the machine
  // identifiers inside <code>.
  const styles = await read("../app/globals.css");
  const uses = styles.match(/font-family: var\(--mono\);/g) ?? [];
  assert.equal(uses.length, 1, "only .confidence-rules code may use --mono");
  assert.match(styles, /\.confidence-rules code \{[^}]*font-family: var\(--mono\);/);

  // Every surface that prints a figure has to ask for tabular lining
  // numerals: BC Sans carries oldstyle figures too, and a column of them
  // in a data table would be a real defect.
  for (const rule of [".annual-label,\n.annual-value", ".comparison-figures", ".year-scale", ".provenance dd", ".stat dt"]) {
    const selector = rule.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const block = new RegExp(`${selector} \\{[^}]*font-variant-numeric: tabular-nums lining-nums;`, "u");
    assert.match(styles, block, `${rule} must set tabular lining numerals`);
  }
});
