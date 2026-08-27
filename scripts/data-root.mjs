import * as nodeFs from "node:fs";

// Canonical resolution of the Witness Tree data root.
//
// Runtime jobs, verifiers and local readbacks resolve their data location through this helper, so a
// run can be pointed at a different physical root with WITNESS_TREE_DATA_ROOT without editing code.
//
// Durable records are deliberately unaffected. Owner-command templates and recorded receipts keep the
// absolute root the owner actually approved, and evidence files keep the paths they were written with.
// Overriding the root changes only where a job reads and writes, never what a record claims.

export const INTERNAL_DATA_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
export const SSD_DATA_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data";

// Migration cutover is complete. The internal path remains only as an approved
// compatibility symlink for historical evidence that recorded it verbatim.
export const DEFAULT_DATA_ROOT = SSD_DATA_ROOT;

export function resolveDataRoot(fallback = DEFAULT_DATA_ROOT) {
  const configured = process.env.WITNESS_TREE_DATA_ROOT;
  return configured && configured.length > 0 ? configured : fallback;
}

// Re-root a path recorded against the internal root onto the current data root.
//
// Durable records keep the absolute directory a run actually wrote to. When the volume moves, the
// bytes are still verified, just at their new location. Paths not under the internal root are
// returned unchanged, so this never silently rewrites an unrelated location.
export function relocateToDataRoot(recordedAbsolutePath, root = resolveDataRoot()) {
  const prefix = `${INTERNAL_DATA_ROOT}/`;
  if (!recordedAbsolutePath.startsWith(prefix)) return recordedAbsolutePath;
  return `${root}/${recordedAbsolutePath.slice(prefix.length)}`;
}

// Resolve the data root, allowing it to be a symlink only when it points at the approved SSD root.
//
// After the migration the internal path is a compatibility symlink so recorded absolute paths keep
// resolving. That one link is approved; every deeper path must still be a real, unsymlinked file, so
// callers continue to check the artifacts themselves.
export async function approvedDataRootRealPath(root = resolveDataRoot()) {
  const { lstat, realpath } = await import("node:fs/promises");
  const link = await lstat(root);
  if (!link.isSymbolicLink()) return root;
  const target = await realpath(root);
  if (target !== SSD_DATA_ROOT) {
    throw new Error(`The data root ${root} is a symlink to ${target}, which is not the approved SSD root ${SSD_DATA_ROOT}.`);
  }
  return target;
}

// Synchronous sibling of approvedDataRootRealPath, for the checks that walk
// paths with the sync fs API.
//
// A guard that rejects every symlinked ancestor was written before the data
// root itself became one. It is not safe to relax such a guard to "any
// symlink is fine": the point of it is that a task-local link must never
// redirect a bound path. Exactly one link is approved, it is named here, and
// it must still point at the approved SSD root, so this returns that one
// exemption rather than letting callers invent their own.
export function approvedDataRootRealPathSync(root = resolveDataRoot()) {
  const { lstatSync, realpathSync } = nodeFs;
  let link;
  try {
    link = lstatSync(root);
  } catch {
    return root;
  }
  if (!link.isSymbolicLink()) return root;
  const target = realpathSync(root);
  if (target !== SSD_DATA_ROOT) {
    throw new Error(`The data root ${root} is a symlink to ${target}, which is not the approved SSD root ${SSD_DATA_ROOT}.`);
  }
  return target;
}
