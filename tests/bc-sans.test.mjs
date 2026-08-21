import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("each static locale root uses the bounded BC Sans declaration and primary family", async () => {
  const [enLayout, frLayout, gatewayLayout, fonts, styles, manifest] = await Promise.all([
    read("../app/en/layout.tsx"), read("../app/fr/layout.tsx"), read("../app/(gateway)/layout.tsx"), read("../app/site-fonts.css"), read("../app/globals.css"), read("../package.json"),
  ]);
  for (const layout of [enLayout, frLayout, gatewayLayout]) assert.match(layout, /site-fonts\.css/);
  assert.equal((fonts.match(/font-family: "BC Sans"/g) ?? []).length, 2);
  assert.equal((fonts.match(/font-display: optional/g) ?? []).length, 2);
  assert.equal((fonts.match(/\.woff2/g) ?? []).length, 2);
  assert.equal(fonts.includes(".woff\""), false);
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
