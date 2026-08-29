#!/usr/bin/env python3
"""Four districts the land-cover product never mapped, and nothing else.

Forest and loss are 0 in every year, which is exactly what the real product
writes outside the extent it maps. The mapped extent says 255: nobody looked.
Four districts rather than one only because the province path of both workers
requires all four of its targets to be present. The two workers are asked the
same question about the same bytes.
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


def write(path, value):
    target = driver.Create(path, 4, 1, 1, gdal.GDT_Byte)
    target.SetGeoTransform([0, 100, 0, 100, 0, -100])
    target.SetProjection(reference.ExportToWkt())
    band = target.GetRasterBand(1)
    band.SetNoDataValue(255)
    band.WriteArray(np.full((1, 4), value, dtype=np.uint8))
    band.FlushCache()
    target.FlushCache()
    target = None


write(os.path.join(directory, "mapped-extent.tif"), 255)
for year in range(1984, 2022):
    write(os.path.join(directory, "masks", f"forest-mask-{year}.tif"), 0)
    write(os.path.join(directory, "loss", f"detected-forest-loss-{year}-{year + 1}.tif"), 0)

boundaries = {
    "type": "FeatureCollection",
    "name": "unmapped-district-fixture",
    "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
    "features": [
        {
            "type": "Feature",
            "properties": {"PRUID": pruid, "province": province},
            "geometry": {"type": "Polygon", "coordinates": [[[index * 100, 0], [index * 100 + 100, 0], [index * 100 + 100, 100], [index * 100, 100], [index * 100, 0]]]},
        }
        for index, (province, pruid) in enumerate([("BC", 59), ("AB", 48), ("ON", 35), ("QC", 24)])
    ],
}
with open(os.path.join(directory, "boundaries.geojson"), "w", encoding="utf8") as target:
    json.dump(boundaries, target, separators=(",", ":"))

manifest = {
    "forestMasks": [{"year": year, "path": f"masks/forest-mask-{year}.tif"} for year in range(1984, 2022)],
    "annualLossRasters": [{"fromYear": year, "toYear": year + 1, "path": f"loss/detected-forest-loss-{year}-{year + 1}.tif"} for year in range(1984, 2022)],
}
with open(os.path.join(directory, "manifest.json"), "w", encoding="utf8") as target:
    json.dump(manifest, target, separators=(",", ":"))
