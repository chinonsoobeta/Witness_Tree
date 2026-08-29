import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkBudgets,
  EXPLORE_LIMIT,
  SHARED_LIMIT,
} from "../scripts/check-budgets.mjs";
import { checkClaimLanguage } from "../scripts/check-claim-language.mjs";
import { checkContrast, ratio } from "../scripts/check-contrast.mjs";
import { checkHexLiterals } from "../scripts/check-hex-literals.mjs";
import { checkStyleTokens } from "../scripts/check-style-tokens.mjs";

async function fixture() {
  return mkdtemp(path.join(os.tmpdir(), "witness-tree-gate-"));
}
async function budgetFixture(root, entries, assets = {}) {
  await mkdir(path.join(root, ".vite"), { recursive: true });
  await writeFile(
    path.join(root, ".vite", "manifest.json"),
    JSON.stringify(entries),
  );
  await Promise.all(
    Object.entries(assets).map(async ([file, content]) => {
      const destination = path.join(root, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }),
  );
}
function incompressibleBytes(size) {
  const bytes = Buffer.allocUnsafe(size);
  let state = 0x6d2b79f5;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

test("claim-language gate rejects forbidden claim templates", async () => {
  const root = await fixture();
  try {
    await writeFile(
      path.join(root, "wildfire-card.tsx"),
      "const copy = 'predicted spread rate unexplained';",
    );
    await assert.rejects(
      checkClaimLanguage([root]),
      /predicted|spread rate|unexplained/,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("claim-language gate rejects comparison superlatives", async () => {
  const root = await fixture();
  try {
    await writeFile(
      path.join(root, "comparison-card.tsx"),
      "const copy = 'best';",
    );
    await assert.rejects(checkClaimLanguage([root]), /best/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("style-token gate rejects a raw component colour", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "Card.tsx"), "const colour = '#abc';");
    await assert.rejects(checkStyleTokens([root]), /#abc/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("budget gate rejects an oversized shared artifact", async () => {
  const root = await fixture();
  try {
    await budgetFixture(
      root,
      { app: { file: "shared.js", isEntry: true } },
      { "shared.js": incompressibleBytes(SHARED_LIMIT) },
    );
    await assert.rejects(checkBudgets(root), /Budget gate failed/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("budget gate rejects a missing manifest or referenced artifact", async () => {
  const root = await fixture();
  try {
    await assert.rejects(checkBudgets(root), /manifest is required/i);
    await budgetFixture(root, { app: { file: "missing.js", isEntry: true } });
    await assert.rejects(checkBudgets(root), /artifact is required/i);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("budget gate rejects an oversized Explore artifact", async () => {
  const root = await fixture();
  try {
    await budgetFixture(
      root,
      {
        app: { file: "app.js", isEntry: true, imports: ["Explore"] },
        Explore: { file: "explore.js", name: "Explore" },
      },
      { "app.js": "a", "explore.js": incompressibleBytes(EXPLORE_LIMIT) },
    );
    await assert.rejects(checkBudgets(root), /Budget gate failed/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("budget gate reports raw and gzip totals for a measured manifest", async () => {
  const root = await fixture();
  try {
    await budgetFixture(
      root,
      { app: { file: "app.js", isEntry: true } },
      { "app.js": "console.log('small');".repeat(100) },
    );
    const result = await checkBudgets(root);
    assert.equal(result.status, "measured");
    assert.equal(typeof result.rawShared, "number");
    assert.equal(typeof result.gzipShared, "number");
    assert.ok(result.rawShared > result.gzipShared);
    assert.equal(result.rawExplore, 0);
    assert.equal(result.gzipExplore, 0);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("budget gate attributes dynamic Explore dependencies to Explore, not shared", async () => {
  const root = await fixture();
  try {
    await budgetFixture(
      root,
      {
        app: {
          file: "app.js",
          isEntry: true,
          imports: ["base"],
          dynamicImports: ["Explore"],
        },
        base: { file: "base.js" },
        Explore: {
          file: "explore.js",
          name: "Explore",
          imports: ["base"],
          dynamicImports: ["map"],
        },
        map: { file: "map.js", name: "maplibre-gl" },
      },
      {
        "app.js": "app",
        "base.js": "base",
        "explore.js": "explore",
        "map.js": "map dependency",
      },
    );
    const result = await checkBudgets(root);
    assert.equal(result.rawShared, 7);
    assert.equal(result.rawExplore, 21);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("contrast gate computes the WCAG ratio it claims to", () => {
  assert.equal(Number(ratio("#000000", "#ffffff").toFixed(2)), 21);
  assert.equal(Number(ratio("#ffffff", "#ffffff").toFixed(2)), 1);
  assert.equal(Number(ratio("#767676", "#ffffff").toFixed(2)), 4.54);
});

test("contrast gate rejects a palette that drops below the floor", async () => {
  const root = await fixture();
  try {
    const palette = "  --ground: #ffffff;\n  --ink: #cccccc;\n";
    await writeFile(
      path.join(root, "globals.css"),
      `:root {\n${palette}}\n[data-theme="dark"] {\n${palette}}\n`,
    );
    await assert.rejects(
      checkContrast(path.join(root, "globals.css")),
      /below the required 4.5/,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("contrast gate rejects a palette missing a shipped pair", async () => {
  const root = await fixture();
  try {
    await writeFile(
      path.join(root, "globals.css"),
      ':root {\n  --ground: #ffffff;\n}\n[data-theme="dark"] {\n  --ground: #000000;\n}\n',
    );
    await assert.rejects(
      checkContrast(path.join(root, "globals.css")),
      /is not declared in this palette/,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("hex-literal gate allows colour inside the palette blocks and rejects it below them", async () => {
  const root = await fixture();
  const stylesheet = path.join(root, "globals.css");
  try {
    await writeFile(
      stylesheet,
      ":root {\n  --ink: #101010;\n}\n.card {\n  color: var(--ink);\n}\n",
    );
    assert.ok((await checkHexLiterals(stylesheet)).lines > 0);
    await writeFile(
      stylesheet,
      ":root {\n  --ink: #101010;\n}\n.card {\n  color: #101010;\n}\n",
    );
    await assert.rejects(
      checkHexLiterals(stylesheet),
      /must come from a palette token/,
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("hex-literal gate treats every themed palette block as a declaration site", async () => {
  const root = await fixture();
  const stylesheet = path.join(root, "globals.css");
  try {
    await writeFile(
      stylesheet,
      '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    --ink: #f0f0f0;\n  }\n}\n[data-theme="dark"] {\n  --ink: #f0f0f0;\n}\n',
    );
    assert.ok((await checkHexLiterals(stylesheet)).lines > 0);
  } finally {
    await rm(root, { recursive: true });
  }
});
