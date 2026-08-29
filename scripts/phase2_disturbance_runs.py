#!/usr/bin/env python3
"""Extracts the recorded-disturbance rasters into per-year run stores.

The attribution stage has to answer, for every one of hundreds of millions of
loss patches, which cells also carry a recorded harvest or fire. Random access
into a 193936 x 128340 raster once per patch is not survivable, so both rasters
are read once, in row order, and reduced to sparse runs keyed by the year the
raster records. Attribution then becomes a merge join of two streams that are
already sorted the same way.

A note on what these rasters can and cannot say. The value is the year of the
recorded event and zero means "nothing recorded here". Zero is also what the
grid holds outside the area the product maps, and the file declares a nodata
value (65536) that a UInt16 band cannot store, so no cell is ever flagged as
nodata. Absence of record and absence of knowledge are therefore encoded
identically and cannot be separated by reading the raster. Nothing downstream
may read a zero as evidence that no harvest or fire occurred.
"""
import argparse
import hashlib
import json
import pathlib
import numpy as np
from osgeo import gdal

gdal.UseExceptions()

RUN_DTYPE = np.dtype([("row", "<u4"), ("x0", "<u4"), ("x1", "<u4")])

parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["harvest", "fire"])
parser.add_argument("raster")
parser.add_argument("out_dir")
parser.add_argument("--reference", required=True, help="a loss raster the grid must match")
parser.add_argument("--strip-rows", type=int, default=256)
args = parser.parse_args()

source = gdal.Open(args.raster, gdal.GA_ReadOnly)
reference = gdal.Open(args.reference, gdal.GA_ReadOnly)
if (
    source.RasterXSize != reference.RasterXSize
    or source.RasterYSize != reference.RasterYSize
    or source.GetGeoTransform() != reference.GetGeoTransform()
    or source.GetProjection() != reference.GetProjection()
):
    raise RuntimeError("the disturbance grid does not match the loss grid")

out_dir = pathlib.Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
band = source.GetRasterBand(1)
width = source.RasterXSize
height = source.RasterYSize

handles = {}
digests = {}
counts = {}
cells = {}


def sink(year):
    if year not in handles:
        path = out_dir / f"{args.kind}-{year}.runs.bin"
        handles[year] = path.open("wb")
        digests[year] = hashlib.sha256()
        counts[year] = 0
        cells[year] = 0
    return handles[year]


for top in range(0, height, args.strip_rows):
    rows = min(args.strip_rows, height - top)
    strip = band.ReadAsArray(0, top, width, rows)
    for offset in range(rows):
        line = strip[offset]
        index = np.flatnonzero(line)
        if index.size == 0:
            continue
        values = line[index]
        breaks = np.flatnonzero((np.diff(index) != 1) | (np.diff(values) != 0))
        starts = np.concatenate(([0], breaks + 1))
        ends = np.concatenate((breaks, [index.size - 1]))
        years = values[starts]
        x0 = index[starts]
        x1 = index[ends]
        for year in np.unique(years):
            pick = years == year
            record = np.empty(int(pick.sum()), dtype=RUN_DTYPE)
            record["row"] = top + offset
            record["x0"] = x0[pick]
            record["x1"] = x1[pick]
            payload = record.tobytes()
            key = int(year)
            sink(key).write(payload)
            digests[key].update(payload)
            counts[key] += record.size
            cells[key] += int((x1[pick] - x0[pick] + 1).sum())
    print(f"{args.kind} rows {top + rows}/{height}", flush=True)

for handle in handles.values():
    handle.close()

manifest = {
    "kind": args.kind,
    "source": args.raster,
    "grid": {"width": width, "height": height, "matchesLossGrid": True},
    "zeroMeaning": "nothing recorded; indistinguishable from outside the mapped area",
    "years": {
        str(year): {
            "runs": counts[year],
            "cells": cells[year],
            "sha256": digests[year].hexdigest(),
        }
        for year in sorted(handles)
    },
    "totals": {
        "runs": sum(counts.values()),
        "cells": sum(cells.values()),
    },
}
(out_dir / f"{args.kind}-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest["totals"]))
