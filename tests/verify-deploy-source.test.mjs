import assert from "node:assert/strict";
import test from "node:test";
import { mainCommitForTree } from "../scripts/verify-deploy-source.mjs";

const history = [
  { commit: "a".repeat(40), tree: "1".repeat(40) },
  { commit: "b".repeat(40), tree: "2".repeat(40) },
];

test("a deploy commit is accepted only when its tree is a main commit's tree", () => {
  // The Sites reconciliation merge is never on main itself; its tree is.
  assert.equal(mainCommitForTree("2".repeat(40), history), "b".repeat(40));
  // An unmerged branch has a tree main never had.
  assert.equal(mainCommitForTree("3".repeat(40), history), null);
});

test("anything but a full tree id is refused rather than matched loosely", () => {
  for (const tree of ["2222", "main", "", "g".repeat(40)]) assert.throws(() => mainCommitForTree(tree, history), /not a tree id/);
});
