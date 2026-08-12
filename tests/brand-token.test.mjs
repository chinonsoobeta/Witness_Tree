import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBrandToken } from "../scripts/check-brand-token.mjs";

async function fixture(source) {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-token-"));
  for (const directory of ["app", "components", "lib/domain"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, "lib/domain/brand.ts"), 'export const PRODUCT_NAME = { en: "Witness Tree", fr: "Arbre témoin" };\n');
  await writeFile(path.join(root, "app/page.tsx"), source);
  return root;
}

test("product names may exist only in the localized brand token", async () => {
  const good = await fixture('import { PRODUCT_NAME } from "../lib/domain/brand"; export default () => PRODUCT_NAME.en;\n');
  assert.deepEqual(await checkBrandToken(good), { files: 2 });
  const bad = await fixture('export default () => "Witness Tree";\n');
  await assert.rejects(checkBrandToken(bad), /hard-coded product name/);
});
