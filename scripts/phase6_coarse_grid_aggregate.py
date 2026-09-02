#!/usr/bin/env python3
"""A countable coarse grid, so an arbitrary drawn shape can be measured.

The tiles cannot answer this.  phase2-per-cell-tile-release.json records
countable: false and the gate refuses to let it become true, because a
generalized tile drops features below a rendered pixel and counting them would
be counting a drawing.  The worker cannot open a raster.  So a drawn shape can
only be answered from something precomputed, and this file computes it.

The unit is a 32 by 32 pixel block, 960 m on a side, aligned exactly to the
national grid origin.  Nothing is resampled and nothing is reprojected: a block
is a whole number of source cells, so its counts are exact sums of source cells
rather than an interpolation.

What a block stores, and why it is enough to answer any window:

  forestKnown[a]   countable cells that were forest in opening year a.  The
                   denominator, which does not move as a window widens.

  annualLoss[y]    countable cells lost in year y.  Adding these across a
                   window gives the sum exactly, because addition is what the
                   sum means.

  pairs[(y1, y2)]  countable cells whose loss years include y1 and y2 with no
                   loss between them.  This is what makes union exact without
                   storing 741 numbers per block:

                       union[a,b] = sum[a,b] - overcount[a,b]

                   and a cell is overcounted once for every consecutive pair of
                   its own loss years that falls entirely inside [a,b].  A cell
                   lost once inside the window contributes no pair and is
                   counted once; a cell lost three times contributes two pairs
                   and is counted three times and corrected twice.  Both sides
                   are additive over blocks, so a shape's union is the sum of
                   its blocks' sums minus the sum of its blocks' pairs.

Countable is deliberately strict, and stricter than the district product.  A
cell counts only if it is inside the mapped extent and carries no nodata in any
of the 39 forest masks or 38 loss rasters.  Everything else is Unknown and is
reported as Unknown.  The district product decides that per window, which is
more generous and needs the whole trajectory to be kept; a shape query cannot
carry a trajectory per block, so this product answers a narrower question
honestly rather than a wider one loosely.  A block therefore reports two
different populations and both are stored: countable cells, and everything the
block could not count.

Proof, not assertion.  The pass also accumulates the national trajectory
histogram over countable cells, which answers all 741 windows exactly by the
same derivation the district worker uses.  The packer compares the national
union reconstructed from the blocks against that histogram for every window.
If the pair identity above were wrong, that comparison fails.

NEVER edit this file while it is running.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path
from typing import Any

import numpy as np
from osgeo import gdal

HERE = Path(__file__).resolve().parent


def _load_v2():
    """Reuse the annual worker's grid and validation helpers verbatim."""

    path = HERE / "phase2_annual_zonal_aggregate_v2.py"
    spec = importlib.util.spec_from_file_location("phase2_annual_zonal_aggregate_v2", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load the annual worker helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


V2 = _load_v2()

NODATA = 255
FIRST_YEAR = 1984
LAST_YEAR = 2022
FOREST_YEARS = tuple(range(FIRST_YEAR, LAST_YEAR + 1))
LOSS_PAIRS = tuple((y, y + 1) for y in range(FIRST_YEAR, LAST_YEAR))
STEPS = len(LOSS_PAIRS)
BLOCK = 32  # 960 m, a whole number of 30 m cells

fail = V2.fail
sha256 = V2.sha256
file_bytes = V2.file_bytes
validate_raster_metadata = V2.validate_raster_metadata
validate_exact_grid = V2.validate_exact_grid
validate_projected_metre_grid = V2.validate_projected_metre_grid


def resolve_series(forest_dir: str, loss_dir: str) -> tuple[list[str], list[str]]:
    forests = [os.path.join(forest_dir, f"forest-mask-{year}.tif") for year in FOREST_YEARS]
    losses = [os.path.join(loss_dir, f"detected-forest-loss-{a}-{b}.tif") for a, b in LOSS_PAIRS]
    for path in forests + losses:
        if not os.path.isfile(path):
            fail(f"Missing required raster: {path}")
    return forests, losses


_STATE: dict[str, Any] = {}


def _open_state(config: dict[str, Any]) -> dict[str, Any]:
    if _STATE.get("ready"):
        return _STATE
    gdal.UseExceptions()
    gdal.SetCacheMax(config["gdalCacheBytes"])
    forests = [gdal.Open(p, gdal.GA_ReadOnly) for p in config["forestPaths"]]
    losses = [gdal.Open(p, gdal.GA_ReadOnly) for p in config["lossPaths"]]
    extent = gdal.Open(config["extentPath"], gdal.GA_ReadOnly)
    if extent is None or any(d is None for d in forests + losses):
        fail("Cannot open the raster series in a worker process")
    reference = forests[0]
    validate_raster_metadata(reference, f"Forest mask {FIRST_YEAR}")
    for year, dataset in zip(FOREST_YEARS, forests):
        validate_exact_grid(reference, dataset, f"Forest mask {year}")
    for (a, b), dataset in zip(LOSS_PAIRS, losses):
        validate_exact_grid(reference, dataset, f"Loss raster {a}-{b}")
    validate_exact_grid(reference, extent, "Mapped extent")
    _STATE.update(
        ready=True,
        forestBands=[d.GetRasterBand(1) for d in forests],
        lossBands=[d.GetRasterBand(1) for d in losses],
        extentBand=extent.GetRasterBand(1),
        keep=(forests, losses, extent),
        cellHectares=validate_projected_metre_grid(reference),
    )
    return _STATE


def _block_sums(flags: np.ndarray, rows: int, columns: int) -> np.ndarray:
    """Sum a boolean pixel tile into its 32 by 32 blocks.

    The tile is padded to whole blocks with False, so an edge block sums only
    the source cells that exist rather than inventing cells that do not.
    """

    block_rows = (rows + BLOCK - 1) // BLOCK
    block_columns = (columns + BLOCK - 1) // BLOCK
    padded = np.zeros((block_rows * BLOCK, block_columns * BLOCK), dtype=np.int32)
    padded[:rows, :columns] = flags
    return padded.reshape(block_rows, BLOCK, block_columns, BLOCK).sum(axis=(1, 3))


def _consecutive_pairs(loss_bits: np.ndarray) -> dict[tuple[int, int], int]:
    """Count consecutive loss-year pairs over a set of cells.

    A cell lost in 1990, 1995 and 2004 contributes (1990,1995) and (1995,2004),
    and contributes nothing for (1990,2004), which is the point: a window that
    contains 1990 and 2004 but not 1995 must overcount that cell only once.
    """

    counts: dict[tuple[int, int], int] = {}
    if loss_bits.size == 0:
        return counts
    keys, multiplicity = np.unique(loss_bits, return_counts=True)
    for key, times in zip(keys, multiplicity):
        value = int(key)
        if value == 0:
            continue
        years = [index for index in range(STEPS) if value & (1 << index)]
        for first, second in zip(years, years[1:]):
            entry = (first, second)
            counts[entry] = counts.get(entry, 0) + int(times)
    return counts


def _summarize_strip(payload: tuple[dict[str, Any], int, int, int, int]) -> dict[str, Any]:
    config, xoff, yoff, width, height = payload
    state = _open_state(config)
    started = time.monotonic()

    extent_values = state["extentBand"].ReadAsArray(xoff, yoff, width, height)
    if extent_values is None:
        fail("Cannot read the mapped extent")
    V2.validate_extent_values(extent_values)
    mapped = extent_values != NODATA
    del extent_values

    # Every band is read once and released.  The per-year decisions are kept as
    # bit planes rather than as 76 boolean rasters, which is the difference
    # between 160 MB and 800 MB in a worker, and memory is the binding
    # constraint on this machine.
    forest_bits = np.zeros((height, width), dtype=np.uint64)
    loss_bits = np.zeros((height, width), dtype=np.uint64)
    any_nodata = np.zeros((height, width), dtype=bool)

    for index, band in enumerate(state["forestBands"]):
        values = band.ReadAsArray(xoff, yoff, width, height)
        if values is None:
            fail(f"Cannot read forest mask {FOREST_YEARS[index]}")
        V2.validate_values(values, f"Forest mask {FOREST_YEARS[index]}")
        any_nodata |= values == NODATA
        if index < STEPS:
            forest_bits |= (values == 1).astype(np.uint64) << np.uint64(index)
        del values

    for index, band in enumerate(state["lossBands"]):
        pair = LOSS_PAIRS[index]
        values = band.ReadAsArray(xoff, yoff, width, height)
        if values is None:
            fail(f"Cannot read loss raster {pair[0]}-{pair[1]}")
        V2.validate_values(values, f"Loss raster {pair[0]}-{pair[1]}")
        any_nodata |= values == NODATA
        loss_bits |= (values == 1).astype(np.uint64) << np.uint64(index)
        del values

    complete = mapped & ~any_nodata
    del any_nodata
    # A loss only counts against forest that was standing at the opening year,
    # which is the same eligibility the annual product uses.
    loss_bits &= forest_bits
    loss_bits[~complete] = np.uint64(0)
    forest_bits[~complete] = np.uint64(0)

    block_rows = (height + BLOCK - 1) // BLOCK
    block_columns = (width + BLOCK - 1) // BLOCK
    pixels = _block_sums(np.ones((height, width), dtype=bool), height, width)
    mapped_blocks = _block_sums(mapped, height, width)
    countable_blocks = _block_sums(complete, height, width)
    del mapped

    forest_known = np.zeros((STEPS, block_rows, block_columns), dtype=np.int32)
    annual_loss = np.zeros((STEPS, block_rows, block_columns), dtype=np.int32)
    for index in range(STEPS):
        bit = np.uint64(1) << np.uint64(index)
        forest_known[index] = _block_sums((forest_bits & bit) != 0, height, width)
        annual_loss[index] = _block_sums((loss_bits & bit) != 0, height, width)
    del forest_bits

    # National trajectory histogram over countable cells, kept so the packer can
    # prove the pair identity rather than trust it.
    histogram: dict[int, int] = {}
    interesting = loss_bits != 0
    if np.any(interesting):
        keys, counts = np.unique(loss_bits[interesting], return_counts=True)
        for key, count in zip(keys, counts):
            histogram[int(key)] = histogram.get(int(key), 0) + int(count)

    blocks: list[dict[str, Any]] = []
    for row in range(block_rows):
        for column in range(block_columns):
            countable = int(countable_blocks[row][column])
            if countable == 0 and int(mapped_blocks[row][column]) == 0:
                continue
            top = row * BLOCK
            left = column * BLOCK
            window = loss_bits[top : top + BLOCK, left : left + BLOCK]
            pairs = _consecutive_pairs(window[window != 0])
            blocks.append(
                {
                    "gx": (xoff // BLOCK) + column,
                    "gy": (yoff // BLOCK) + row,
                    "pixels": int(pixels[row][column]),
                    "mappedCells": int(mapped_blocks[row][column]),
                    "countableCells": countable,
                    "forestKnownCells": [int(forest_known[index][row][column]) for index in range(STEPS)],
                    "annualLossCells": [int(annual_loss[index][row][column]) for index in range(STEPS)],
                    "pairs": [[first, second, count] for (first, second), count in sorted(pairs.items())],
                }
            )

    return {
        "xoff": xoff,
        "yoff": yoff,
        "width": width,
        "height": height,
        "blocks": blocks,
        "histogram": [[key, value] for key, value in histogram.items()],
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }


def main(args: argparse.Namespace) -> None:
    gdal.UseExceptions()
    started = datetime.now(timezone.utc)
    forests, losses = resolve_series(args.forest_mask_dir, args.annual_loss_dir)
    if not os.path.isfile(args.mapped_extent):
        fail("Missing mapped extent raster")

    reference = gdal.Open(forests[0], gdal.GA_ReadOnly)
    if reference is None:
        fail("Cannot open the reference forest mask")
    validate_raster_metadata(reference, f"Forest mask {FIRST_YEAR}")
    cell_hectares = validate_projected_metre_grid(reference)
    raster_width = reference.RasterXSize
    raster_height = reference.RasterYSize
    transform = reference.GetGeoTransform()
    crs_wkt = reference.GetProjection()
    if raster_width % BLOCK and args.require_whole_blocks:
        fail("Raster width is not a whole number of blocks")

    config = {
        "forestPaths": forests,
        "lossPaths": losses,
        "extentPath": args.mapped_extent,
        "gdalCacheBytes": args.gdal_cache_megabytes * 1024 * 1024,
    }

    strips: list[tuple[dict[str, Any], int, int, int, int]] = []
    for yoff in range(0, raster_height, args.strip_rows * BLOCK):
        height = min(args.strip_rows * BLOCK, raster_height - yoff)
        for xoff in range(0, raster_width, args.strip_columns * BLOCK):
            width = min(args.strip_columns * BLOCK, raster_width - xoff)
            strips.append((config, xoff, yoff, width, height))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        fail(f"Refusing to overwrite {output}")

    total_blocks = 0
    total_countable = 0
    total_mapped = 0
    total_loss = 0
    histogram: dict[int, int] = {}
    done = 0
    context = get_context("spawn")
    with output.open("w", encoding="utf-8") as sink:
        with context.Pool(processes=args.workers) as pool:
            for result in pool.imap_unordered(_summarize_strip, strips, chunksize=1):
                done += 1
                for block in result["blocks"]:
                    total_blocks += 1
                    total_countable += block["countableCells"]
                    total_mapped += block["mappedCells"]
                    total_loss += sum(block["annualLossCells"])
                    sink.write(json.dumps(block, separators=(",", ":")) + "\n")
                for trajectory, count in result["histogram"]:
                    histogram[trajectory] = histogram.get(trajectory, 0) + count
                if done % 10 == 0 or done == len(strips):
                    print(
                        f"{time.strftime('%H:%M:%S')} {done}/{len(strips)} strips, "
                        f"{total_blocks} blocks, {total_countable} countable cells",
                        flush=True,
                    )

    sidecar = {
        "schemaVersion": "witness-tree/phase6-coarse-grid-aggregate/1",
        "methodVersion": args.method_version,
        "codeVersion": args.code_version,
        "workerSha256": sha256(file_bytes(str(Path(__file__).resolve()))),
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "blockPixels": BLOCK,
        "blockMetres": BLOCK * 30,
        "cellHectares": cell_hectares,
        "rasterWidth": raster_width,
        "rasterHeight": raster_height,
        "gridWidth": (raster_width + BLOCK - 1) // BLOCK,
        "gridHeight": (raster_height + BLOCK - 1) // BLOCK,
        "geoTransform": list(transform),
        "crsWktSha256": sha256(crs_wkt.encode("utf-8")),
        "firstYear": FIRST_YEAR,
        "lastYear": LAST_YEAR,
        "annualStepCount": STEPS,
        "countableRule": (
            "inside the mapped extent and carrying no nodata in any of the 39 forest masks "
            "or 38 loss rasters; everything else is Unknown and is reported as Unknown"
        ),
        "blocksWritten": total_blocks,
        "countableCells": total_countable,
        "mappedCells": total_mapped,
        "annualLossCellYears": total_loss,
        "nationalTrajectories": [[trajectory, count] for trajectory, count in sorted(histogram.items())],
        "inputs": {
            "forestMasks": [{"path": p, "sha256": sha256(file_bytes(p))} for p in forests],
            "lossRasters": [{"path": p, "sha256": sha256(file_bytes(p))} for p in losses],
            "mappedExtent": {"path": args.mapped_extent, "sha256": sha256(file_bytes(args.mapped_extent))},
        },
        "claims": {
            "admitted": False,
            "released": False,
            "productionEligible": bool(args.production_claim),
            "expertReviewed": False,
        },
    }
    Path(args.sidecar).write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {output} ({total_blocks} blocks, {total_countable} countable cells)")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--forest-mask-dir", required=True)
    p.add_argument("--annual-loss-dir", required=True)
    p.add_argument("--mapped-extent", required=True)
    p.add_argument("--method-version", required=True)
    p.add_argument("--code-version", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--sidecar", required=True)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--gdal-cache-megabytes", type=int, default=96)
    p.add_argument("--strip-rows", type=int, default=1, help="block rows per strip")
    p.add_argument("--strip-columns", type=int, default=256, help="block columns per strip")
    p.add_argument("--require-whole-blocks", action="store_true")
    p.add_argument("--production-claim", action="store_true")
    return p


if __name__ == "__main__":
    main(parser().parse_args())
