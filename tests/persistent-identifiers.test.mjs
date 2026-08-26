import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkPersistentIdentifiers, identifierForms } from "../scripts/check-persistent-identifiers.mjs";

const brand = (en, fr) => `import type { LocalizedString } from "./localized";\nexport const PRODUCT_NAME: LocalizedString = Object.freeze({ en: "${en}", fr: "${fr}" });\n`;

async function fixture({ en = "Witness Tree", fr = "Arbre témoin", routes = ["en", "fr"], literal = "/en/places" } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "persistent-identifier-"));
  await mkdir(path.join(root, "lib/domain"), { recursive: true });
  await writeFile(path.join(root, "lib/domain/brand.ts"), brand(en, fr));
  await mkdir(path.join(root, "components"), { recursive: true });
  for (const route of routes) await mkdir(path.join(root, "app", route), { recursive: true });
  await writeFile(path.join(root, "app/page.tsx"), `export const home = "${literal}";\n`);
  return root;
}

test("the repository carries the product name in no route segment and no path literal", async () => { const result = await checkPersistentIdentifiers(); assert.ok(result.routeSegments > 0 && result.pathLiterals > 0); });

test("identifier forms cover the joined, accent-stripped spellings of both names", () => { const forms = identifierForms(["Witness Tree", "Arbre témoin"]); for (const form of ["witnesstree", "witness-tree", "witness_tree", "arbretemoin", "arbre-temoin"]) assert.ok(forms.includes(form), `missing ${form}`); assert.equal(forms.includes("arbre-témoin"), false); });

test("a route segment carrying the product name fails the gate", async () => { const root = await fixture({ routes: ["en", "witness-tree"] }); await assert.rejects(() => checkPersistentIdentifiers(root), /route segment carries the product name/); });

test("a path literal carrying the product name fails the gate, accents and separators notwithstanding", async () => { for (const literal of ["/en/witness-tree/places", "/fr/arbre-temoin", "/fr/arbre_temoin"]) { const root = await fixture({ literal }); await assert.rejects(() => checkPersistentIdentifiers(root), /carries the product name/, literal); } });

test("the gate follows the brand token, so a rename changes what it rejects", async () => { const renamed = { en: "Forest Record", fr: "Registre forestier" }; const stillClean = await fixture({ ...renamed, routes: ["en", "witness-tree"] }); assert.ok(await checkPersistentIdentifiers(stillClean)); const nowDirty = await fixture({ ...renamed, literal: "/en/forest-record" }); await assert.rejects(() => checkPersistentIdentifiers(nowDirty), /carries the product name/); });

test("the gate fails closed when the brand token does not declare both names", async () => { const root = await fixture(); await writeFile(path.join(root, "lib/domain/brand.ts"), 'export const PRODUCT_NAME = Object.freeze({ en: "Only English" });\n'); await assert.rejects(() => checkPersistentIdentifiers(root), /English and a French product name/); });
