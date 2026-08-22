#!/usr/bin/env python3
import argparse
from osgeo import gdal
import numpy as np

gdal.UseExceptions()

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["mask", "loss", "pair"])
parser.add_argument("first")
parser.add_argument("output")
parser.add_argument("--second")
parser.add_argument("--mask-output")
args = parser.parse_args()
if args.mode in ("loss", "pair") and not args.second:
    parser.error("loss/pair requires --second")
if args.mode == "pair" and not args.mask_output:
    parser.error("pair requires --mask-output")

first = gdal.Open(args.first, gdal.GA_ReadOnly)
second = gdal.Open(args.second, gdal.GA_ReadOnly) if args.second else None
if second and (first.RasterXSize != second.RasterXSize or first.RasterYSize != second.RasterYSize or first.GetGeoTransform() != second.GetGeoTransform() or first.GetProjection() != second.GetProjection()):
    raise RuntimeError("year-pair grids differ")
driver = gdal.GetDriverByName("GTiff")
options = ["TILED=YES", "BLOCKXSIZE=512", "BLOCKYSIZE=512", "COMPRESS=LZW", "BIGTIFF=IF_SAFER"]
output = driver.Create(args.output, first.RasterXSize, first.RasterYSize, 1, gdal.GDT_Byte, options=options)
output.SetGeoTransform(first.GetGeoTransform())
output.SetProjection(first.GetProjection())
target = output.GetRasterBand(1)
target.SetNoDataValue(255)
mask_output = driver.Create(args.mask_output, first.RasterXSize, first.RasterYSize, 1, gdal.GDT_Byte, options=options) if args.mask_output else None
mask_target = None
if mask_output:
    mask_output.SetGeoTransform(first.GetGeoTransform())
    mask_output.SetProjection(first.GetProjection())
    mask_target = mask_output.GetRasterBand(1)
    mask_target.SetNoDataValue(255)
band_a = first.GetRasterBand(1)
band_b = second.GetRasterBand(1) if second else None
forest = np.array([210, 220, 230], dtype=np.uint8)
block = 2048
for y in range(0, first.RasterYSize, block):
    height = min(block, first.RasterYSize - y)
    for x in range(0, first.RasterXSize, block):
        width = min(block, first.RasterXSize - x)
        a = band_a.ReadAsArray(x, y, width, height)
        mask_a = np.isin(a, forest)
        if args.mode == "mask":
            result = np.where(a == 255, 255, mask_a).astype(np.uint8)
        else:
            b = band_b.ReadAsArray(x, y, width, height)
            result = np.where((a == 255) | (b == 255), 255, mask_a & ~np.isin(b, forest)).astype(np.uint8)
            if mask_target:
                mask_target.WriteArray(np.where(b == 255, 255, np.isin(b, forest)).astype(np.uint8), x, y)
        target.WriteArray(result, x, y)
target.FlushCache()
output.FlushCache()
if mask_target:
    mask_target.FlushCache()
    mask_output.FlushCache()
