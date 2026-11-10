import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const faces = (css) => [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((match) => {
  const body = match[1];
  const field = (name) => body.match(new RegExp(`${name}: ([^;]+);`))?.[1].trim();
  return { family: field("font-family"), style: field("font-style"), weight: field("font-weight"), display: field("font-display"), src: field("src") };
});

/*
 * The package stylesheet declares BC Sans without font-display, so text stayed
 * hidden until the files arrived and the page loaded as a blank ground, most
 * visibly on the default System theme (audit 2026-11-10, L4). The root
 * stylesheet declares the same faces again, from the same package files, with
 * font-display: swap, so text shows at once in the fallback face.
 */
test("every BC Sans face the package declares is declared again with font-display: swap", () => {
  const packaged = faces(read("../node_modules/@bcgov/bc-sans/css/BC_Sans.css"));
  const root = faces(read("../app/globals.css")).filter((face) => face.family === '"BC Sans"');
  assert.equal(packaged.length, 6);
  const key = (face) => `${face.style} ${face.weight}`;
  assert.deepEqual(root.map(key).sort(), packaged.map(key).sort());
  for (const face of root) {
    assert.equal(face.display, "swap", `${key(face)} must not hide text while it loads`);
    // The same unmodified package files, not a copy.
    const files = [...face.src.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
    assert.equal(files.length, 2);
    for (const file of files) {
      assert.match(file, /^\.\.\/node_modules\/@bcgov\/bc-sans\/fonts\/BCSans-[A-Za-z]+\.woff2?$/);
      assert.ok(existsSync(new URL(file, new URL("../app/globals.css", import.meta.url))), file);
    }
  }
});

test("the root stylesheet comes after the package one, so its faces are the ones used", () => {
  const shell = read("../components/site/Document.tsx");
  const packaged = shell.indexOf('import "@bcgov/bc-sans/css/BC_Sans.css";');
  const root = shell.indexOf('import "@/app/globals.css";');
  assert.ok(packaged >= 0 && root > packaged);
  // No new script: the fix is a stylesheet descriptor, nothing the CSP refuses.
  assert.equal((shell.match(/<script/g) ?? []).length, 1);
});
