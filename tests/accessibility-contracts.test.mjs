import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkAccessibilityContracts } from "../scripts/check-accessibility-contracts.mjs";

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "accessibility-contract-"));
  await Promise.all(Object.entries(files).map(async ([file, source]) => {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }));
  return root;
}

async function rejects(files, message) {
  const root = await fixture(files);
  try { await assert.rejects(checkAccessibilityContracts([root]), message); } finally { await rm(root, { recursive: true }); }
}

test("accessibility contracts accept a labelled, scoped route fixture", async () => {
  const root = await fixture({ "app/en/page.tsx": "<SiteShell><main id=\"main\"><svg aria-label=\"Chart\"></svg><label>Year<input aria-label=\"Year\" /></label><img alt=\"Tree\" /><button type=\"button\">Open</button><table><caption>Records</caption><thead><tr><th scope=\"col\">Name</th></tr></thead></table></main></SiteShell>" });
  try { assert.deepEqual(await checkAccessibilityContracts([root]), { files: 1 }); } finally { await rm(root, { recursive: true }); }
});

test("locale SiteShell route without a main contract fails", () => rejects({ "app/en/page.tsx": "<SiteShell><section /></SiteShell>" }, /lacks main/));
test("unlabelled SVG and colour-only Explore legend fail", () => rejects({ "components/explore/Explore.tsx": "<svg></svg>" }, /SVG requires a title or aria-label|not colour alone/));
test("table without caption and scoped headers fails", () => rejects({ "components/Table.tsx": "<table><thead><tr><th>Name</th></tr></thead></table>" }, /table requires a caption|header requires scope/));
test("unlabelled input fails", () => rejects({ "components/Input.tsx": "<input type=\"text\" />" }, /input requires a label/));
test("image without alt fails", () => rejects({ "components/Image.tsx": "<img src=\"tree.png\" />" }, /img requires alt/));
test("button without type fails", () => rejects({ "components/Button.tsx": "<button>Open</button>" }, /button requires an explicit type/));
