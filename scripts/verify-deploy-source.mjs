#!/usr/bin/env node
/**
 * Proves a commit about to be deployed carries the exact tree of a commit on
 * origin/main.
 *
 * Deploy only from main. On 2026-09-23 the Site was deployed from an unmerged
 * pull request, and for three days it served code that was not on main, which
 * nothing flagged. The Sites source history needs an ancestry-only merge before
 * each deploy (main is squash-only), so the saved commit is never itself on
 * main; what must match is its tree. This compares that tree with the trees of
 * main's recent first-parent commits and names the one it equals.
 *
 * Usage: node scripts/verify-deploy-source.mjs <commit> [--main origin/main] [--depth 500]
 * Run after `git fetch origin main`. Read-only: it deploys and writes nothing.
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

/**
 * The main commit whose tree equals `tree`, or null. `history` is main's
 * first-parent commits, newest first, as { commit, tree }.
 */
export function mainCommitForTree(tree, history) {
  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error(`not a tree id: ${tree}`);
  return history.find((entry) => entry.tree === tree)?.commit ?? null;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { main: { type: "string", default: "origin/main" }, depth: { type: "string", default: "500" } },
  });
  const [commit] = positionals;
  if (!commit) {
    console.error("usage: node scripts/verify-deploy-source.mjs <commit> [--main origin/main] [--depth 500]");
    process.exit(2);
  }
  const tree = git("rev-parse", `${commit}^{tree}`);
  const history = git("log", "--first-parent", `-n${Number(values.depth)}`, "--format=%H %T", values.main)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, treeId] = line.split(" ");
      return { commit: hash, tree: treeId };
    });
  const match = mainCommitForTree(tree, history);
  if (!match) {
    console.error(`${commit} has tree ${tree}, which matches none of the last ${history.length} commits on ${values.main}. Deploy only from main.`);
    process.exit(1);
  }
  console.log(`${commit} carries the tree of ${values.main} commit ${match}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
