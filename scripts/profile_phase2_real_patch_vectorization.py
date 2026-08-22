#!/usr/bin/env python3
"""Bounded read-only connected-loss profile for the Phase 2 real patch gate."""

import json
import sys
import time
from osgeo import gdal

gdal.UseExceptions()
WINDOWS = [(30000, 80000), (60000, 70000), (90000, 60000), (120000, 50000)]
SIZE = 1024


def component_count(indices: set[int], width: int) -> int:
    remaining = set(indices)
    components = 0
    while remaining:
        components += 1
        stack = [remaining.pop()]
        while stack:
            cell = stack.pop()
            row, col = divmod(cell, width)
            for neighbour in (cell - width, cell + width, cell - 1, cell + 1):
                if neighbour in remaining and (neighbour // width == row or neighbour % width == col):
                    remaining.remove(neighbour)
                    stack.append(neighbour)
    return components


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: profile_phase2_real_patch_vectorization.py <loss-raster>")
    started = time.monotonic()
    dataset = gdal.Open(sys.argv[1], gdal.GA_ReadOnly)
    if dataset.RasterXSize != 193936 or dataset.RasterYSize != 128340:
        raise ValueError("Loss raster grid changed.")
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte or band.GetNoDataValue() != 255:
        raise ValueError("Loss raster type or nodata changed.")
    profiles = []
    for x, y in WINDOWS:
        array = band.ReadAsArray(x, y, SIZE, SIZE)
        values = set(map(int, array.flat))
        if not values.issubset({0, 1, 255}):
            raise ValueError(f"Unexpected loss values: {sorted(values)}")
        loss = {int(index) for index in (array == 1).nonzero()[0] * SIZE + (array == 1).nonzero()[1]}
        profiles.append({
            "xOffset": x,
            "yOffset": y,
            "width": SIZE,
            "height": SIZE,
            "lossCellCount": len(loss),
            "connectedComponentCountWithinWindow": component_count(loss, SIZE),
            "validNonLossCellCount": int((array == 0).sum()),
            "nodataCellCount": int((array == 255).sum()),
        })
    print(json.dumps({
        "schemaVersion": "witness-tree/phase2-real-patch-profile/1",
        "inputPath": sys.argv[1],
        "pair": {"fromYear": 2021, "toYear": 2022},
        "connectivity": 4,
        "windowSize": [SIZE, SIZE],
        "windows": profiles,
        "profileElapsedSeconds": round(time.monotonic() - started, 6),
        "notice": "Window components are truncated at window edges and cannot prove a national connected-patch count, time, or storage bound.",
        "productionEligible": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
