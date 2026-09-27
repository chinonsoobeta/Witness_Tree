#!/usr/bin/env python3
"""Phase 4: recompute one interval-province match without the matcher's code.

The matcher streams runs through a row scratch array and counts overlaps in a
hash table. This check instead expands cells to flat keys and joins them with a
sort, then re-applies the matching rules (overlap of at least half the smaller
area; +/-2 years, +/-3 before 1995; best overlap wins). If the counts and reasons
agree, the scratch-row join, the hash table and the province rule are all
independently confirmed.

Memory is bounded: runs (not cells) are loaded once and sorted by row, only
loss-patch cells are ever expanded, one band of BAND rows at a time, and the
province mask and record runs are matched against them as ranges, so memory
follows the loss cells rather than the land area. The process aborts itself
if its peak resident size passes MAX_RSS_GB, rather than pushing the machine
into swap. (An earlier version expanded a whole interval at once and did.)
"""
import json, resource, sys
import numpy as np

WIDTH, BAND, MAX_RSS_GB = 193936, 2048, 3.0
store, records, sources, mask, interval, province, matcher_out = sys.argv[1:8]
sources = sources.split(",")
year_to = int(interval.split("-")[1])
tolerance = 3 if year_to < 1995 else 2
target = {"BC": 0, "QC": 3}[province]
RUN3 = [("row", "<u4"), ("x0", "<u4"), ("x1", "<u4")]
RUN4 = RUN3 + [("v", "<u4")]


def guard():
    peak_gb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**30  # bytes on macOS
    if peak_gb > MAX_RSS_GB:
        sys.exit(f"aborting: peak memory {peak_gb:.1f} GB passed the {MAX_RSS_GB} GB ceiling")


def by_row(runs):
    order = np.argsort(runs["row"], kind="stable")
    return runs[order]


def band(runs, r0, r1):
    lo, hi = np.searchsorted(runs["row"], [r0, r1])
    return runs[lo:hi]


def expand(runs):
    lengths = (runs["x1"].astype(np.int64) - runs["x0"] + 1)
    keys = np.repeat(runs["row"].astype(np.int64) * WIDTH + runs["x0"], lengths)
    keys += np.arange(lengths.sum()) - np.repeat(np.cumsum(lengths) - lengths, lengths)
    return keys, lengths


patches = np.fromfile(f"{store}/detected-forest-loss-{interval}.patches.bin", dtype=np.uint8).reshape(-1, 40)
cell_count = patches[:, 8:12].copy().view("<u4").ravel()
run_count = patches[:, 12:16].copy().view("<u4").ravel()
del patches
raw = np.fromfile(f"{store}/detected-forest-loss-{interval}.runs.bin", dtype=RUN3)
patch_runs = np.empty(len(raw), dtype=RUN4)
for name in ("row", "x0", "x1"):
    patch_runs[name] = raw[name]
patch_runs["v"] = np.repeat(np.arange(len(cell_count), dtype=np.uint32), run_count)
del raw
patch_runs = by_row(patch_runs)
mask_runs = np.fromfile(mask, dtype=RUN4)  # already sorted by row
rec_year = np.fromfile(f"{records}/record-year.u16", dtype="<u2")
rec_cells = np.zeros(len(rec_year), dtype=np.float64)
record_runs = []
for source in sources:
    cells = np.fromfile(f"{records}/{source}/record-cells.u64", dtype="<u8")
    rec_cells[: len(cells)] += cells
    for year in range(year_to - 5, year_to + 6):
        try:
            record_runs.append(np.fromfile(f"{records}/{source}/{year}.runs.bin", dtype=RUN4))
        except FileNotFoundError:
            pass
record_runs = by_row(np.concatenate(record_runs))
guard()

