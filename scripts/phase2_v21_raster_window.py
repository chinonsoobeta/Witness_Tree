#!/usr/bin/env python3
"""Windowed, raster-only writer for the Phase 2 V2.1 selected products.

It deliberately has no vector, OGR, or geometry dependency.  Its only two
operations are copying a selected forest mask and OR-ing a complete run of
adjacent annual loss rasters while preserving Unknown (255).
"""
import argparse
import hashlib
import json
import os
import platform
import resource
import time

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
NODATA = 255
WINDOW = 2048
OPTIONS = ["TILED=YES", "BLOCKXSIZE=512", "BLOCKYSIZE=512", "COMPRESS=LZW", "BIGTIFF=IF_SAFER"]


def grid(dataset):
    band = dataset.GetRasterBand(1)
    return (dataset.RasterXSize, dataset.RasterYSize, tuple(dataset.GetGeoTransform()), dataset.GetProjection(), band.GetNoDataValue())


def grid_metadata(dataset):
    band = dataset.GetRasterBand(1)
    spatial_reference = osr.SpatialReference()
    spatial_reference.ImportFromWkt(dataset.GetProjection())
    return {
        "width": dataset.RasterXSize,
        "height": dataset.RasterYSize,
        "geotransform": list(dataset.GetGeoTransform()),
        "crs": dataset.GetProjection(),
        "crsSha256": hashlib.sha256(dataset.GetProjection().encode()).hexdigest(),
        "crsProj4": spatial_reference.ExportToProj4(),
        "nodataValue": band.GetNoDataValue(),
        "dataType": gdal.GetDataTypeName(band.DataType),
    }


def require_grid(reference, candidate, label):
    if grid(reference) != grid(candidate):
        raise RuntimeError(f"{label} does not have the exact reference grid, CRS, geotransform, and nodata.")
    if candidate.GetRasterBand(1).DataType != gdal.GDT_Byte:
        raise RuntimeError(f"{label} is not a Byte raster.")


def output_like(source, path):
    driver = gdal.GetDriverByName("GTiff")
    output = driver.Create(path, source.RasterXSize, source.RasterYSize, 1, gdal.GDT_Byte, options=OPTIONS)
    output.SetGeoTransform(source.GetGeoTransform())
    output.SetProjection(source.GetProjection())
    output.GetRasterBand(1).SetNoDataValue(NODATA)
    return output


def windows(source):
    for y in range(0, source.RasterYSize, WINDOW):
        for x in range(0, source.RasterXSize, WINDOW):
            yield x, y, min(WINDOW, source.RasterXSize - x), min(WINDOW, source.RasterYSize - y)


def write_snapshot(source, output):
    src = gdal.Open(source, gdal.GA_ReadOnly)
    if src is None:
        raise RuntimeError(f"Cannot open {source}")
    if src.GetRasterBand(1).GetNoDataValue() != NODATA:
        raise RuntimeError("Snapshot input nodata must be exactly 255.")
    if src.GetRasterBand(1).DataType != gdal.GDT_Byte:
        raise RuntimeError("Snapshot input must be a Byte raster.")
    target = output_like(src, output)
    source_band, target_band = src.GetRasterBand(1), target.GetRasterBand(1)
    for x, y, width, height in windows(src):
        values = source_band.ReadAsArray(x, y, width, height)
        if np.any((values != 0) & (values != 1) & (values != NODATA)):
            raise RuntimeError("Snapshot mask has a value other than 0, 1, or 255.")
        target_band.WriteArray(values, x, y)
    target_band.FlushCache()
    target.FlushCache()
    target_band = None
    target = None
    source_band = None
    src = None


def write_interval(inputs, output):
    if not inputs:
        raise RuntimeError("An interval requires at least one adjacent annual loss raster.")
    datasets = [gdal.Open(path, gdal.GA_ReadOnly) for path in inputs]
    if any(dataset is None for dataset in datasets):
        raise RuntimeError("Cannot open an annual loss raster.")
    reference = datasets[0]
    if reference.GetRasterBand(1).GetNoDataValue() != NODATA:
        raise RuntimeError("Annual loss input nodata must be exactly 255.")
    if reference.GetRasterBand(1).DataType != gdal.GDT_Byte:
        raise RuntimeError("Annual loss input must be a Byte raster.")
    for index, dataset in enumerate(datasets[1:], 2):
        require_grid(reference, dataset, f"annual input {index}")
    target = output_like(reference, output)
    source_bands = [dataset.GetRasterBand(1) for dataset in datasets]
    target_band = target.GetRasterBand(1)
    for x, y, width, height in windows(reference):
        values = [band.ReadAsArray(x, y, width, height) for band in source_bands]
        for array in values:
            if np.any((array != 0) & (array != 1) & (array != NODATA)):
                raise RuntimeError("Annual loss raster has a value other than 0, 1, or 255.")
        stack = np.stack(values)
        # An observed loss wins. Otherwise one Unknown prevents an invented zero.
        result = np.where(np.any(stack == 1, axis=0), 1, np.where(np.any(stack == NODATA, axis=0), NODATA, 0)).astype(np.uint8)
        target_band.WriteArray(result, x, y)
    target_band.FlushCache()
    target.FlushCache()
    target_band = None
    target = None
    source_bands = None
    datasets = None


parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["snapshot", "interval"])
parser.add_argument("output")
parser.add_argument("inputs", nargs="+")
args = parser.parse_args()
if os.path.exists(args.output):
    raise RuntimeError("Refusing to overwrite an existing output raster.")
started = time.monotonic()
if args.mode == "snapshot":
    if len(args.inputs) != 1:
        parser.error("snapshot requires exactly one forest-mask input")
    write_snapshot(args.inputs[0], args.output)
else:
    write_interval(args.inputs, args.output)
output_for_metadata = gdal.Open(args.output, gdal.GA_ReadOnly)
if output_for_metadata is None:
    raise RuntimeError("Cannot reopen the newly written output raster for observed-grid verification.")
maxrss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
if platform.system() != "Darwin":
    maxrss *= 1024
print(json.dumps({"elapsedSeconds": time.monotonic() - started, "peakRssBytes": int(maxrss), "scratchDiskPeakBytes": 0, "window": [WINDOW, WINDOW], "outputGrid": grid_metadata(output_for_metadata)}))
