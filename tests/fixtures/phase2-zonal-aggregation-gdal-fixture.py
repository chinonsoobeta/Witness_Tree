#!/usr/bin/env python3
import json
import os
import sys

import numpy as np
from osgeo import gdal, osr


def write_raster(path, epsg, transform, values=None, width=2):
    driver = gdal.GetDriverByName("GTiff")
    data = driver.Create(path, width, 2, 1, gdal.GDT_Byte)
    data.SetGeoTransform(transform)
    ref = osr.SpatialReference(); ref.ImportFromEPSG(epsg)
    data.SetProjection(ref.ExportToWkt())
    if values is None:
        values = [[1, 0], [0, 255]]
    band = data.GetRasterBand(1); band.SetNoDataValue(255); band.WriteArray(np.array(values, dtype=np.uint8)); band.FlushCache()
    data.FlushCache()


if len(sys.argv) == 3 and sys.argv[1] == "--geographic":
    write_raster(sys.argv[2], 4326, [0, 1, 0, 2, 0, -1])
    raise SystemExit(0)
directory = sys.argv[1]
os.makedirs(directory, exist_ok=True)
write_raster(os.path.join(directory, "forest-mask.tif"), 3857, [0, 100, 0, 200, 0, -100], [[1, 1], [0, 255]])
write_raster(os.path.join(directory, "change-raster.tif"), 3857, [0, 100, 0, 200, 0, -100], [[1, 0], [0, 255]])
write_raster(os.path.join(directory, "change-grid-mismatch.tif"), 3857, [0, 100, 0, 200, 0, -100], [[1, 0, 0], [0, 255, 0]], width=3)
write_raster(os.path.join(directory, "change-loss-outside-forest.tif"), 3857, [0, 100, 0, 200, 0, -100], [[1, 0], [1, 255]])
with open(os.path.join(directory, "boundaries.geojson"), "w", encoding="utf8") as target:
    fixture = {"type": "FeatureCollection", "name": "fixture", "crs": {"type": "name", "properties": {"name": "EPSG:3857"}}, "features": [
      {"type": "Feature", "properties": {"id": "west"}, "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [100, 0], [100, 200], [0, 200], [0, 0]]]}},
      {"type": "Feature", "properties": {"id": "east"}, "geometry": {"type": "Polygon", "coordinates": [[[100, 0], [200, 0], [200, 200], [100, 200], [100, 0]]]}},
    ]}
    json.dump(fixture, target, separators=(",", ":"))
source = osr.SpatialReference(); source.ImportFromEPSG(3857)
destination = osr.SpatialReference(); destination.ImportFromEPSG(4326)
transform = osr.CoordinateTransformation(source, destination)
for feature in fixture["features"]:
    ring = []
    for x, y in feature["geometry"]["coordinates"][0]:
        point = transform.TransformPoint(x, y)
        ring.append([point[0], point[1]])
    feature["geometry"]["coordinates"] = [ring]
fixture["crs"] = {"type": "name", "properties": {"name": "EPSG:4326"}}
with open(os.path.join(directory, "boundaries-4326.geojson"), "w", encoding="utf8") as target:
    json.dump(fixture, target, separators=(",", ":"))
