#!/usr/bin/env python3
"""Create a tiny aligned GDAL fixture for the fractional boundary correction.

The bottom raster row contains four target polygons:

* BC and QC each end at x=14/74, leaving a 0.4-cell boundary fraction;
* AB has a rectangular hole, leaving two 0.4-cell shell fractions;
* ON is exactly cell aligned and supplies full cells;
* the polygon top/bottom edges touch neighbouring cells whose exact area is 0.

The first forest mask also includes one Unknown BC cell so the correction test
can prove that Unknown is weighted by the same fractional area.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
from osgeo import gdal, osr


directory = sys.argv[1]
wide = "--wide" in sys.argv[2:]
os.makedirs(directory, exist_ok=True)
forest_dir = os.path.join(directory, "masks")
loss_dir = os.path.join(directory, "loss")
os.makedirs(forest_dir, exist_ok=True)
os.makedirs(loss_dir, exist_ok=True)

driver = gdal.GetDriverByName("GTiff")
spatial_ref = osr.SpatialReference()
spatial_ref.ImportFromEPSG(3857)
transform = [0, 10, 0, 20, 0, -10]
width = 1030 if wide else 8


def write_raster(path: str, values: list[list[int]]) -> None:
    target = driver.Create(path, width, 2, 1, gdal.GDT_Byte)
    target.SetGeoTransform(transform)
    target.SetProjection(spatial_ref.ExportToWkt())
    band = target.GetRasterBand(1)
    band.SetNoDataValue(255)
    band.WriteArray(np.asarray(values, dtype=np.uint8))
    band.FlushCache()
    target.FlushCache()
    target = None


zero_forest = [[0] * width, [1] * width] if wide else [[0] * 8, [1, 255, 1, 1, 1, 1, 1, 1]]
first_loss = [[0] * width, [1 if index % 3 == 0 else 0 for index in range(width)]] if wide else [[0] * 8, [1, 0, 1, 0, 0, 0, 0, 1]]
zero_loss = [[0] * width, [0] * width]
for year in range(1984, 2022):
    write_raster(os.path.join(forest_dir, f"forest-mask-{year}.tif"), zero_forest)
    write_raster(os.path.join(loss_dir, f"detected-forest-loss-{year}-{year + 1}.tif"), first_loss if year == 1984 else zero_loss)


def polygon(outer: list[list[float]], holes: list[list[list[float]]] | None = None) -> dict[str, object]:
    return {"type": "Polygon", "coordinates": [outer, *(holes or [])]}


def ring(left: float, right: float, bottom: float = 0, top: float = 10) -> list[list[float]]:
    return [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]


if wide:
    features = [
        {"type": "Feature", "properties": {"PRUID": 59, "province": "BC"}, "geometry": polygon(ring(0, 10244))},
        {"type": "Feature", "properties": {"PRUID": 48, "province": "AB"}, "geometry": polygon(ring(10245, 10254))},
        {"type": "Feature", "properties": {"PRUID": 35, "province": "ON"}, "geometry": polygon(ring(10255, 10264))},
        {"type": "Feature", "properties": {"PRUID": 24, "province": "QC"}, "geometry": polygon(ring(10265, 10284))},
    ]
else:
    features = [
        {"type": "Feature", "properties": {"PRUID": 59, "province": "BC"}, "geometry": polygon(ring(0, 14))},
        {
            "type": "Feature",
            "properties": {"PRUID": 48, "province": "AB"},
            "geometry": polygon(ring(20, 40), [[[24, 2], [24, 8], [36, 8], [36, 2], [24, 2]]]),
        },
        {"type": "Feature", "properties": {"PRUID": 35, "province": "ON"}, "geometry": polygon(ring(40, 60))},
        {"type": "Feature", "properties": {"PRUID": 24, "province": "QC"}, "geometry": polygon(ring(60, 74))},
    ]
boundaries = {
    "type": "FeatureCollection",
    "name": "phase2-annual-zonal-fractional-correction-fixture",
    "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
    "features": features,
}
with open(os.path.join(directory, "boundaries.geojson"), "w", encoding="utf-8") as stream:
    json.dump(boundaries, stream, separators=(",", ":"))

manifest = {
    "forestMasks": [{"year": year, "path": f"masks/forest-mask-{year}.tif"} for year in range(1984, 2022)],
    "annualLossRasters": [{"fromYear": year, "toYear": year + 1, "path": f"loss/detected-forest-loss-{year}-{year + 1}.tif"} for year in range(1984, 2022)],
}
with open(os.path.join(directory, "manifest.json"), "w", encoding="utf-8") as stream:
    json.dump(manifest, stream, separators=(",", ":"))
