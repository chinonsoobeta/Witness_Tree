import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("BC Sans is imported once at the root and used as the primary family", async () => {
  const [layout, styles, manifest] = await Promise.all([
    read("../app/layout.tsx"), read("../app/globals.css"), read("../package.json"),
  ]);
  assert.equal((layout.match(/@bcgov\/bc-sans\/css\/BC_Sans\.css/g) ?? []).length, 1);
  assert.match(styles, /--ui: "BC Sans", "Noto Sans", Verdana, Arial, sans-serif;/);
  assert.match(styles, /body \{[\s\S]*font-family: var\(--ui\);/);
  assert.match(styles, /h1, h2, h3, h4 \{ font-family: var\(--ui\); \}/);
  assert.equal(JSON.parse(manifest).dependencies["@bcgov/bc-sans"], "^2.1.0");
});

test("BC Sans licence attribution is retained", async () => {
  const notice = await read("../docs/THIRD_PARTY.md");
  assert.match(notice, /@bcgov\/bc-sans/);
  assert.match(notice, /SIL Open Font License 1\.1/);
  assert.match(notice, /Apache-2\.0/);
  assert.match(notice, /https:\/\/github\.com\/bcgov\/bc-sans/);
});
