#!/usr/bin/env python3
"""Build the raster that says where the land-cover product actually looked.

VLCE2 declares nodata 255 but never writes it. Outside the extent it maps, it
writes 0, and 0 is not one of its land-cover classes: the published class list
is 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220 and 230. So a 0 cell means the
product did not map that cell, and the derived forest masks, which are 1 for
the forest classes and 0 for everything else, cannot tell an unmapped cell from
a mapped cell that holds no forest.

That distinction is the whole difference between "no forest was found here" and
"nobody looked here". Without it a summary of the settled south, or of the
prairies, reports zero forest and zero loss with complete coverage, which is a
fabricated zero rather than a measurement. This writes the missing layer once:
1 where the product mapped the cell, 255 where it did not.

The extent is treated as a property of the product, not of a year, so the
builder verifies that claim across every year it is given rather than asserting
it, along two independent lines.

The first is a full readback of each year against the written extent, which is
the authoritative one: it proves the zero cells are in the same places, not
merely that there are the same number of them.

The second is the publisher's own raster attribute table, which carries a row
for value 0 alongside the twelve classes. That row is an outside count of the
same quantity, produced by whoever built the product rather than by this code,
so agreement with it is corroboration this repository did not manufacture. Two
years ship an empty attribute table; that is an already-documented upstream
packaging defect, recorded in data/raster-defects.json, and it is reported here
as an absent cross-check rather than quietly skipped or counted as agreement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

NODATA = 255
MAPPED = 1
UNMAPPED = NODATA
# Every value the published VLCE2 class list uses. A cell holding anything else
# is not a class this build knows how to interpret, and the run stops rather
# than guessing.
VLCE2_CLASS_VALUES = frozenset({20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230})
STRIP_ROWS = 512
GDAL_CACHE_BYTES = 512 * 1024 * 1024
gdal.SetCacheMax(GDAL_CACHE_BYTES)


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
    return (dataset.RasterXSize, dataset.RasterYSize, tuple(dataset.GetGeoTransform()), dataset.GetProjection())


def build(reference_path: str, output_path: str) -> dict:
    source = gdal.Open(reference_path, gdal.GA_ReadOnly)
    if source is None:
        fail(f"Cannot open {reference_path}")
    band = source.GetRasterBand(1)
    if source.RasterCount != 1 or band.DataType != gdal.GDT_Byte:
        fail("The land-cover source must be a single Byte band")

    driver = gdal.GetDriverByName("GTiff")
    target = driver.Create(
        output_path,
        source.RasterXSize,
        source.RasterYSize,
        1,
        gdal.GDT_Byte,
        options=["COMPRESS=LZW", "TILED=YES", "BLOCKXSIZE=512", "BLOCKYSIZE=512", "BIGTIFF=YES"],
    )
    if target is None:
        fail(f"Cannot create {output_path}")
    target.SetGeoTransform(source.GetGeoTransform())
    target.SetProjection(source.GetProjection())
    out_band = target.GetRasterBand(1)
    out_band.SetNoDataValue(NODATA)

    mapped = 0
    unmapped = 0
    unexpected: dict[int, int] = {}
    for row in range(0, source.RasterYSize, STRIP_ROWS):
        height = min(STRIP_ROWS, source.RasterYSize - row)
        strip = band.ReadAsArray(0, row, source.RasterXSize, height)
        if strip is None:
            fail(f"Cannot read source rows {row}..{row + height}")
        is_mapped = strip != 0
        for value in np.unique(strip[is_mapped]):
            if int(value) not in VLCE2_CLASS_VALUES:
                unexpected[int(value)] = unexpected.get(int(value), 0) + int(np.count_nonzero(strip == value))
        out_band.WriteArray(np.where(is_mapped, MAPPED, UNMAPPED).astype(np.uint8), 0, row)
        mapped += int(np.count_nonzero(is_mapped))
        unmapped += int(strip.size - np.count_nonzero(is_mapped))
    if unexpected:
        target = out_band = None
        if os.path.exists(output_path):
            os.unlink(output_path)
        fail(f"Land-cover source holds values outside the published class list: {unexpected}")
    out_band.FlushCache()
    target.FlushCache()
    target = out_band = None
    return {"mappedCells": mapped, "unmappedCells": unmapped}


def attribute_table_zero_count(root: str, year: int) -> dict:
    """Ask the publisher's own metadata how many cells hold value 0.

    Returns the count when the table carries one. An empty table is reported as
    such, never as zero: an absent cross-check is not a passing cross-check.
    """
    path = f"/vsizip/{root}/CA_forest_VLCE2_{year}.zip/CA_forest_VLCE2_{year}.tif.vat.dbf"
    source = gdal.OpenEx(path, gdal.OF_VECTOR)
    if source is None:
        return {"year": year, "path": path, "available": False, "reason": "attribute table cannot be opened"}
    layer = source.GetLayer(0)
    rows = {}
    for feature in layer:
        rows[int(feature.GetField("Value"))] = int(feature.GetField("Count"))
    source = None
    if not rows:
        return {
            "year": year,
            "path": path,
            "available": False,
            "reason": "attribute table holds no records; see data/raster-defects.json",
        }
    return {
        "year": year,
        "path": path,
        "available": True,
        "recordCount": len(rows),
        "zeroCount": rows.get(0),
        "totalCount": sum(rows.values()),
        "classValues": sorted(value for value in rows if value != 0),
    }


def cross_check(root: str, years: list[int], unmapped: int, total: int) -> dict:
    entries = [attribute_table_zero_count(root, year) for year in years]
    available = [entry for entry in entries if entry["available"]]
    disagreeing = [
        entry["year"]
        for entry in available
        if entry["zeroCount"] != unmapped or entry["totalCount"] != total
    ]
    unavailable = [entry["year"] for entry in entries if not entry["available"]]
    for entry in entries:
        state = "unavailable" if not entry["available"] else ("agrees" if entry["year"] not in disagreeing else "DISAGREES")
        print(f"  attribute table {entry['year']}: {state}", flush=True)
    return {
        "source": "publisher raster attribute table shipped with each annual archive",
        "yearsCrossChecked": len(available),
        "yearsWithoutAnAttributeTable": unavailable,
        "yearsDisagreeing": disagreeing,
        "agrees": not disagreeing and bool(available),
        "years": entries,
        "claim": (
            "Every year whose attribute table is populated counts exactly the same number of value-0 cells as this "
            "build wrote as unmapped, and the same total cell count. The years listed as missing an attribute table "
            "are an upstream packaging defect recorded in data/raster-defects.json; they are not cross-checked here "
            "and are not counted as agreement."
        ),
    }


def verify(output_path: str, root: str, years: list[int]) -> list[dict]:
    """Read every year back against the written extent, cell for cell."""
    extent = gdal.Open(output_path, gdal.GA_ReadOnly)
    extent_band = extent.GetRasterBand(1)
    results = []
    for year in years:
        path = source_path(root, year)
        source = gdal.Open(path, gdal.GA_ReadOnly)
        if source is None:
            fail(f"Cannot open {path}")
        if grid(source) != grid(extent):
            fail(f"Land cover for {year} is not on the extent grid")
        band = source.GetRasterBand(1)
        differing = 0
        started = time.monotonic()
        for row in range(0, extent.RasterYSize, STRIP_ROWS):
            height = min(STRIP_ROWS, extent.RasterYSize - row)
            written = extent_band.ReadAsArray(0, row, extent.RasterXSize, height)
            observed = band.ReadAsArray(0, row, extent.RasterXSize, height)
            expected = np.where(observed != 0, MAPPED, UNMAPPED).astype(np.uint8)
            differing += int(np.count_nonzero(written != expected))
        results.append(
            {
                "year": year,
                "path": path,
                "sha256": sha256(path),
                "differingCells": differing,
                "elapsedSeconds": round(time.monotonic() - started, 3),
            }
        )
        print(f"  verified {year}: differing cells = {differing}", flush=True)
        source = None
    return results


def main(args: argparse.Namespace) -> None:
    if os.path.exists(args.output) or os.path.exists(args.sidecar):
        fail("Refusing to overwrite an existing extent raster or sidecar")
    parent = os.path.dirname(os.path.abspath(args.output))
    if parent and not os.path.isdir(parent):
        os.makedirs(parent, exist_ok=True)

    years = list(range(args.first_year, args.last_year + 1))
    if args.reference_year not in years:
        fail("The reference year must be one of the verified years")

    started_at = datetime.now(timezone.utc)
    started = time.monotonic()
    reference = source_path(args.source_root, args.reference_year)
    print(f"building extent from {args.reference_year}", flush=True)
    counts = build(reference, args.output)
    print(f"  mapped={counts['mappedCells']:,} unmapped={counts['unmappedCells']:,}", flush=True)

    print("cross-checking against the publisher's attribute tables", flush=True)
    corroboration = cross_check(
        args.source_root, years, counts["unmappedCells"], counts["mappedCells"] + counts["unmappedCells"]
    )
    if corroboration["yearsDisagreeing"]:
        fail(f"Publisher attribute tables disagree with the written extent for {corroboration['yearsDisagreeing']}")

    verification = verify(args.output, args.source_root, years) if args.verify else []
    invariant = all(entry["differingCells"] == 0 for entry in verification) if verification else None

    dataset = gdal.Open(args.output, gdal.GA_ReadOnly)
    sidecar = {
        "schemaVersion": "phase2-vlce2-mapped-extent-v1",
        "status": "local-nonproduction-executed",
        "claims": {"admitted": False, "released": False, "productionEligible": False, "externalAction": False},
        "meaning": {
            "1": "The land-cover product mapped this cell.",
            "255": "The land-cover product did not map this cell. Forest and loss are Unknown here, not zero.",
            "basis": "VLCE2 writes 0 outside the extent it maps, and 0 is not one of its published class values.",
        },
        "input": {
            "sourceVersion": args.source_version,
            "sourceRoot": args.source_root,
            "referenceYear": args.reference_year,
            "reference": {"path": reference, "sha256": sha256(reference)},
            "publishedClassValues": sorted(VLCE2_CLASS_VALUES),
        },
        "attributeTableCrossCheck": corroboration,
        "extentInvariance": {
            "verified": bool(verification),
            "invariantAcrossVerifiedYears": invariant,
            "years": verification,
            "claim": (
                "Every verified year writes its zero cells in exactly the same places, so the extent is a property "
                "of the product rather than of a year."
                if invariant
                else "Not verified in this run."
                if not verification
                else "At least one year disagrees with the reference extent, so a single extent raster is not valid."
            ),
        },
        "output": {
            "path": args.output,
            "byteLength": os.path.getsize(args.output),
            "sha256": sha256(args.output),
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
    if verification and not invariant:
        fail("The land-cover extent is not the same in every year; a single extent raster cannot be used")


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--source-root", required=True, help="Directory holding CA_forest_VLCE2_<year>.zip")
    command.add_argument("--output", required=True)
    command.add_argument("--sidecar", required=True)
    command.add_argument("--reference-year", type=int, default=1984)
    command.add_argument("--first-year", type=int, default=1984)
    command.add_argument("--last-year", type=int, default=2022)
    command.add_argument("--source-version", required=True)
    command.add_argument("--code-version", required=True)
    command.add_argument("--verify", action="store_true", help="Read every year back against the written extent")
    return command


if __name__ == "__main__":
    main(parser().parse_args())
