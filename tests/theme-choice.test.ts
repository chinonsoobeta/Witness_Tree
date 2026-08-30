import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { THEME_BOOT_SCRIPT, THEME_CHOICES, THEME_STORAGE_KEY, applyTheme, isThemeChoice } from "../lib/theme";

test("the choice set is exactly the three states the stylesheet can express", () => {
  assert.deepEqual([...THEME_CHOICES], ["system", "light", "dark"]);
  for (const choice of THEME_CHOICES) assert.equal(isThemeChoice(choice), true);
  for (const other of ["", "auto", "Dark", null, undefined, 1]) assert.equal(isThemeChoice(other), false);
});

test("system removes the attribute rather than writing a value", () => {
  const attributes = new Map<string, string>();
  const root = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  } as unknown as HTMLElement;

  applyTheme("dark", root);
  assert.equal(attributes.get("data-theme"), "dark");
  applyTheme("light", root);
  assert.equal(attributes.get("data-theme"), "light");
  // The dark palette is scoped to :root:not([data-theme="light"]) inside the
  // system media query, so following the system means carrying no attribute at
  // all. Writing data-theme="system" would pin the page to the light palette.
  applyTheme("system", root);
  assert.equal(attributes.has("data-theme"), false);
});

test("the boot script only ever writes an explicit choice, and never throws", () => {
  assert.match(THEME_BOOT_SCRIPT, /^try\{/);
  assert.match(THEME_BOOT_SCRIPT, /catch\(e\)\{\}$/);
  assert.ok(THEME_BOOT_SCRIPT.includes(JSON.stringify(THEME_STORAGE_KEY)));
  assert.ok(!THEME_BOOT_SCRIPT.includes('"system"'));
  assert.ok(!/<\/script/i.test(THEME_BOOT_SCRIPT));

  // Executed with a stub localStorage rather than asserted by reading: a script
  // that is inlined verbatim into every page is worth actually running.
  const run = (stored: string | null) => {
    let written: string | null = null;
    const document = {
      documentElement: {
        setAttribute: (_name: string, value: string) => void (written = value),
      },
    };
    const localStorage = { getItem: () => stored };
    new Function("document", "localStorage", THEME_BOOT_SCRIPT)(document, localStorage);
    return written;
  };
  assert.equal(run("dark"), "dark");
  assert.equal(run("light"), "light");
  assert.equal(run("system"), null);
  assert.equal(run(null), null);
  assert.equal(run("nonsense"), null);

  const throwing = { getItem: () => { throw new Error("storage is disabled"); } };
  assert.doesNotThrow(() => new Function("document", "localStorage", THEME_BOOT_SCRIPT)({ documentElement: {} }, throwing));
});

test("the document shell inlines the boot script before anything it affects", () => {
  const source = readFileSync(new URL("../components/site/Document.tsx", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("<body>"));
  assert.ok(body.indexOf("THEME_BOOT_SCRIPT") < body.indexOf("{children}"));
});
