"""Terrain prototype: elevation tiles for one place, from NRCan's MRDEM-30.

PROTOTYPE. Not a release, not an admitted source, not production eligible.

What it does, in order:

1. Reads one window of the national bare-ground elevation model (MRDEM-30-DTM,
   30 m, Natural Resources Canada, CanElevation Series) straight from the
   published Cloud Optimized GeoTIFF with HTTP range requests. The national
   file is about 84 GB; only the window is read and saved.
2. Reads the same window of MRDEM-30-SOURCE, which says for every cell whether
   the elevation came from lidar (HRDEM Mosaic) or from the adjusted Copernicus
   GLO-30 radar model, and counts the cells of each kind.
3. Cuts Web Mercator tiles of 512 pixels, encodes each as a Terrarium PNG
   (metres = R * 256 + G + B / 256 - 32768), and writes them to an MBTiles
   file. Elevations are rounded to a quarter metre. Cells with no data (sea,
   large lakes, land outside the model near the United States border) are
   written as 0 m.

   The tiles are nested. Zooms 10 and 11 cover the block around the place
   (about 100 km across; zoom 11 is about 25 m on the ground at this
   latitude, the finest the 30 m model supports). Zoom 9 covers about 200 km
   and zoom 8 about 500 km, read from coarser windows (60 m and 120 m), so
   the distant land in a tilted view has a shape and is not a flat plane.
   Where a fine tile does not exist the map falls back to the coarser one.
4. Writes a provenance file beside the tiles.

`pmtiles convert` turns the MBTiles file into the archive the map reads.

Memory: GDAL reads the saved windows in blocks with a 256 MB cache, and one
512 x 512 tile is held at a time.

Run with a Python that has GDAL and NumPy:
    python -I build_terrain_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime, timezone

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

BUCKET = "https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30"
DTM_URL = f"{BUCKET}/mrdem-30-dtm.tif"
SOURCE_URL = f"{BUCKET}/mrdem-30-source.tif"
NODATA = -32767.0
TILE = 512
ORIGIN = 20037508.342789244

# Squamish, British Columbia (census subdivision 5931006). The block is the
# four zoom-9 tiles around it.
PLACE = {"id": "5931006", "name": "Squamish", "extent": [-123.2603, 49.6387, -123.0154, 49.8744]}
# Tile ranges per zoom as (first x, last x, first y, last y), each nested in the one below.
RANGES = {11: (320, 327, 692, 699), 10: (160, 163, 346, 349), 9: (79, 82, 172, 175), 8: (38, 42, 85, 88)}
ZOOMS = (8, 9, 10, 11)
# The window each zoom is read from: cell size in metres, and the zoom whose range it must cover.
WINDOWS = ((120, 8), (60, 9), (30, 10))
QUANTUM_M = 0.25


def tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = 2 * ORIGIN / (1 << z)
    return (-ORIGIN + x * size, ORIGIN - (y + 1) * size, -ORIGIN + (x + 1) * size, ORIGIN - y * size)


def lonlat(mx: float, my: float) -> tuple[float, float]:
    return (mx / ORIGIN * 180.0, math.degrees(2 * math.atan(math.exp(my / ORIGIN * math.pi)) - math.pi / 2))


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def head(url: str) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as response:
        return {
            "url": url,
            "byteLength": int(response.headers["Content-Length"]),
            "etag": response.headers.get("ETag", "").strip('"'),
            "lastModified": response.headers.get("Last-Modified"),
        }


def range_bounds_lonlat(z: int) -> tuple[float, float, float, float]:
    x0, x1, y0, y1 = RANGES[z]
    west, _, _, north = tile_bounds_3857(z, x0, y0)
    _, south, east, _ = tile_bounds_3857(z, x1, y1)
    w, s = lonlat(west, south)
    e, n = lonlat(east, north)
    return (w, s, e, n)


def fetch_window(url: str, path: str, bounds_lonlat: tuple[float, float, float, float], metres: int = 30) -> None:
    """Save the window in the model's projection (EPSG:3979). At 30 m it is the
    model's own grid, cell for cell; coarser windows average the cells."""
    if os.path.exists(path):
        return
    west, south, east, north = bounds_lonlat
    gdal.Warp(
        path,
        f"/vsicurl/{url}",
        format="GTiff",
        dstSRS="EPSG:3979",
        outputBounds=(west, south, east, north),
        outputBoundsSRS="EPSG:4326",
        xRes=metres,
        yRes=metres,
        targetAlignedPixels=True,
        resampleAlg="near" if metres == 30 else "average",
        creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
        warpMemoryLimit=256,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = os.path.expanduser(args.out)
    os.makedirs(out, exist_ok=True)
    started = datetime.now(timezone.utc)
    clock = time.time()

    gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    gdal.SetConfigOption("GDAL_CACHEMAX", "256")

    block_w, block_s, block_e, block_n = range_bounds_lonlat(10)
    margin = 0.05
    window = (block_w - margin, block_s - margin, block_e + margin, block_n + margin)

    remote = {"dtm": head(DTM_URL), "source": head(SOURCE_URL)}
    dtm_path = os.path.join(out, "mrdem-30-dtm-window.tif")
    source_path = os.path.join(out, "mrdem-30-source-window.tif")
    fetch_window(DTM_URL, dtm_path, window)
    fetch_window(SOURCE_URL, source_path, window)
    # Coarsest first: where windows overlap, GDAL draws the later, finer one on top.
    windows = []
    for metres, zoom in WINDOWS:
        w, s, e, n = range_bounds_lonlat(zoom)
        bounds_ = (w - margin, s - margin, e + margin, n + margin)
        path = dtm_path if metres == 30 else os.path.join(out, f"mrdem-30-dtm-window-{metres}m.tif")
        fetch_window(DTM_URL, path, bounds_, metres)
        windows.append({"metres": metres, "coversZoom": zoom, "boundsLonLat": [round(v, 6) for v in bounds_], "path": path})
    window_paths = [entry["path"] for entry in windows]

    # Which elevation source each cell of the block came from.
    source_block = gdal.Warp(
        "", source_path, format="MEM", outputBounds=(block_w, block_s, block_e, block_n), outputBoundsSRS="EPSG:4326",
        xRes=30, yRes=30, targetAlignedPixels=True, resampleAlg="near",
    )
    values, counts = np.unique(source_block.GetRasterBand(1).ReadAsArray(), return_counts=True)
    source_cells = {str(int(value)): int(count) for value, count in zip(values, counts)}
    source_block = None

    mbtiles = os.path.join(out, "terrain.mbtiles")
    if os.path.exists(mbtiles):
        os.remove(mbtiles)
    db = sqlite3.connect(mbtiles)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")

    png = gdal.GetDriverByName("PNG")
    mem = gdal.GetDriverByName("MEM")
    per_metre = int(round(1 / QUANTUM_M))
    per_zoom: dict[str, dict] = {}
    lowest, highest, void_pixels, pixels = math.inf, -math.inf, 0, 0
    for z in ZOOMS:
        x0, x1, y0, y1 = RANGES[z]
        tiles, size = 0, 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                warped = gdal.Warp(
                    "", window_paths, format="MEM", dstSRS="EPSG:3857", outputBounds=tile_bounds_3857(z, x, y),
                    width=TILE, height=TILE, srcNodata=NODATA, dstNodata=NODATA,
                    # Zoom 11 is finer than the model, so interpolate; coarser zooms average the cells they cover.
                    resampleAlg="bilinear" if z == ZOOMS[-1] else "average", outputType=gdal.GDT_Float32,
                )
                metres = warped.GetRasterBand(1).ReadAsArray().astype(np.float64)
                warped = None
                void = ~np.isfinite(metres) | (metres == NODATA)
                if z == ZOOMS[-1]:
                    void_pixels += int(void.sum())
                    pixels += metres.size
                    if (~void).any():
                        lowest = min(lowest, float(metres[~void].min()))
                        highest = max(highest, float(metres[~void].max()))
                metres[void] = 0.0
                steps = np.rint((metres + 32768.0) / QUANTUM_M).astype(np.int64)  # quarter-metre steps
                whole = steps // per_metre
                image = mem.Create("", TILE, TILE, 3, gdal.GDT_Byte)
                image.GetRasterBand(1).WriteArray((whole // 256).astype(np.uint8))
                image.GetRasterBand(2).WriteArray((whole % 256).astype(np.uint8))
                image.GetRasterBand(3).WriteArray(((steps % per_metre) * (256 // per_metre)).astype(np.uint8))
                name = f"/vsimem/tile-{z}-{x}-{y}.png"
                png.CreateCopy(name, image, options=["ZLEVEL=9"])
                image = None
                handle = gdal.VSIFOpenL(name, "rb")
                gdal.VSIFSeekL(handle, 0, 2)
                length = gdal.VSIFTellL(handle)
                gdal.VSIFSeekL(handle, 0, 0)
                data = gdal.VSIFReadL(1, length, handle)
                gdal.VSIFCloseL(handle)
                gdal.Unlink(name)
                db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, (1 << z) - 1 - y, sqlite3.Binary(bytes(data))))
                tiles += 1
                size += length
        per_zoom[str(z)] = {"tiles": tiles, "bytes": size}
        db.commit()

    wide_w, wide_s, wide_e, wide_n = range_bounds_lonlat(ZOOMS[0])
    bounds = f"{wide_w:.6f},{wide_s:.6f},{wide_e:.6f},{wide_n:.6f}"
    for name, value in {
        "name": "terrain-prototype-squamish", "format": "png", "type": "baselayer", "bounds": bounds,
        "minzoom": str(ZOOMS[0]), "maxzoom": str(ZOOMS[-1]),
        "center": f"{(block_w + block_e) / 2:.6f},{(block_s + block_n) / 2:.6f},{ZOOMS[0]}",
        "attribution": "Elevation: Natural Resources Canada, MRDEM-30 (CanElevation Series)",
    }.items():
        db.execute("INSERT INTO metadata VALUES (?, ?)", (name, value))
    db.commit()
    db.close()

    with open(__file__, "rb") as handle:
        script_sha = hashlib.sha256(handle.read()).hexdigest()
    provenance = {
        "schema": "witness-tree/terrain-prototype-provenance/1",
        "status": "prototype",
        "claims": {"released": False, "admittedSource": False, "expertReviewed": False, "productionEligible": False},
        "place": PLACE,
        "product": {
            "name": "Medium Resolution Digital Elevation Model (MRDEM-30), CanElevation Series, digital terrain model",
            "publisher": "Natural Resources Canada",
            "record": "https://open.canada.ca/data/en/dataset/18752265-bda3-498c-a4ba-9dfe68cb98da",
            "specification": "Product Specifications, edition 1.2, 2025-06-20",
            "licence": "Open Government Licence - Canada, version 2.0",
            "resolutionMetres": 30,
            "crs": "EPSG:3979",
            "verticalDatum": "CGVD2013",
        },
        "remote": remote,
        "windows": {
            "dtm": [
                {"metres": entry["metres"], "coversZoom": entry["coversZoom"], "boundsLonLat": entry["boundsLonLat"], "path": os.path.basename(entry["path"]),
                 "byteLength": os.path.getsize(entry["path"]), "sha256": sha256_file(entry["path"])}
                for entry in windows
            ],
            "source": {"boundsLonLat": [round(value, 6) for value in window], "path": os.path.basename(source_path), "byteLength": os.path.getsize(source_path), "sha256": sha256_file(source_path)},
        },
        "block": {
            "boundsLonLat": [round(block_w, 6), round(block_s, 6), round(block_e, 6), round(block_n, 6)],
            "archiveBoundsLonLat": [round(wide_w, 6), round(wide_s, 6), round(wide_e, 6), round(wide_n, 6)],
            "tileRanges": {str(z): list(RANGES[z]) for z in ZOOMS},
            "zooms": list(ZOOMS),
            "tileSize": TILE,
            "encoding": "terrarium",
            "quantumMetres": QUANTUM_M,
            "voidWrittenAsMetres": 0,
            "perZoom": per_zoom,
            "finestZoom": {"lowestMetres": round(lowest, 2), "highestMetres": round(highest, 2), "voidPixels": void_pixels, "pixels": pixels},
            "sourceCells": {"meaning": {"1": "adjusted Copernicus GLO-30", "5": "blended", "10": "HRDEM Mosaic (lidar)", "0": "no data"}, "counts": source_cells},
        },
        "mbtiles": {"path": os.path.basename(mbtiles), "byteLength": os.path.getsize(mbtiles), "sha256": sha256_file(mbtiles)},
        "script": {"path": "scripts/terrain_prototype/build_terrain_tiles.py", "sha256": script_sha},
        "gdal": gdal.__version__,
        "startedAt": started.isoformat(timespec="seconds"),
        "seconds": round(time.time() - clock, 1),
    }
    with open(os.path.join(out, "provenance.json"), "w") as handle:
        json.dump(provenance, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"perZoom": per_zoom, "finestZoom": provenance["block"]["finestZoom"], "sourceCells": source_cells, "seconds": provenance["seconds"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
