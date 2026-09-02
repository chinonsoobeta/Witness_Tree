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

// A hidden input carries no accessible name and cannot be focused, so requiring one would
// force meaningless aria-label noise onto form state. The exemption must stay narrow: it keys
// on type="hidden" alone, and every other input still fails without a name.
test("a hidden input needs no accessible name", async () => {
  const root = await fixture({ "components/Form.tsx": "<form method=\"get\"><input type=\"hidden\" name=\"mode\" value=\"wildfire\" /><input type=\"range\" name=\"year\" aria-label=\"Year\" /><button type=\"submit\">Update</button></form>" });
  try { assert.deepEqual(await checkAccessibilityContracts([root]), { files: 1 }); } finally { await rm(root, { recursive: true }); }
});
test("an unlabelled range input still fails alongside a hidden one", () => rejects({ "components/Form.tsx": "<form method=\"get\"><input type=\"hidden\" name=\"mode\" /><input type=\"range\" name=\"year\" /></form>" }, /input requires a label/));
test("an input merely named hidden is not exempt", () => rejects({ "components/Form.tsx": "<input type=\"text\" name=\"hidden\" />" }, /input requires a label/));

test("a control named by a visible label passes, and one named by nothing still fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a11y-label-"));
  const write = (name, source) => writeFile(path.join(directory, name), source, "utf8");
  const shell = '<SiteShell locale="en"><main id="main">';

  // The primary HTML way to name a control. It names it for a sighted reader too,
  // which aria-label does not, so it cannot be the weaker of the two.
  await write("Labelled.tsx", `${shell}<label htmlFor="q">Search</label><input id="q" /></main></SiteShell>`);
  assert.deepEqual(await checkAccessibilityContracts([directory]), { files: 1 });

  // The same input with the label pointed somewhere else is unnamed again.
  await write("Labelled.tsx", `${shell}<label htmlFor="other">Search</label><input id="q" /></main></SiteShell>`);
  await assert.rejects(checkAccessibilityContracts([directory]), /input requires a label/);

  // And with no label at all.
  await write("Labelled.tsx", `${shell}<input id="q" /></main></SiteShell>`);
  await assert.rejects(checkAccessibilityContracts([directory]), /input requires a label/);
});