in_target = np.zeros(len(cell_count), dtype=np.int64)
in_other = np.zeros(len(cell_count), dtype=np.int64)
pair_keys, pair_counts = [], []
first_row, last_row = int(patch_runs["row"][0]), int(patch_runs["row"][-1]) + 1
for r0 in range(first_row, last_row, BAND):
    r1 = r0 + BAND
    pr = band(patch_runs, r0, r1)
    if not len(pr):
        continue
    keys, ln = expand(pr)
    owner = np.repeat(pr["v"], ln)
    order = np.argsort(keys)
    keys, owner = keys[order], owner[order]
    # Province of each loss cell: the mask run whose range holds it, found by
    # search over run starts rather than by expanding the mask.
    mr = band(mask_runs, r0, r1)
    starts = mr["row"].astype(np.int64) * WIDTH + mr["x0"]
    ends = mr["row"].astype(np.int64) * WIDTH + mr["x1"]
    at = np.searchsorted(starts, keys, side="right") - 1
    hit = (at >= 0) & (keys <= ends[np.maximum(at, 0)]) if len(mr) else np.zeros(len(keys), bool)
    prov = np.where(hit, mr["v"][np.maximum(at, 0)] if len(mr) else 0, 99)
    in_target += np.bincount(owner[prov == target], minlength=len(cell_count))
    in_other += np.bincount(owner[(prov != target) & (prov != 99)], minlength=len(cell_count))
    rr = band(record_runs, r0, r1)
    if len(rr):
        # Each record run selects the loss cells inside its range; only the
        # overlapping cells are ever materialized.
        s0 = rr["row"].astype(np.int64) * WIDTH + rr["x0"]
        s1 = rr["row"].astype(np.int64) * WIDTH + rr["x1"]
        lo = np.searchsorted(keys, s0, side="left")
        hi = np.searchsorted(keys, s1, side="right")
        n_hit = hi - lo
        total = int(n_hit.sum())
        cell_index = np.repeat(lo, n_hit) + (np.arange(total) - np.repeat(np.cumsum(n_hit) - n_hit, n_hit))
        recs = np.repeat(rr["v"].astype(np.int64), n_hit)
        pk, pc = np.unique(owner[cell_index].astype(np.int64) * 2**23 + recs, return_counts=True)
        pair_keys.append(pk)
        pair_counts.append(pc)
    guard()

assessed = in_target > in_other
pk = np.concatenate(pair_keys) if pair_keys else np.zeros(0, np.int64)
pc = np.concatenate(pair_counts) if pair_counts else np.zeros(0, np.int64)
pairs, inverse = np.unique(pk, return_inverse=True)
counts = np.zeros(len(pairs), dtype=np.int64)
np.add.at(counts, inverse, pc)
patch_ids, rec_ids = pairs // 2**23, pairs % 2**23
keep = assessed[patch_ids]
patch_ids, rec_ids, counts = patch_ids[keep], rec_ids[keep], counts[keep]

share = counts / np.minimum(cell_count[patch_ids], rec_cells[rec_ids])
late = np.abs(rec_year[rec_ids].astype(np.int64) - year_to) > tolerance
thin = ~late & (share < 0.5)
qualifies = ~late & ~thin
n = len(cell_count)
matched_mask = np.bincount(patch_ids[qualifies], minlength=n) > 0
has_candidates = np.bincount(patch_ids, minlength=n) > 0
has_late = np.bincount(patch_ids[late], minlength=n) > 0
has_thin = np.bincount(patch_ids[thin], minlength=n) > 0
reasons = {}
unmatched = assessed & ~matched_mask
for name, selector in [
    ("no-official-record-candidates", unmatched & ~has_candidates),
    ("outside-temporal-tolerance", unmatched & has_candidates & has_late & ~has_thin),
    ("below-spatial-tolerance", unmatched & has_candidates & has_thin & ~has_late),
    ("below-spatial-tolerance,outside-temporal-tolerance", unmatched & has_candidates & has_thin & has_late),
]:
    if selector.sum():
        reasons[name] = int(selector.sum())

mine = {"assessedChanges": int(assessed.sum()), "matchedChanges": int((assessed & matched_mask).sum()), "nonMatchReasonDistribution": dict(sorted(reasons.items()))}
theirs = json.load(open(matcher_out))
same = all(mine[k] == theirs[k] for k in mine)
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20
print(json.dumps({"province": province, "interval": interval, "independent": mine, "agrees": same, "peakRssMegabytes": round(peak)}))
sys.exit(0 if same else 1)
