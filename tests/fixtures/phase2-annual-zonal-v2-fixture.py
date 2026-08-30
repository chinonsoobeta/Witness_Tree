#!/usr/bin/env python3
"""Five-district fixture for the annual bounded zonal worker, schema v2.

The fifth district is the one that matters. Its forest and loss rasters hold 0
in every year, exactly like a settled-south district in the real data, but the
mapped extent says the product never looked there. Under v1 that district
reported zero forest and zero loss with complete coverage, which is the
fabricated zero this schema exists to remove; under v2 it must report Unknown
and a none-mapped grade.
"""

import json
import os
import sys

import numpy as np
from osgeo import gdal, osr


directory = sys.argv[1]
os.makedirs(directory, exist_ok=True)
forest_dir = os.path.join(directory, "masks")
loss_dir = os.path.join(directory, "loss")
os.makedirs(forest_dir, exist_ok=True)
os.makedirs(loss_dir, exist_ok=True)

driver = gdal.GetDriverByName("GTiff")
reference = osr.SpatialReference()
reference.ImportFromEPSG(3857)
transform = [0, 100, 0, 100, 0, -100]
WIDTH = 5


def write(path, values):
    target = driver.Create(path, WIDTH, 1, 1, gdal.GDT_Byte)
    target.SetGeoTransform(transform)
    target.SetProjection(reference.ExportToWkt())
    band = target.GetRasterBand(1)
    band.SetNoDataValue(255)
    band.WriteArray(np.array([values], dtype=np.uint8))
    band.FlushCache()
    target.FlushCache()
    target = None


# 1 where the product mapped the cell, 255 where it did not. Constant across
# years, because the extent is a property of the product rather than of a year.
write(os.path.join(directory, "mapped-extent.tif"), [1, 1, 1, 1, 255])

for year in range(1984, 2022):
    # The first period proves loss, Unknown, and loss outside the denominator;
    # later periods prove that every pair is consumed without changing those
    # first-period values. The last column stays 0 throughout: mapped-looking
    # data in an unmapped place.
    if year == 1984:
        values = [1, 1, 255, 0, 0]
    elif year == 1985:
        values = [1, 255, 1, 0, 0]
    else:
        values = [1, 1, 1, 0, 0]
    write(os.path.join(forest_dir, f"forest-mask-{year}.tif"), values)

for year in range(1984, 2022):
    if year == 1984:
        values = [1, 1, 255, 1, 0]
    elif year == 1985:
        values = [0, 1, 0, 0, 0]
    else:
        values = [0, 0, 0, 0, 0]
    write(os.path.join(loss_dir, f"detected-forest-loss-{year}-{year + 1}.tif"), values)

features = []
for index, (province, pruid) in enumerate([("BC", 59), ("AB", 48), ("ON", 35), ("QC", 24), ("SK", 47)]):
    left = index * 100
    features.append({
        "type": "Feature",
        "properties": {"PRUID": pruid, "province": province, "ED_NAME": f"{province} fixture district"},
        "geometry": {"type": "Polygon", "coordinates": [[[left, 0], [left + 100, 0], [left + 100, 100], [left, 100], [left, 0]]]},
    })
boundaries = {
    "type": "FeatureCollection",
    "name": "annual-zonal-v2-fixture",
    "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
    "features": features,
}
with open(os.path.join(directory, "boundaries.geojson"), "w", encoding="utf8") as target:
    json.dump(boundaries, target, separators=(",", ":"))

manifest = {
    "forestMasks": [{"year": year, "path": f"masks/forest-mask-{year}.tif"} for year in range(1984, 2022)],
    "annualLossRasters": [{"fromYear": year, "toYear": year + 1, "path": f"loss/detected-forest-loss-{year}-{year + 1}.tif"} for year in range(1984, 2022)],
}
with open(os.path.join(directory, "manifest.json"), "w", encoding="utf8") as target:
    json.dump(manifest, target, separators=(",", ":"))
