// Turning the component lineage into per-cell geometry.
//
// The lineage is written by a single-pass labeller that holds two raster rows
// of state, so it cannot know a component's final identity when it first meets
// it. When two provisional components turn out to touch, it emits an `alias`
// record and carries on. In the 1984-1985 pair there are 156,643 of them, they
// chain (10,674 alias targets are themselves alias sources), and every alias
// source appears as the componentId of runs that were emitted before the merge
// was known.
//
// So a reader that groups runs by their literal componentId gets 3,545,893
// groups where there are only 3,389,250 components: it invents 156,643 patches
// and tears real ones apart. Resolving through the alias chain is not an
// optimization, it is the difference between right and wrong.

/** Union-find over component ids, with path compression. */
export class ComponentAliases {
  #parent = new Map();

  /** Follows the alias chain to the surviving id, compressing as it goes. */
  resolve(id) {
    let root = id;
    while (this.#parent.has(root)) root = this.#parent.get(root);
    let walk = id;
    while (this.#parent.has(walk)) {
      const next = this.#parent.get(walk);
      this.#parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  /** Records that `from` was merged into `to`. */
  alias(from, to) {
    const a = this.resolve(from);
    const b = this.resolve(to);
    if (a !== b) this.#parent.set(a, b);
  }

  get size() {
    return this.#parent.size;
  }
}

/**
 * Accumulates runs per live component and releases each patch when its
 * `component` record arrives.
 *
 * Memory is bounded by the number of components open at once, not by the size
 * of the raster: the lineage records maxActiveComponents in the hundreds, and
 * this consumer holds runs for exactly those.
 */
export class PatchAccumulator {
  #open = new Map();
  #aliases = new ComponentAliases();
  peakOpen = 0;

  addRun(componentId, row, x0, x1) {
    const root = this.#aliases.resolve(componentId);
    let runs = this.#open.get(root);
    if (runs === undefined) {
      runs = [];
      this.#open.set(root, runs);
      if (this.#open.size > this.peakOpen) this.peakOpen = this.#open.size;
    }
    runs.push(row, x0, x1);
  }

  /** Merges the losing id's buffered runs into the surviving id. */
  addAlias(fromId, toId) {
    const from = this.#aliases.resolve(fromId);
    const to = this.#aliases.resolve(toId);
    if (from === to) return;
    this.#aliases.alias(from, to);
    const moved = this.#open.get(from);
    if (moved === undefined) return;
    this.#open.delete(from);
    const root = this.#aliases.resolve(to);
    const target = this.#open.get(root);
    if (target === undefined) {
      this.#open.set(root, moved);
      return;
    }
    // Spreading the loser into the survivor (push(...moved)) builds an
    // argument list as long as the array and overflows the stack: real
    // components reach millions of runs. Appending in a loop, smaller into
    // larger, keeps the total copying near-linear over a merge chain. The
    // append order does not matter because finish() sorts canonically.
    const [keep, fold] = target.length >= moved.length ? [target, moved] : [moved, target];
    for (let index = 0; index < fold.length; index += 1) keep.push(fold[index]);
    this.#open.set(root, keep);
  }

  /**
   * Closes a component and returns its patch, or null if the id has already
   * been closed. Runs come back sorted by row then x0 so the stored geometry
   * has one canonical ordering regardless of the order the labeller found it.
   */
  finish(componentId, cellCount) {
    const root = this.#aliases.resolve(componentId);
    const flat = this.#open.get(root);
    if (flat === undefined) return null;
    this.#open.delete(root);
    const runCount = flat.length / 3;
    const order = Array.from({ length: runCount }, (_, index) => index);
    order.sort((a, b) => flat[a * 3] - flat[b * 3] || flat[a * 3 + 1] - flat[b * 3 + 1]);
    const runs = new Uint32Array(runCount * 3);
    let minRow = Infinity, maxRow = -Infinity, minX = Infinity, maxX = -Infinity, cells = 0;
    for (let index = 0; index < runCount; index += 1) {
      const source = order[index] * 3;
      const row = flat[source], x0 = flat[source + 1], x1 = flat[source + 2];
      runs[index * 3] = row; runs[index * 3 + 1] = x0; runs[index * 3 + 2] = x1;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (x0 < minX) minX = x0;
      if (x1 > maxX) maxX = x1;
      cells += x1 - x0 + 1;
    }
    return { componentId: root, cellCount: cells, declaredCellCount: cellCount, runCount, runs, minRow, maxRow, minX, maxX };
  }

  get openCount() {
    return this.#open.size;
  }
}

/** Bytes per record in the two stored products. */
export const PATCH_RECORD_BYTES = 40;
export const RUN_RECORD_BYTES = 12;

/** One 30 m cell in hectares. A 30 m by 30 m cell is 900 m2. */
export const CELL_HECTARES = 0.09;

export function writePatchRecord(view, offset, patch, runOffset) {
  view.setBigUint64(offset, BigInt(patch.componentId), true);
  view.setUint32(offset + 8, patch.cellCount, true);
  view.setUint32(offset + 12, patch.runCount, true);
  view.setUint32(offset + 16, runOffset, true);
  view.setUint32(offset + 20, patch.minRow, true);
  view.setUint32(offset + 24, patch.maxRow, true);
  view.setUint32(offset + 28, patch.minX, true);
  view.setUint32(offset + 32, patch.maxX, true);
  view.setUint32(offset + 36, 0, true);
}

export function readPatchRecord(view, offset) {
  return {
    componentId: view.getBigUint64(offset, true),
    cellCount: view.getUint32(offset + 8, true),
    runCount: view.getUint32(offset + 12, true),
    runOffset: view.getUint32(offset + 16, true),
    minRow: view.getUint32(offset + 20, true),
    maxRow: view.getUint32(offset + 24, true),
    minX: view.getUint32(offset + 28, true),
    maxX: view.getUint32(offset + 32, true),
  };
}
