#!/usr/bin/env python3
"""One district that is half mapped and half not.

Cell 0 is mapped, holds forest, and loses it in every interval. Cell 1 is
outside the extent the product mapped, and like the real product it holds 0
for both forest and loss there. BC spans both cells; the other three targets
sit inside the mapped cell only, because both workers require all four.

This is the case that separates the two halves of the defect. The known
subtotals are read from the mapped cell alone and so are the same under either
worker. What differs is the claim made about them.
"""

import json
import os
import sys

import numpy as np
from osgeo import gdal, osr


directory = sys.argv[1]
os.makedirs(directory, exist_ok=True)
for name in ("masks", "loss"):
    os.makedirs(os.path.join(directory, name), exist_ok=True)

driver = gdal.GetDriverByName("GTiff")
reference = osr.SpatialReference()
reference.ImportFromEPSG(3857)


def write(path, values):
    target = driver.Create(path, 2, 1, 1, gdal.GDT_Byte)
    target.SetGeoTransform([0, 100, 0, 100, 0, -100])
    target.SetProjection(reference.ExportToWkt())
    band = target.GetRasterBand(1)
    band.SetNoDataValue(255)
    band.WriteArray(np.array([values], dtype=np.uint8))
    band.FlushCache()
    target.FlushCache()
    target = None


write(os.path.join(directory, "mapped-extent.tif"), [1, 255])
for year in range(1984, 2022):
    write(os.path.join(directory, "masks", f"forest-mask-{year}.tif"), [1, 0])
    write(os.path.join(directory, "loss", f"detected-forest-loss-{year}-{year + 1}.tif"), [1, 0])

features = [{
    "type": "Feature",
    "properties": {"PRUID": 59, "province": "BC"},
    "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]]]},
}]
for province, pruid in [("AB", 48), ("ON", 35), ("QC", 24)]:
    features.append({
        "type": "Feature",
        "properties": {"PRUID": pruid, "province": province},
        "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]},
    })
with open(os.path.join(directory, "boundaries.geojson"), "w", encoding="utf8") as target:
    json.dump({
        "type": "FeatureCollection",
        "name": "partly-mapped-fixture",
        "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
        "features": features,
    }, target, separators=(",", ":"))

with open(os.path.join(directory, "manifest.json"), "w", encoding="utf8") as target:
    json.dump({
        "forestMasks": [{"year": year, "path": f"masks/forest-mask-{year}.tif"} for year in range(1984, 2022)],
        "annualLossRasters": [{"fromYear": year, "toYear": year + 1, "path": f"loss/detected-forest-loss-{year}-{year + 1}.tif"} for year in range(1984, 2022)],
    }, target, separators=(",", ":"))
