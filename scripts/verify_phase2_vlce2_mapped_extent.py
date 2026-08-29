#!/usr/bin/env python3
"""Verify a written mapped-extent raster against every land-cover year, in parallel.

The builder in build_phase2_vlce2_mapped_extent.py does this too, in one process
and one year at a time. That is the right shape for a first run, where writing
the raster and proving it are one act. It is the wrong shape for a re-run: each
year is an independent comparison, the work is dominated by DEFLATE decompression
of a 1.4 GB archive into a 24.9 billion cell grid, and that is processor work on
a machine with ten cores sitting idle.

So this reads rather than writes. The raster is an input here, never an output,
which is what makes running the years concurrently safe: no worker can observe
another worker's partial state because none of them write anything.

Two quantities the builder reported from its own writing are recomputed here by
counting the raster on disk instead. That is deliberate. A count taken from the
file is evidence about the artifact; a count carried out of the writer's loop is
evidence about the writer's intent, and only the first survives the writer being
a different process, or a different day.

The verdict is fail-closed in both directions: a year that disagrees fails the
run, and a year that cannot be read fails it too. Silence is not agreement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

NODATA = 255
MAPPED = 1
UNMAPPED = NODATA
VLCE2_CLASS_VALUES = frozenset({20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230})

# Narrower strips and a smaller cache than the single-process builder uses,
# because these are multiplied by the worker count and the machine has 16 GB.
# A strip is 193,936 cells wide, so 256 rows is about 50 MB per array and three
# arrays are live at once inside the comparison.
STRIP_ROWS = 256
WORKER_CACHE_BYTES = 192 * 1024 * 1024


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    handle = gdal.VSIFOpenL(path, "rb")
    if handle is None:
        fail(f"Cannot open for hashing: {path}")
    try:
        while True:
            chunk = gdal.VSIFReadL(1, 8 * 1024 * 1024, handle)
            if not chunk:
                break
            digest.update(chunk)
    finally:
        gdal.VSIFCloseL(handle)
    return digest.hexdigest()


def source_path(root: str, year: int) -> str:
    return f"/vsizip/{root}/CA_forest_VLCE2_{year}.zip/CA_forest_VLCE2_{year}.tif"


def grid(dataset: gdal.Dataset) -> tuple:
    return (
        dataset.RasterXSize,
        dataset.RasterYSize,
        tuple(dataset.GetGeoTransform()),
        dataset.GetProjection(),
    )


def verify_year(extent_path: str, root: str, year: int) -> dict:
    """Compare one year against the written extent, cell for cell.

    Runs in its own process. Everything it touches is opened here rather than
    inherited, because a GDAL dataset handle does not survive a fork intact.
    """
    gdal.UseExceptions()
    gdal.SetCacheMax(WORKER_CACHE_BYTES)
    started = time.monotonic()

    extent = gdal.Open(extent_path, gdal.GA_ReadOnly)
    if extent is None:
        fail(f"Cannot open {extent_path}")
    path = source_path(root, year)
    source = gdal.Open(path, gdal.GA_ReadOnly)
    if source is None:
        fail(f"Cannot open {path}")
    if grid(source) != grid(extent):
        fail(f"Land cover for {year} is not on the extent grid")

    extent_band = extent.GetRasterBand(1)
    band = source.GetRasterBand(1)
    differing = 0
    for row in range(0, extent.RasterYSize, STRIP_ROWS):
        height = min(STRIP_ROWS, extent.RasterYSize - row)
        written = extent_band.ReadAsArray(0, row, extent.RasterXSize, height)
        observed = band.ReadAsArray(0, row, extent.RasterXSize, height)
        if written is None or observed is None:
            fail(f"Cannot read rows {row}..{row + height} for {year}")
        expected = np.where(observed != 0, MAPPED, UNMAPPED).astype(np.uint8)
        differing += int(np.count_nonzero(written != expected))

    return {
        "year": year,
        "path": path,
        "sha256": sha256(path),
        "differingCells": differing,
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }


def count_written(extent_path: str) -> dict:
    """Count the raster as it exists on disk, not as its writer described it."""
    extent = gdal.Open(extent_path, gdal.GA_ReadOnly)
    if extent is None:
        fail(f"Cannot open {extent_path}")
    band = extent.GetRasterBand(1)
    mapped = 0
    unmapped = 0
    other: dict[int, int] = {}
    for row in range(0, extent.RasterYSize, STRIP_ROWS):
        height = min(STRIP_ROWS, extent.RasterYSize - row)
        strip = band.ReadAsArray(0, row, extent.RasterXSize, height)
        if strip is None:
            fail(f"Cannot read extent rows {row}..{row + height}")
        is_mapped = int(np.count_nonzero(strip == MAPPED))
        is_unmapped = int(np.count_nonzero(strip == UNMAPPED))
        mapped += is_mapped
        unmapped += is_unmapped
        leftover = strip.size - is_mapped - is_unmapped
        if leftover:
            for value in np.unique(strip):
                if int(value) not in (MAPPED, UNMAPPED):
                    other[int(value)] = other.get(int(value), 0) + int(np.count_nonzero(strip == value))
    if other:
        fail(f"The extent raster holds values that are neither mapped nor unmapped: {other}")
    return {"mappedCells": mapped, "unmappedCells": unmapped}


def attribute_table_zero_count(root: str, year: int) -> dict:
    """Ask the publisher's own metadata how many cells hold value 0.

    An empty table is reported as such, never as zero: an absent cross-check is
    not a passing cross-check.
    """
    path = f"/vsizip/{root}/CA_forest_VLCE2_{year}.zip/CA_forest_VLCE2_{year}.tif.vat.dbf"
    try:
        table = gdal.OpenEx(path, gdal.OF_VECTOR)
    except RuntimeError as error:
        return {"year": year, "available": False, "reason": str(error)}
    if table is None:
        return {"year": year, "available": False, "reason": "Attribute table absent"}
    layer = table.GetLayer(0)
    rows = []
    for feature in layer:
        value = feature.GetField("VALUE")
        count = feature.GetField("COUNT")
        if value is None or count is None:
            continue
        rows.append((int(value), int(count)))
    if not rows:
        return {"year": year, "available": False, "reason": "Attribute table is empty"}
    zero = [count for value, count in rows if value == 0]
    return {
        "year": year,
        "available": True,
        "zeroCount": zero[0] if zero else 0,
        "rowCount": len(rows),
        "classValues": sorted(value for value, _ in rows if value != 0),
    }


def cross_check(root: str, years: list[int], unmapped: int, total: int) -> dict:
    per_year = [attribute_table_zero_count(root, year) for year in years]
    agreeing = [entry["year"] for entry in per_year if entry["available"] and entry["zeroCount"] == unmapped]
    disagreeing = [entry["year"] for entry in per_year if entry["available"] and entry["zeroCount"] != unmapped]
    unavailable = [entry["year"] for entry in per_year if not entry["available"]]
    return {
        "source": "publisher raster attribute table (.tif.vat.dbf)",
        "writtenUnmappedCells": unmapped,
        "totalCells": total,
        "yearsAgreeing": agreeing,
        "yearsDisagreeing": disagreeing,
        "yearsUnavailable": unavailable,
        "perYear": per_year,
    }


def main(args: argparse.Namespace) -> None:
    if os.path.exists(args.sidecar):
        fail("Refusing to overwrite an existing sidecar")
    if not os.path.exists(args.extent):
        fail(f"No extent raster at {args.extent}")

    years = list(range(args.first_year, args.last_year + 1))
    started_at = datetime.now(timezone.utc)
    started = time.monotonic()

    print(f"counting the written extent at {args.extent}", flush=True)
    counts = count_written(args.extent)
    print(f"  mapped={counts['mappedCells']:,} unmapped={counts['unmappedCells']:,}", flush=True)

    print("cross-checking against the publisher's attribute tables", flush=True)
    corroboration = cross_check(
        args.source_root, years, counts["unmappedCells"], counts["mappedCells"] + counts["unmappedCells"]
    )
    if corroboration["yearsDisagreeing"]:
        fail(f"Publisher attribute tables disagree with the written extent for {corroboration['yearsDisagreeing']}")
    print(
        f"  {len(corroboration['yearsAgreeing'])} agree, "
        f"{len(corroboration['yearsUnavailable'])} unavailable, "
        f"{len(corroboration['yearsDisagreeing'])} disagree",
        flush=True,
    )

    print(f"verifying {len(years)} years across {args.workers} workers", flush=True)
    verification: list[dict] = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(verify_year, args.extent, args.source_root, year): year for year in years}
        for future in as_completed(futures):
            entry = future.result()
            verification.append(entry)
            print(
                f"  verified {entry['year']}: differing cells = {entry['differingCells']} "
                f"({entry['elapsedSeconds']:.0f}s)",
                flush=True,
            )
    verification.sort(key=lambda entry: entry["year"])
    if [entry["year"] for entry in verification] != years:
        fail("A year was not verified; refusing to report a partial run as a complete one")
    invariant = all(entry["differingCells"] == 0 for entry in verification)

    dataset = gdal.Open(args.extent, gdal.GA_ReadOnly)
    sidecar = {
        "schemaVersion": "phase2-vlce2-mapped-extent-verification-v1",
        "status": "local-nonproduction-executed",
        "claims": {"admitted": False, "released": False, "productionEligible": False, "externalAction": False},
        "meaning": {
            "1": "The land-cover product mapped this cell.",
            "255": "The land-cover product did not map this cell. Forest and loss are Unknown here, not zero.",
            "basis": "VLCE2 writes 0 outside the extent it maps, and 0 is not one of its published class values.",
        },
        "scope": (
            "This run verified a raster it did not write. The mapped and unmapped counts below were taken by "
            "reading the raster on disk, not carried out of the writing loop, so they describe the artifact "
            "rather than the writer."
        ),
        "input": {
            "sourceVersion": args.source_version,
            "sourceRoot": args.source_root,
            "publishedClassValues": sorted(VLCE2_CLASS_VALUES),
        },
        "attributeTableCrossCheck": corroboration,
        "extentInvariance": {
            "verified": True,
            "invariantAcrossVerifiedYears": invariant,
            "years": verification,
            "claim": (
                "Every verified year writes its zero cells in exactly the same places, so the extent is a property "
                "of the product rather than of a year."
                if invariant
                else "At least one year disagrees with the reference extent, so a single extent raster is not valid."
            ),
        },
        "verified": {
            "path": args.extent,
            "byteLength": os.path.getsize(args.extent),
            "sha256": sha256(args.extent),
            "mappedCells": counts["mappedCells"],
            "unmappedCells": counts["unmappedCells"],
            "grid": {
                "width": dataset.RasterXSize,
                "height": dataset.RasterYSize,
                "geotransform": list(dataset.GetGeoTransform()),
                "crs": dataset.GetProjection(),
                "dataType": "Byte",
                "nodata": NODATA,
            },
        },
        "execution": {
            "codeVersion": args.code_version,
            "workerSha256": hashlib.sha256(Path(os.path.realpath(__file__)).read_bytes()).hexdigest(),
            "workers": args.workers,
            "startedAt": started_at.isoformat().replace("+00:00", "Z"),
            "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "elapsedSeconds": time.monotonic() - started,
            "environment": {
                "pythonVersion": sys.version.split()[0],
                "gdalVersion": gdal.VersionInfo("--version"),
                "numpyVersion": np.__version__,
            },
        },
        "productionClaim": False,
        "admitted": False,
        "released": False,
        "productionEligible": False,
    }
    with open(args.sidecar, "x", encoding="utf-8") as handle:
        json.dump(sidecar, handle, ensure_ascii=False, indent=2, sort_keys=True)
    if not invariant:
        fail("The land-cover extent is not the same in every year; a single extent raster cannot be used")


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--extent", required=True, help="The written mapped-extent raster to verify")
    command.add_argument("--source-root", required=True, help="Directory holding CA_forest_VLCE2_<year>.zip")
    command.add_argument("--sidecar", required=True)
    command.add_argument("--first-year", type=int, default=1984)
    command.add_argument("--last-year", type=int, default=2022)
    command.add_argument("--source-version", required=True)
    command.add_argument("--code-version", required=True)
    command.add_argument("--workers", type=int, default=6)
    return command


if __name__ == "__main__":
    main(parser().parse_args())
