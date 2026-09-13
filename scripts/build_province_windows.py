#!/usr/bin/env python3
"""Derive each province's pixel window into the national NTEMS grid and rasterize its mask.

A province is a fixed rectangle of cells in the shared 30 m grid, so once the
window is known every national product can be read through it with no
reprojection and no resampling. Only the boundary vector is reprojected, and
that happens once, here.

Two traps are handled explicitly.

`gdal_rasterize -tap` snaps the target origin to a multiple of the pixel size.
The national origin -2660910.524 is not a multiple of 30, so -tap would shift it
to -2660940, a 29.476 m offset, after which every mask cell straddles two
product cells and every count is quietly wrong. The extent here is computed from
the national origin directly and -tap is never passed. The result is verified
integral before it is written to the manifest.

The window is snapped outward to whole cells. Snapping inward would clip real
land off the province edge, and a boundary edition that silently loses its own
coastline is worse than one that carries a few empty cells.

The boundary edition is StatCan 2021 for every province here, so the four are
mutually comparable. That is deliberately not the same source as the British
Columbia terrestrial boundary used by the earlier single-province jobs, and the
difference between them is a measurement of the boundary-intersection condition
rather than a discrepancy to hide.
"""
import json
import os
import subprocess
import sys

from osgeo import gdal, ogr, osr

from bc_forest_window import DATA_ROOT, GRID_HEIGHT, GRID_TRANSFORM, GRID_WIDTH, assert_aligned

gdal.UseExceptions()
ogr.UseExceptions()

WORKSPACE = os.environ.get(
    "WITNESS_TREE_PROVINCIAL_WORKSPACE", f"{DATA_ROOT}/derived/provincial-annual-series-20260909"
)
BOUNDARY = f"{WORKSPACE}/boundary/lpr_000b21a_e.shp"
TARGET_WKT = f"{DATA_ROOT}/derived/bc-treed-extent-20260909/target.wkt"

PROVINCES = {"48": "Alberta", "35": "Ontario", "24": "Quebec", "59": "British Columbia"}

X0, PX, _, Y0, _, PY = GRID_TRANSFORM  # PY is negative


def window_for(xmin, ymin, xmax, ymax):
    """Outward-snapped pixel window into the national grid, clamped to it."""
    xoff = max(0, int((xmin - X0) // PX))
    xend = min(GRID_WIDTH, int(-(-(xmax - X0) // PX)))
    yoff = max(0, int((Y0 - ymax) // -PY))
    yend = min(GRID_HEIGHT, int(-(-(Y0 - ymin) // -PY)))
    return xoff, yoff, xend - xoff, yend - yoff


def main():
    target = osr.SpatialReference()
    target.ImportFromWkt(open(TARGET_WKT, encoding="utf-8").read())
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    source_ds = ogr.Open(BOUNDARY)
    layer = source_ds.GetLayer()
    source = layer.GetSpatialRef()
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(source, target)

    manifest = {"boundarySource": os.path.basename(BOUNDARY),
                "boundaryEdition": "Statistics Canada 2021 provincial boundary file",
                "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT, "transform": list(GRID_TRANSFORM)},
                "provinces": {}}

    os.makedirs(f"{WORKSPACE}/masks", exist_ok=True)
    driver = ogr.GetDriverByName("GPKG")

    for pruid, name in PROVINCES.items():
        slug = name.lower().replace(" ", "-")
        gpkg = f"{WORKSPACE}/masks/{slug}.gpkg"
        if os.path.exists(gpkg):
            os.remove(gpkg)
        out_ds = driver.CreateDataSource(gpkg)
        out_layer = out_ds.CreateLayer(slug, target, ogr.wkbMultiPolygon)

        layer.SetAttributeFilter(f"PRUID = '{pruid}'")
        found = 0
        for feature in layer:
            geom = feature.GetGeometryRef().Clone()
            geom.Transform(transform)
            new = ogr.Feature(out_layer.GetLayerDefn())
            new.SetGeometry(geom)
            out_layer.CreateFeature(new)
            found += 1
        layer.ResetReading()
        if found != 1:
            raise SystemExit(f"{name}: expected one boundary feature, found {found}")

        xmin, xmax, ymin, ymax = out_layer.GetExtent()
        out_ds = None
        xoff, yoff, xsize, ysize = window_for(xmin, ymin, xmax, ymax)

        # Extent expressed from the national origin, so the mask grid is the product grid.
        te = (X0 + xoff * PX, Y0 + (yoff + ysize) * PY, X0 + (xoff + xsize) * PX, Y0 + yoff * PY)
        mask = f"{WORKSPACE}/masks/{slug}_mask.tif"
        subprocess.run(
            ["gdal_rasterize", "-q", "-burn", "1", "-ot", "Byte", "-init", "0",
             "-ts", str(xsize), str(ysize),
             "-te", *[repr(v) for v in te],
             "-co", "TILED=YES", "-co", "BLOCKXSIZE=512", "-co", "BLOCKYSIZE=512",
             "-co", "COMPRESS=LZW", "-co", "BIGTIFF=YES",
             gpkg, mask],
            check=True,
        )
        # The mask must land on the national grid at exactly the window computed above.
        dx, dy = assert_aligned(mask)
        if (dx, dy) != (xoff, yoff):
            raise SystemExit(f"{name}: mask origin ({dx}, {dy}) does not match window ({xoff}, {yoff})")
        ds = gdal.Open(mask)
        if (ds.RasterXSize, ds.RasterYSize) != (xsize, ysize):
            raise SystemExit(f"{name}: mask size {ds.RasterXSize}x{ds.RasterYSize} does not match window")

        cells = 0
        band = ds.GetRasterBand(1)
        for y in range(0, ysize, 4096):
            h = min(4096, ysize - y)
            cells += int(band.ReadAsArray(0, y, xsize, h).astype(bool).sum())

        manifest["provinces"][slug] = {
            "name": name, "pruid": pruid, "mask": mask,
            "window": {"xoff": xoff, "yoff": yoff, "xsize": xsize, "ysize": ysize},
            "landCells": cells, "landHectares": round(cells * 0.09, 1),
        }
        print(f"{name}: window ({xoff}, {yoff}) {xsize}x{ysize}, "
              f"{cells} cells, {cells * 0.09:,.1f} ha", flush=True)

    out = f"{WORKSPACE}/province-windows.json"
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"wrote {out}")


if __name__ == "__main__":
    sys.exit(main())
