import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertDurableIdentifiersAreBrandNeutral,
  assertRenameOutput,
  checkRenameProof,
  simulateProductNameOverride,
} from "../scripts/check-rename-proof.mjs";

function comparisonShareImage(name = "Witness Tree") {
  return {
    id: "comparison-summary-en",
    filename: "comparison-summary-en.svg",
    svg: `<svg><title>${name}</title><text>${name}</text></svg>`,
  };
}

test("durable routes, fixture IDs, release/download/archive fields, and share filenames are brand-neutral", async () => {
  const result = await checkRenameProof();
  assert.ok(result.routeFiles > 0);
  assert.ok(result.durableValues > 0);

  for (const locale of ["en", "fr"]) {
    const image = comparisonShareImage(locale === "en" ? "Witness Tree" : "Arbre témoin");
    assertDurableIdentifiersAreBrandNeutral([image.id, image.filename]);
  }
});

test("a simulated PRODUCT_NAME override changes share-image display text without changing durable identifiers", async () => {
  const original = comparisonShareImage();
  assert.match(original.svg, /Witness Tree/);
  assert.match(
    await readFile(new URL("../lib/comparison/share-image.ts", import.meta.url), "utf8"),
    /PRODUCT_NAME\[locale\]/,
  );

  const renamed = simulateProductNameOverride(original, "Witness Tree", "Mistik");
  assert.equal(renamed.id, original.id);
  assert.equal(renamed.filename, original.filename);
  assert.match(renamed.svg, /Mistik/);
  assertRenameOutput(renamed, "Witness Tree");
});

test("rename proof rejects an old display-name residue and a branded durable identifier", () => {
  const original = comparisonShareImage();
  const renamed = simulateProductNameOverride(original, "Witness Tree", "Mistik");
  assert.throws(() => assertRenameOutput({ ...renamed, svg: `${renamed.svg} Witness Tree` }, "Witness Tree"), /retains old display name/);
  assert.throws(() => assertDurableIdentifiersAreBrandNeutral(["release-Witness Tree-1"]), /Durable identifier/);
});

test("rename-proof gate rejects a branded route, fixture ID, download URL, release ID, archive key, and share filename", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rename-proof-"));
  await mkdir(path.join(root, "app", "Witness Tree"), { recursive: true });
  await mkdir(path.join(root, "data"), { recursive: true });
  await mkdir(path.join(root, "lib"), { recursive: true });
  await writeFile(path.join(root, "data", "fixture.json"), JSON.stringify({ id: "fixture-Witness Tree", downloadUrl: "https://example.test/Witness Tree", releaseId: "release-Witness Tree", archiveKey: "archive/Witness Tree", filename: "Witness Tree.svg" }));
  await writeFile(path.join(root, "lib", "fixture.ts"), 'export const fixture = { id: "Witness Tree-id", filename: "Witness Tree.svg" };\n');
  await assert.rejects(checkRenameProof(root), /Durable identifier/);
});
