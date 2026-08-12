import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBudgets, EXPLORE_LIMIT, SHARED_LIMIT } from "../scripts/check-budgets.mjs";
import { checkClaimLanguage } from "../scripts/check-claim-language.mjs";
import { checkStyleTokens } from "../scripts/check-style-tokens.mjs";

async function fixture() { return mkdtemp(path.join(os.tmpdir(), "witness-tree-gate-")); }
async function budgetFixture(root, entries, assets = {}) {
  await mkdir(path.join(root, ".vite"), { recursive: true });
  await writeFile(path.join(root, ".vite", "manifest.json"), JSON.stringify(entries));
  await Promise.all(Object.entries(assets).map(async ([file, content]) => {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }));
}
function incompressibleBytes(size) {
  const bytes = Buffer.allocUnsafe(size);
  let state = 0x6d2b79f5;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

test("claim-language gate rejects forbidden claim templates", async () => {
  const root = await fixture();
  try { await writeFile(path.join(root, "wildfire-card.tsx"), "const copy = 'predicted spread rate unexplained';"); await assert.rejects(checkClaimLanguage([root]), /predicted|spread rate|unexplained/); } finally { await rm(root, { recursive: true }); }
});

test("claim-language gate rejects comparison superlatives", async () => {
  const root = await fixture();
  try { await writeFile(path.join(root, "comparison-card.tsx"), "const copy = 'best';"); await assert.rejects(checkClaimLanguage([root]), /best/); } finally { await rm(root, { recursive: true }); }
});

test("style-token gate rejects a raw component colour", async () => {
  const root = await fixture();
  try { await writeFile(path.join(root, "Card.tsx"), "const colour = '#abc';"); await assert.rejects(checkStyleTokens([root]), /#abc/); } finally { await rm(root, { recursive: true }); }
});

test("budget gate rejects an oversized shared artifact", async () => {
  const root = await fixture();
  try { await budgetFixture(root, { app: { file: "shared.js", isEntry: true } }, { "shared.js": incompressibleBytes(SHARED_LIMIT) }); await assert.rejects(checkBudgets(root), /Budget gate failed/); } finally { await rm(root, { recursive: true }); }
});

test("budget gate rejects a missing manifest or referenced artifact", async () => {
  const root = await fixture();
  try {
    await assert.rejects(checkBudgets(root), /manifest is required/i);
    await budgetFixture(root, { app: { file: "missing.js", isEntry: true } });
    await assert.rejects(checkBudgets(root), /artifact is required/i);
  } finally { await rm(root, { recursive: true }); }
});

test("budget gate rejects an oversized Explore artifact", async () => {
  const root = await fixture();
  try {
    await budgetFixture(root, { app: { file: "app.js", isEntry: true, imports: ["Explore"] }, Explore: { file: "explore.js", name: "Explore" } }, { "app.js": "a", "explore.js": incompressibleBytes(EXPLORE_LIMIT) });
    await assert.rejects(checkBudgets(root), /Budget gate failed/);
  } finally { await rm(root, { recursive: true }); }
});

test("budget gate reports raw and gzip totals for a measured manifest", async () => {
  const root = await fixture();
  try {
    await budgetFixture(root, { app: { file: "app.js", isEntry: true } }, { "app.js": "console.log('small');".repeat(100) });
    const result = await checkBudgets(root);
    assert.equal(result.status, "measured");
    assert.equal(typeof result.rawShared, "number");
    assert.equal(typeof result.gzipShared, "number");
    assert.ok(result.rawShared > result.gzipShared);
    assert.equal(result.rawExplore, 0);
    assert.equal(result.gzipExplore, 0);
  } finally { await rm(root, { recursive: true }); }
});

test("budget gate attributes dynamic Explore dependencies to Explore, not shared", async () => {
  const root = await fixture();
  try {
    await budgetFixture(root, {
      app: { file: "app.js", isEntry: true, imports: ["base"], dynamicImports: ["Explore"] },
      base: { file: "base.js" },
      Explore: { file: "explore.js", name: "Explore", imports: ["base"], dynamicImports: ["map"] },
      map: { file: "map.js", name: "maplibre-gl" },
    }, { "app.js": "app", "base.js": "base", "explore.js": "explore", "map.js": "map dependency" });
    const result = await checkBudgets(root);
    assert.equal(result.rawShared, 7);
    assert.equal(result.rawExplore, 21);
  } finally { await rm(root, { recursive: true }); }
});
