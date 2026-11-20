"""Terrain prototype, close-up: 1 m elevation, an air photo and a height layer
for the middle of one place.

PROTOTYPE. Not a release, not an admitted source, not production eligible.

build_terrain_tiles.py makes the far view from the 30 m national model. This
script adds a close-up area inside it (every part of Squamish the District's
air photo reaches, about 290 square kilometres) from three finer sources, and
writes five tile sets:

surface, ground
    Elevation. Zooms 8 to 11 are copied from the 30 m build, so the far land is
    the same in every view. Zooms 12 to 16 cover the close-up area from the
    High Resolution Digital Elevation Model Mosaic (HRDEM Mosaic, 1 m lidar,
    Natural Resources Canada, CanElevation Series): its surface model, which
    includes treetops and buildings, and its terrain model, which is bare
    ground. The mosaic has gaps (the sea, and land no lidar flight covered).
    A gap is filled from the 30 m ground model, interpolated, in both sets.
    Tiles are 512-pixel Terrarium PNGs; zoom 16 is about 0.77 m on the ground
    at this latitude.

photo, photo-core
    The District of Squamish's 2024 orthophoto (published at 7.5 cm and 15 cm),
    read from the District's public image service and stored as 256-pixel WebP
    tiles. The photo set holds zooms 10 to 20 over the whole close-up area;
    zoom 20 is about 10 cm on the ground. The photo-core set holds zoom 21,
    the service's own pixel, about 5 cm, over the settled valley: 33 zoom-14
    tiles from Brackendale to the Stawamus Chief. It is a set of its own
    because a map draws nothing where a set has no tile, rather than a coarser
    one. Where the photo has no picture there is no tile, or a transparent
    one.

height
    The surface model minus the terrain model, in classes: how tall whatever
    stands on the ground is, trees and buildings alike, on the day of the
    lidar flight. 256-pixel PNG tiles for zooms 12 to 17.

Steps, each of which can be run alone with --step:
    fetch-photo  download the photo blocks (serial, one request at a time)
    elevation    read the lidar windows and cut the surface and ground tiles
    photo        cut the photo tiles from the downloaded blocks
    height       cut the height tiles from the lidar windows

The photo is fetched as blocks of 4,096 pixels: one for each zoom-15 tile
(zooms 10 to 19 are cut from these), then one for each zoom-16 tile outside
the settled valley and each zoom-17 tile inside it (zooms 20 and 21). Each zoom-15 tile
is first asked for as a 256-pixel picture whose transparency says where the
photo has none; a block the photo does not reach is not asked for.

The lidar mosaic is saved one row of the area at a time, four rows at once,
each within a 256 MB limit, and a row that fails is asked for again.

Memory: lidar windows are read in blocks with a 128 MB cache in each worker.
A photo worker holds one 4,096-pixel block and its smaller copies, about
150 MB, or about 400 MB for a block the photo only partly covers. The main
process keeps one 256-pixel copy of every zoom-15 block, as bytes, for the
zooms below the blocks: about 17 MB for each zoom-12 tile the area touches.

Run with a Python that has GDAL and NumPy:
    python -I build_close_tiles.py --out ~/Witness_Tree-terrain-prototype/squamish-close \
        --far ~/Witness_Tree-terrain-prototype/squamish
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
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from multiprocessing import Pool

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

ORIGIN = 20037508.342789244
NODATA = -32767.0

HRDEM = "https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m"
HRDEM_URLS = {"surface": f"{HRDEM}/2_4-mosaic-1m-dsm.tif", "ground": f"{HRDEM}/2_4-mosaic-1m-dtm.tif"}
PHOTO_SERVICE = "https://portal.squamish.ca/server/rest/services/Orthophoto_2024/ImageServer"
AGENT = "terrain-prototype-build/1.0"

# The close-up area: every zoom-14 tile the District's air photo reaches, 145 of
# them, about 290 square kilometres. One row for each tile y, with the first and
# last tile x. Found on 2026-11-20 by asking the photo service for a 64-pixel
# picture of each of the 280 zoom-14 tiles in its extent and keeping the tiles
# with any picture.
CORE_Z = 14
AREA_ROWS = {
    5563: (2585, 2587), 5564: (2585, 2587), 5565: (2585, 2587), 5566: (2585, 2588), 5567: (2585, 2589),
    5568: (2585, 2589), 5569: (2585, 2590), 5570: (2585, 2590), 5571: (2585, 2591), 5572: (2585, 2591),
    5573: (2585, 2592), 5574: (2585, 2593), 5575: (2584, 2594), 5576: (2584, 2594), 5577: (2584, 2594),
    5578: (2581, 2594), 5579: (2581, 2590), 5580: (2581, 2588), 5581: (2581, 2587), 5582: (2581, 2587),
}
# The first close-up box (first x, last x, first y, last y): downtown Squamish,
# the estuary, the Squamish River mouth and the Stawamus Chief. The tile sets
# are centred on it.
CENTRE_BOX = (2585, 2588, 5575, 5579)

ELEVATION_ZOOMS = (12, 13, 14, 15, 16)
ELEVATION_TILE = 512
# A sixteenth of a metre. A quarter metre, as in the 30 m build, would draw
# false steps in the shading of flat ground at this cell size.
QUANTUM_M = 0.0625

PHOTO_BLOCK_Z = 15
PHOTO_BLOCK = 4096
PHOTO_ZOOMS = (12, 13, 14, 15, 16, 17, 18, 19)
# Two zooms below those, made from the zoom-12 pictures: a 256-pixel tile is
# asked for one zoom past the map's own, and the whole-place view opens near
# zoom 9, so without them the far view would show no photo.
PHOTO_FAR_ZOOMS = (10, 11)
PHOTO_TILE = 256
PHOTO_QUALITY = 70
PHOTO_PAUSE_S = 1.0
# Two finer levels. The service's own pixel is a zoom-21 pixel (0.075 units of
# EPSG:3857, about 5 cm on the ground here), everywhere the photo reaches. Zoom
# 20 covers the whole close-up area; zoom 21 covers the settled valley, as
# zoom-14 tiles, a row to its first and last column: Brackendale, Garibaldi
# Highlands and Estates, the business park, downtown, Valleycliffe and the
# foot of the Stawamus Chief. The first builds kept it over six tiles of
# downtown. A finer block is again 4,096 pixels, so its 256-pixel tiles sit
# four zooms past the block's own.
PHOTO_FINE_Z = 20
PHOTO_FINEST_Z = 21
PHOTO_FINEST_ROWS = {
    5571: (2586, 2588), 5572: (2586, 2588), 5573: (2586, 2589), 5574: (2586, 2589), 5575: (2586, 2589),
    5576: (2586, 2589), 5577: (2586, 2589), 5578: (2586, 2589), 5579: (2586, 2588),
}

HEIGHT_ZOOMS = (12, 13, 14, 15, 16, 17)
HEIGHT_TILE = 256
# Height above ground in metres: the lower edge of each class, and its colour.
# Class 0 is anything under 2 m (ground, water, low plants) and is not drawn.
HEIGHT_CLASSES = (
    (2.0, (226, 236, 188)),
    (10.0, (158, 200, 114)),
    (20.0, (98, 163, 82)),
    (30.0, (48, 120, 63)),
    (40.0, (19, 79, 50)),
)


def tile_bounds_3857(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    size = 2 * ORIGIN / (1 << z)
    return (-ORIGIN + x * size, ORIGIN - (y + 1) * size, -ORIGIN + (x + 1) * size, ORIGIN - y * size)


def lonlat(mx: float, my: float) -> tuple[float, float]:
    return (mx / ORIGIN * 180.0, math.degrees(2 * math.atan(math.exp(my / ORIGIN * math.pi)) - math.pi / 2))


def area_tiles(z: int) -> list[tuple[int, int]]:
    """The tiles at zoom z that touch the close-up area, as (x, y), in order."""
    found = set()
    for y, (x0, x1) in AREA_ROWS.items():
        for x in range(x0, x1 + 1):
            if z >= CORE_Z:
                f = 1 << (z - CORE_Z)
                found.update((x * f + i, y * f + j) for i in range(f) for j in range(f))
            else:
                f = 1 << (CORE_Z - z)
                found.add((x // f, y // f))
    return sorted(found)


def box_bounds_lonlat(box: tuple[int, int, int, int]) -> tuple[float, float, float, float]:
    """A box of zoom-14 tiles (first x, last x, first y, last y) as west, south, east, north."""
    x0, x1, y0, y1 = box
    west, _, _, north = tile_bounds_3857(CORE_Z, x0, y0)
    _, south, east, _ = tile_bounds_3857(CORE_Z, x1, y1)
    return (*lonlat(west, south), *lonlat(east, north))


def area_bounds_lonlat() -> tuple[float, float, float, float]:
    """The box round the whole close-up area. The area does not fill it."""
    firsts, lasts = zip(*AREA_ROWS.values())
    return box_bounds_lonlat((min(firsts), max(lasts), min(AREA_ROWS), max(AREA_ROWS)))


def centre_text(zoom: int) -> str:
    west, south, east, north = box_bounds_lonlat(CENTRE_BOX)
    return f"{(west + east) / 2:.6f},{(south + north) / 2:.6f},{zoom}"


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


def vsimem_bytes(name: str) -> bytes:
    handle = gdal.VSIFOpenL(name, "rb")
    gdal.VSIFSeekL(handle, 0, 2)
    length = gdal.VSIFTellL(handle)
    gdal.VSIFSeekL(handle, 0, 0)
    data = bytes(gdal.VSIFReadL(1, length, handle))
    gdal.VSIFCloseL(handle)
    gdal.Unlink(name)
    return data


def encode(bands: list[np.ndarray], driver: str, options: list[str], colours: gdal.ColorTable | None = None) -> bytes:
    height, width = bands[0].shape
    image = gdal.GetDriverByName("MEM").Create("", width, height, len(bands), gdal.GDT_Byte)
    for index, band in enumerate(bands):
        image.GetRasterBand(index + 1).WriteArray(band)
    if colours is not None:
        image.GetRasterBand(1).SetColorTable(colours)
    name = f"/vsimem/{os.getpid()}-{time.monotonic_ns()}.{driver.lower()}"
    gdal.GetDriverByName(driver).CreateCopy(name, image, options=options)
    image = None
    return vsimem_bytes(name)


def new_mbtiles(path: str) -> sqlite3.Connection:
    if os.path.exists(path):
        os.remove(path)
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    return db


def put(db: sqlite3.Connection, z: int, x: int, y: int, data: bytes) -> None:
    db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, (1 << z) - 1 - y, sqlite3.Binary(data)))


def finish(db: sqlite3.Connection, metadata: dict[str, str]) -> None:
    for name, value in metadata.items():
        db.execute("INSERT INTO metadata VALUES (?, ?)", (name, value))
    db.commit()
    db.close()


def write_record(out: str, step: str, record: dict, started: datetime, clock: float) -> None:
    with open(__file__, "rb") as handle:
        script_sha = hashlib.sha256(handle.read()).hexdigest()
    record = {
        "schema": "witness-tree/terrain-prototype-close-provenance/1",
        "status": "prototype",
        "claims": {"released": False, "admittedSource": False, "expertReviewed": False, "productionEligible": False},
        "step": step,
        "closeUpArea": {
            "tileZoom": CORE_Z, "tiles": len(area_tiles(CORE_Z)), "rows": {str(y): list(xs) for y, xs in AREA_ROWS.items()},
            "boundsLonLat": [round(v, 6) for v in area_bounds_lonlat()],
        },
        **record,
        "script": {"path": "scripts/terrain_prototype/build_close_tiles.py", "sha256": script_sha},
        "gdal": gdal.__version__,
        "startedAt": started.isoformat(timespec="seconds"),
        "seconds": round(time.time() - clock, 1),
    }
    with open(os.path.join(out, f"provenance-{step}.json"), "w") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")


def worker_setup() -> None:
    gdal.SetConfigOption("GDAL_CACHEMAX", "128")


# --- elevation -----------------------------------------------------------------


def fetch_row(job: tuple[str, str, int]) -> str:
    """Save the lidar mosaic over one row of the close-up area on its own 1 m
    grid (EPSG:3979), cell for cell. A read from the mosaic that fails or comes
    back damaged is asked for again."""
    url, folder, y = job
    path = os.path.join(folder, f"{y}.tif")
    if os.path.exists(path):
        return path
    x0, x1 = AREA_ROWS[y]
    west, south, east, north = box_bounds_lonlat((x0, x1, y, y))
    margin = 0.004
    partial = path + ".partial.tif"
    for attempt in range(5):
        try:
            gdal.Warp(
                partial, f"/vsicurl/{url}", format="GTiff", dstSRS="EPSG:3979",
                outputBounds=(west - margin, south - margin, east + margin, north + margin), outputBoundsSRS="EPSG:4326",
                xRes=1, yRes=1, targetAlignedPixels=True, resampleAlg="near", srcNodata=NODATA, dstNodata=NODATA,
                creationOptions=["COMPRESS=DEFLATE", "PREDICTOR=3", "TILED=YES", "BIGTIFF=IF_SAFER"], warpMemoryLimit=256,
            )
            break
        except RuntimeError as error:
            print("retry row", y, str(error)[:160], flush=True)
            gdal.VSICurlClearCache()
            time.sleep(15 * (attempt + 1))
    else:
        raise SystemExit(f"Could not read row {y} of {url}")
    os.replace(partial, path)
    return path


def fetch_window(url: str, kind: str, out: str) -> tuple[str, list[str]]:
    """The lidar mosaic over the close-up area: one file for each row of the
    area, and a list of them (a VRT) that the tiles are cut from. Rows are read
    four at a time."""
    folder = os.path.join(out, f"hrdem-1m-{kind}-rows")
    os.makedirs(folder, exist_ok=True)
    with ThreadPoolExecutor(4) as pool:
        rows = list(pool.map(fetch_row, [(url, folder, y) for y in sorted(AREA_ROWS)]))
    window = os.path.join(out, f"hrdem-1m-{kind}-area.vrt")
    gdal.BuildVRT(window, rows, srcNodata=NODATA, VRTNodata=NODATA)
    return (window, rows)

def warp_tile(source: str, z: int, x: int, y: int, size: int, how: str) -> np.ndarray:
    warped = gdal.Warp(
        "", source, format="MEM", dstSRS="EPSG:3857", outputBounds=tile_bounds_3857(z, x, y), width=size, height=size,
        srcNodata=NODATA, dstNodata=NODATA, resampleAlg=how, outputType=gdal.GDT_Float32,
    )
    metres = warped.GetRasterBand(1).ReadAsArray().astype(np.float64)
    warped = None
    metres[~np.isfinite(metres)] = NODATA
    return metres


def lidar_tile(window: str, z: int, x: int, y: int, size: int, finest: int) -> np.ndarray:
    # The finest zoom is a little finer than the 1 m cells, so interpolate; coarser zooms average the cells they cover.
    return warp_tile(window, z, x, y, size, "bilinear" if z == finest else "average")


def elevation_tile(job: tuple[str, str, int, int, int]) -> tuple[int, int, int, bytes, dict]:
    window, far_window, z, x, y = job
    lidar = lidar_tile(window, z, x, y, ELEVATION_TILE, ELEVATION_ZOOMS[-1])
    gap = lidar == NODATA
    metres = lidar
    if gap.any():
        # The 30 m ground model, interpolated: averaging would leave 30 m steps at this scale.
        fill = warp_tile(far_window, z, x, y, ELEVATION_TILE, "bilinear")
        fill[fill == NODATA] = 0.0
        metres = np.where(gap, fill, lidar)
    stats = {"pixels": int(metres.size), "gapPixels": int(gap.sum())}
    if (~gap).any():
        stats["lowest"] = float(lidar[~gap].min())
        stats["highest"] = float(lidar[~gap].max())
    per_metre = int(round(1 / QUANTUM_M))
    steps = np.rint((metres + 32768.0) * per_metre).astype(np.int64)
    whole = steps // per_metre
    data = encode(
        [(whole // 256).astype(np.uint8), (whole % 256).astype(np.uint8), ((steps % per_metre) * (256 // per_metre)).astype(np.uint8)],
        "PNG", ["ZLEVEL=9"],
    )
    return (z, x, y, data, stats)


def step_elevation(out: str, far: str, workers: int) -> None:
    started, clock = datetime.now(timezone.utc), time.time()
    far_mbtiles = os.path.join(far, "terrain.mbtiles")
    far_window = os.path.join(far, "mrdem-30-dtm-window.tif")
    with open(os.path.join(far, "provenance.json")) as handle:
        far_record = json.load(handle)
    if sha256_file(far_mbtiles) != far_record["mbtiles"]["sha256"]:
        raise SystemExit("The 30 m tiles do not match their provenance record; rebuild them first.")

    gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    gdal.SetConfigOption("GDAL_CACHEMAX", "256")
    gdal.SetConfigOption("GDAL_NUM_THREADS", str(workers))

    sets = {}
    for kind, url in HRDEM_URLS.items():
        remote = head(url)
        window, rows = fetch_window(url, kind, out)
        mbtiles = os.path.join(out, f"{kind}.mbtiles")
        db = new_mbtiles(mbtiles)
        # The far land, exactly as the 30 m build wrote it.
        db.execute("ATTACH DATABASE ? AS far", (far_mbtiles,))
        db.execute("INSERT INTO tiles SELECT zoom_level, tile_column, tile_row, tile_data FROM far.tiles")
        db.commit()
        db.execute("DETACH DATABASE far")
        far_tiles = db.execute("SELECT COUNT(*) FROM tiles").fetchone()[0]

        jobs = []
        for z in ELEVATION_ZOOMS:
            jobs += [(window, far_window, z, x, y) for x, y in area_tiles(z)]
        per_zoom: dict[str, dict] = {str(z): {"tiles": 0, "bytes": 0} for z in ELEVATION_ZOOMS}
        finest = {"pixels": 0, "gapPixels": 0, "lowest": math.inf, "highest": -math.inf}
        with Pool(workers, initializer=worker_setup) as pool:
            for z, x, y, data, stats in pool.imap_unordered(elevation_tile, jobs, chunksize=4):
                put(db, z, x, y, data)
                per_zoom[str(z)]["tiles"] += 1
                per_zoom[str(z)]["bytes"] += len(data)
                if z == ELEVATION_ZOOMS[-1]:
                    finest["pixels"] += stats["pixels"]
                    finest["gapPixels"] += stats["gapPixels"]
                    finest["lowest"] = min(finest["lowest"], stats.get("lowest", math.inf))
                    finest["highest"] = max(finest["highest"], stats.get("highest", -math.inf))
        db.commit()
        far_bounds = far_record["block"]["archiveBoundsLonLat"]
        finish(db, {
            "name": f"terrain-prototype-squamish-{kind}", "format": "png", "type": "baselayer",
            "bounds": ",".join(f"{v:.6f}" for v in far_bounds),
            "minzoom": str(far_record["block"]["zooms"][0]), "maxzoom": str(ELEVATION_ZOOMS[-1]),
            "center": centre_text(CORE_Z),
            "attribution": "Elevation: Natural Resources Canada, HRDEM Mosaic and MRDEM-30 (CanElevation Series)",
        })
        finest["lowest"], finest["highest"] = round(finest["lowest"], 2), round(finest["highest"], 2)
        sets[kind] = {
            "remote": remote,
            "rows": [{"path": os.path.relpath(row, out), "byteLength": os.path.getsize(row), "sha256": sha256_file(row)} for row in rows],
            "farTilesCopied": far_tiles,
            "perZoom": per_zoom,
            "finestZoom": finest,
            "mbtiles": {"path": os.path.basename(mbtiles), "byteLength": os.path.getsize(mbtiles), "sha256": sha256_file(mbtiles)},
        }
        print(kind, json.dumps({"perZoom": per_zoom, "finestZoom": finest}), flush=True)

    write_record(out, "elevation", {
        "product": {
            "name": "High Resolution Digital Elevation Model Mosaic (HRDEM Mosaic), CanElevation Series, 1 m: digital surface model and digital terrain model",
            "publisher": "Natural Resources Canada",
            "record": "https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b",
            "specification": "HRDEM Mosaic Product Specifications, edition 1.1, 2022-11-15; HRDEM Product Specifications, edition 1.7, 2026-05-19",
            "licence": "Open Government Licence - Canada, version 2.0",
            "resolutionMetres": 1,
            "crs": "EPSG:3979",
        },
        "gapFill": {"from": "MRDEM-30 digital terrain model, the window of the 30 m build", "window": far_record["windows"]["dtm"][-1], "resampling": "bilinear"},
        "farBuild": {"mbtilesSha256": far_record["mbtiles"]["sha256"], "script": far_record["script"]},
        "tiles": {"size": ELEVATION_TILE, "encoding": "terrarium", "quantumMetres": QUANTUM_M, "zooms": list(ELEVATION_ZOOMS)},
        "sets": sets,
    }, started, clock)


# --- photo ----------------------------------------------------------------------


def fine_blocks() -> list[tuple[int, int, int]]:
    """The finer blocks, as (zoom, x, y): zoom-17 blocks over the settled
    valley, whose zoom-20 tiles are made by halving them, and zoom-16 blocks
    over the rest of the close-up area. The zoom-17 blocks come first."""
    found = []
    for x, y in area_tiles(CORE_Z):
        first, last = PHOTO_FINEST_ROWS.get(y, (1, 0))
        z = PHOTO_FINEST_Z - 4 if first <= x <= last else PHOTO_FINE_Z - 4
        f = 1 << (z - CORE_Z)
        found += [(z, x * f + i, y * f + j) for i in range(f) for j in range(f)]
    return sorted(found, reverse=True)


def fine_mask(blocks: str, z: int, x: int, y: int) -> np.ndarray:
    """Where a finer block has a picture, read from the mask of the zoom-15 block it lies in."""
    shift = z - PHOTO_BLOCK_Z
    px, py = x >> shift, y >> shift
    mask = gdal.Open(os.path.join(blocks, f"{PHOTO_BLOCK_Z}-{px}-{py}.mask.png"))
    alpha = mask.GetRasterBand(mask.RasterCount).ReadAsArray() if mask.RasterCount in (2, 4) else np.full((256, 256), 255, np.uint8)
    mask = None
    n = 256 >> shift
    row, col = (y - (py << shift)) * n, (x - (px << shift)) * n
    return alpha[row:row + n, col:col + n] > 0


def export_url(bounds: tuple[float, float, float, float], size: int, fmt: str) -> str:
    query = {
        "bbox": ",".join(f"{v:.4f}" for v in bounds), "bboxSR": 3857, "imageSR": 3857, "size": f"{size},{size}",
        "format": fmt, "interpolation": "RSP_BilinearInterpolation", "f": "image",
    }
    if fmt == "jpg":
        query["compressionQuality"] = 95
    return f"{PHOTO_SERVICE}/exportImage?{urllib.parse.urlencode(query)}"


def download(url: str, path: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        data = response.read()
    with open(path + ".partial", "wb") as handle:
        handle.write(data)
    os.replace(path + ".partial", path)


def fetch_block(bounds: tuple[float, float, float, float], size: int, fmt: str, path: str, label: str) -> None:
    """Ask for one picture, three times at most, check its size, then pause."""
    for attempt in range(3):
        try:
            download(export_url(bounds, size, fmt), path)
            break
        except Exception as error:  # a slow or dropped answer: wait and ask again
            print("retry", label, str(error)[:120], flush=True)
            time.sleep(10 * (attempt + 1))
    else:
        raise SystemExit(f"Could not fetch block {label}")
    image = gdal.Open(path)
    if image.RasterXSize != size or image.RasterYSize != size:
        os.remove(path)
        raise SystemExit(f"Block {label} came back {image.RasterXSize}x{image.RasterYSize}")
    image = None
    time.sleep(PHOTO_PAUSE_S)


def step_fetch_photo(out: str) -> None:
    """For each zoom-15 tile, a 256-pixel PNG whose transparency says where the
    photo has no picture and, where it has one, a block of 4,096 pixels. Then
    the finer blocks, also 4,096 pixels each: zoom 16 over the close-up area and
    zoom 17 over the settled valley. A file already on disk is not asked for again."""
    started, clock = datetime.now(timezone.utc), time.time()
    blocks = os.path.join(out, "photo-blocks")
    os.makedirs(blocks, exist_ok=True)
    request = urllib.request.Request(f"{PHOTO_SERVICE}?f=json", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        service = json.load(response)
    fetched = 0
    for x, y in area_tiles(PHOTO_BLOCK_Z):
        bounds = tile_bounds_3857(PHOTO_BLOCK_Z, x, y)
        mask = os.path.join(blocks, f"{PHOTO_BLOCK_Z}-{x}-{y}.mask.png")
        if not os.path.exists(mask):
            fetch_block(bounds, 256, "png32", mask, f"{x},{y} mask")
            fetched += 1
        path = os.path.join(blocks, f"{PHOTO_BLOCK_Z}-{x}-{y}.jpg")
        if os.path.exists(path) or not fine_mask(blocks, PHOTO_BLOCK_Z, x, y).any():
            continue
        fetch_block(bounds, PHOTO_BLOCK, "jpg", path, f"{x},{y}")
        fetched += 1
        print("block", x, y, "done", round(time.time() - clock), "s", flush=True)
    for z, x, y in fine_blocks():
        path = os.path.join(blocks, f"{z}-{x}-{y}.jpg")
        if os.path.exists(path) or not fine_mask(blocks, z, x, y).any():
            continue
        fetch_block(tile_bounds_3857(z, x, y), PHOTO_BLOCK, "jpg", path, f"{z},{x},{y}")
        fetched += 1
        print("fine block", z, x, y, "done", round(time.time() - clock), "s", flush=True)
    files = sorted(name for name in os.listdir(blocks) if not name.endswith(".partial"))
    write_record(out, "fetch-photo", {
        "product": {
            "name": "Aerial Photo 2024 (Squamish composite orthophoto, 7.5 cm and 15 cm, flown spring and summer 2024)",
            "publisher": "District of Squamish",
            "record": "https://data.squamish.ca/ (item e86a2b42f49046918c0c0c1d13f000a2, category Open Data)",
            "licence": "Open Government Licence - Squamish, version 2.0",
            "service": PHOTO_SERVICE,
            "servicePixelSize": [service.get("pixelSizeX"), service.get("pixelSizeY")],
            "serviceSpatialReference": service.get("spatialReference"),
        },
        "request": {
            "blockZoom": PHOTO_BLOCK_Z, "blockPixels": PHOTO_BLOCK, "format": "jpg", "compressionQuality": 95, "interpolation": "bilinear", "fetchedThisRun": fetched,
            "finerBlocks": {"blockZooms": [PHOTO_FINE_Z - 4, PHOTO_FINEST_Z - 4], "finestRows": {str(y): list(xs) for y, xs in PHOTO_FINEST_ROWS.items()}, "skipped": "blocks the photo does not reach"},
        },
        "blocks": [{"path": name, "byteLength": os.path.getsize(os.path.join(blocks, name)), "sha256": sha256_file(os.path.join(blocks, name))} for name in files],
    }, started, clock)


def halve(pixels: np.ndarray, weight: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Halve a picture, averaging only the pixels that have a picture."""
    h, w = weight.shape
    quads = pixels.reshape(h // 2, 2, w // 2, 2, 3)
    if weight.min() >= 1:
        # Every pixel has a picture: a plain mean, summed without a full-size copy.
        return (quads.sum(axis=(1, 3), dtype=np.float32) / 4, np.ones((h // 2, w // 2), np.float32))
    weights = weight.reshape(h // 2, 2, w // 2, 2).astype(np.float32)
    total = weights.sum(axis=(1, 3))
    summed = (quads.astype(np.float32) * weights[..., None]).sum(axis=(1, 3))
    return (summed / np.maximum(total, 1e-6)[..., None]), total / 4


def photo_tile(pixels: np.ndarray, weight: np.ndarray) -> bytes | None:
    if not (weight > 0).any():
        return None
    rgb = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
    bands = [rgb[..., 0], rgb[..., 1], rgb[..., 2]]
    if (weight < 1).any():
        bands.append(np.clip(np.rint(weight * 255), 0, 255).astype(np.uint8))
    return encode(bands, "WEBP", [f"QUALITY={PHOTO_QUALITY}"])


def cut_block(block_z: int, x: int, y: int, pixels: np.ndarray, weight: np.ndarray, last_z: int) -> tuple[list[tuple[int, int, int, bytes]], np.ndarray, np.ndarray]:
    """Cut a block into 256-pixel tiles at its finest zoom, then halve it and
    cut again, down to zoom last_z. Returns the tiles and the last picture."""
    tiles = []
    for z in range(block_z + 4, last_z - 1, -1):
        f = 1 << (z - block_z)
        for tx in range(f):
            for ty in range(f):
                rows, cols = slice(ty * PHOTO_TILE, (ty + 1) * PHOTO_TILE), slice(tx * PHOTO_TILE, (tx + 1) * PHOTO_TILE)
                data = photo_tile(pixels[rows, cols], weight[rows, cols])
                if data is not None:
                    tiles.append((z, x * f + tx, y * f + ty, data))
        if z > last_z:
            pixels, weight = halve(pixels, weight)
    return (tiles, pixels, weight)


def read_block(blocks: str, z: int, x: int, y: int, has_picture: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    image = gdal.Open(os.path.join(blocks, f"{z}-{x}-{y}.jpg"))
    pixels = np.ascontiguousarray(np.transpose(image.ReadAsArray()[:3], (1, 2, 0)))
    image = None
    step = PHOTO_BLOCK // has_picture.shape[0]
    return (pixels, np.repeat(np.repeat(has_picture.astype(np.float32), step, axis=0), step, axis=1))


def photo_block(job: tuple[str, int, int]) -> tuple[int, int, list[tuple[int, int, int, bytes]], np.ndarray, np.ndarray, float]:
    blocks, x, y = job
    pixels, weight = read_block(blocks, PHOTO_BLOCK_Z, x, y, fine_mask(blocks, PHOTO_BLOCK_Z, x, y))
    covered = float(weight.mean())
    tiles, pixels, weight = cut_block(PHOTO_BLOCK_Z, x, y, pixels, weight, PHOTO_BLOCK_Z)
    return (x, y, tiles, pixels, weight, covered)


def fine_block(job: tuple[str, int, int, int]) -> list[tuple[int, int, int, bytes]]:
    blocks, z, x, y = job
    pixels, weight = read_block(blocks, z, x, y, fine_mask(blocks, z, x, y))
    return cut_block(z, x, y, pixels, weight, PHOTO_FINE_Z)[0]


def step_photo(out: str, workers: int) -> None:
    started, clock = datetime.now(timezone.utc), time.time()
    blocks = os.path.join(out, "photo-blocks")
    jobs = [(blocks, x, y) for x, y in area_tiles(PHOTO_BLOCK_Z) if fine_mask(blocks, PHOTO_BLOCK_Z, x, y).any()]
    fine_jobs = [(blocks, z, x, y) for z, x, y in fine_blocks() if fine_mask(blocks, z, x, y).any()]
    missing = [job[1:] for job in (*((b, PHOTO_BLOCK_Z, x, y) for b, x, y in jobs), *fine_jobs) if not os.path.exists(os.path.join(blocks, f"{job[1]}-{job[2]}-{job[3]}.jpg"))]
    if missing:
        raise SystemExit(f"{len(missing)} photo blocks are not downloaded yet; run --step fetch-photo first.")
    mbtiles = os.path.join(out, "photo.mbtiles")
    db = new_mbtiles(mbtiles)
    per_zoom: dict[str, dict] = {str(z): {"tiles": 0, "bytes": 0} for z in (*PHOTO_FAR_ZOOMS, *PHOTO_ZOOMS, PHOTO_FINE_Z, PHOTO_FINEST_Z)}
    # The finest zoom covers only the settled valley, so it goes in a set of its
    # own: a map cannot fall back to a coarser tile where a set has none.
    core_mbtiles = os.path.join(out, "photo-core.mbtiles")
    core_db = new_mbtiles(core_mbtiles)
    with Pool(workers, initializer=worker_setup) as pool:
        for tiles in pool.imap_unordered(fine_block, fine_jobs):
            for z, tx, ty, data in tiles:
                put(core_db if z == PHOTO_FINEST_Z else db, z, tx, ty, data)
                per_zoom[str(z)]["tiles"] += 1
                per_zoom[str(z)]["bytes"] += len(data)
            db.commit()
            core_db.commit()
    # Each block at 256 pixels, kept as bytes and laid out inside the coarsest
    # zoom's tile it falls in, for the zooms below the blocks.
    coarsest = PHOTO_ZOOMS[0]
    span = 1 << (PHOTO_BLOCK_Z - coarsest)
    side = span * PHOTO_TILE
    small: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
    covered = []
    with Pool(workers, initializer=worker_setup) as pool:
        for x, y, tiles, pixels, weight, share in pool.imap_unordered(photo_block, jobs):
            for z, tx, ty, data in tiles:
                put(db, z, tx, ty, data)
                per_zoom[str(z)]["tiles"] += 1
                per_zoom[str(z)]["bytes"] += len(data)
            key = (x // span, y // span)
            if key not in small:
                small[key] = (np.zeros((side, side, 3), np.uint8), np.zeros((side, side), np.uint8))
            row, col = (y % span) * PHOTO_TILE, (x % span) * PHOTO_TILE
            small[key][0][row:row + PHOTO_TILE, col:col + PHOTO_TILE] = np.clip(np.rint(pixels), 0, 255)
            small[key][1][row:row + PHOTO_TILE, col:col + PHOTO_TILE] = np.clip(np.rint(weight * 255), 0, 255)
            covered.append(share)
            db.commit()

    def cut_down(pixels: np.ndarray, weight: np.ndarray, top_z: int, last_z: int, cx: int, cy: int) -> tuple[np.ndarray, np.ndarray]:
        """Halve the zoom top_z picture of tile (cx, cy) of zoom last_z, down to last_z, storing each zoom's tiles."""
        for z in range(top_z - 1, last_z - 1, -1):
            pixels, weight = halve(pixels, weight)
            f = 1 << (z - last_z)
            for tx in range(f):
                for ty in range(f):
                    rows, cols = slice(ty * PHOTO_TILE, (ty + 1) * PHOTO_TILE), slice(tx * PHOTO_TILE, (tx + 1) * PHOTO_TILE)
                    data = photo_tile(pixels[rows, cols], weight[rows, cols])
                    if data is not None:
                        put(db, z, cx * f + tx, cy * f + ty, data)
                        per_zoom[str(z)]["tiles"] += 1
                        per_zoom[str(z)]["bytes"] += len(data)
        return (pixels, weight)

    # The coarsest zoom's pictures, laid out inside the far tile each falls in, for the far zooms.
    far = PHOTO_FAR_ZOOMS[0]
    wide = (1 << (coarsest - far)) * PHOTO_TILE
    tops: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
    for (cx, cy), (kept, kept_weight) in sorted(small.items()):
        pixels, weight = cut_down(kept.astype(np.float32), kept_weight.astype(np.float32) / 255, PHOTO_BLOCK_Z, coarsest, cx, cy)
        key = (cx * PHOTO_TILE // wide, cy * PHOTO_TILE // wide)
        if key not in tops:
            tops[key] = (np.zeros((wide, wide, 3), np.float32), np.zeros((wide, wide), np.float32))
        row, col = cy * PHOTO_TILE % wide, cx * PHOTO_TILE % wide
        tops[key][0][row:row + PHOTO_TILE, col:col + PHOTO_TILE] = pixels
        tops[key][1][row:row + PHOTO_TILE, col:col + PHOTO_TILE] = weight
    for (cx, cy), (pixels, weight) in sorted(tops.items()):
        cut_down(pixels, weight, coarsest, far, cx, cy)
    db.commit()
    bounds = area_bounds_lonlat()
    finish(db, {
        "name": "terrain-prototype-squamish-photo-2024", "format": "webp", "type": "baselayer",
        "bounds": ",".join(f"{v:.6f}" for v in bounds), "minzoom": str(PHOTO_FAR_ZOOMS[0]), "maxzoom": str(PHOTO_FINE_Z),
        "center": centre_text(CORE_Z),
        "attribution": "Air photo: District of Squamish, Aerial Photo 2024",
    })
    firsts, lasts = zip(*PHOTO_FINEST_ROWS.values())
    core = box_bounds_lonlat((min(firsts), max(lasts), min(PHOTO_FINEST_ROWS), max(PHOTO_FINEST_ROWS)))
    finish(core_db, {
        "name": "terrain-prototype-squamish-photo-2024-core", "format": "webp", "type": "baselayer",
        "bounds": ",".join(f"{v:.6f}" for v in core), "minzoom": str(PHOTO_FINEST_Z), "maxzoom": str(PHOTO_FINEST_Z),
        "center": f"{(core[0] + core[2]) / 2:.6f},{(core[1] + core[3]) / 2:.6f},{PHOTO_FINEST_Z}",
        "attribution": "Air photo: District of Squamish, Aerial Photo 2024",
    })

    def ground(z: int) -> float:
        return round(2 * ORIGIN / (1 << z) / PHOTO_TILE * math.cos(math.radians((bounds[1] + bounds[3]) / 2)), 3)

    write_record(out, "photo", {
        "tiles": {"size": PHOTO_TILE, "format": "webp", "quality": PHOTO_QUALITY, "zooms": [*PHOTO_FAR_ZOOMS, *PHOTO_ZOOMS, PHOTO_FINE_Z, PHOTO_FINEST_Z], "perZoom": per_zoom},
        "blocks": len(jobs),
        "finerBlocks": len(fine_jobs),
        "shareOfBlocksWithPicture": round(float(np.mean(covered)), 4),
        "groundMetresPerPixel": {str(PHOTO_ZOOMS[-1]): ground(PHOTO_ZOOMS[-1]), str(PHOTO_FINE_Z): ground(PHOTO_FINE_Z), str(PHOTO_FINEST_Z): ground(PHOTO_FINEST_Z)},
        "finestArea": {
            "tileZoom": CORE_Z, "tiles": sum(last - first + 1 for first, last in PHOTO_FINEST_ROWS.values()),
            "rows": {str(y): list(xs) for y, xs in PHOTO_FINEST_ROWS.items()}, "boundsLonLat": [round(v, 6) for v in core],
        },
        "mbtiles": {"path": os.path.basename(mbtiles), "byteLength": os.path.getsize(mbtiles), "sha256": sha256_file(mbtiles)},
        "coreMbtiles": {"path": os.path.basename(core_mbtiles), "byteLength": os.path.getsize(core_mbtiles), "sha256": sha256_file(core_mbtiles)},
    }, started, clock)
    print("photo", json.dumps(per_zoom), flush=True)


# --- height above ground -------------------------------------------------------


def height_tile(job: tuple[str, str, int, int, int]) -> tuple[int, int, int, bytes | None, np.ndarray]:
    surface_window, ground_window, z, x, y = job
    surface = lidar_tile(surface_window, z, x, y, HEIGHT_TILE, HEIGHT_ZOOMS[-1])
    ground = lidar_tile(ground_window, z, x, y, HEIGHT_TILE, HEIGHT_ZOOMS[-1])
    gap = (surface == NODATA) | (ground == NODATA)
    height = np.where(gap, 0.0, surface - ground)
    classes = np.zeros(height.shape, np.uint8)
    for index, (lower, _) in enumerate(HEIGHT_CLASSES):
        classes[height >= lower] = index + 1
    classes[gap] = 0
    counts = np.bincount(classes[~gap], minlength=len(HEIGHT_CLASSES) + 1)
    counts = np.append(counts, int(gap.sum()))
    if not classes.any():
        return (z, x, y, None, counts)
    table = gdal.ColorTable()
    table.SetColorEntry(0, (0, 0, 0, 0))
    for index, (_, colour) in enumerate(HEIGHT_CLASSES):
        table.SetColorEntry(index + 1, (*colour, 255))
    return (z, x, y, encode([classes], "PNG", ["ZLEVEL=9"], table), counts)


def step_height(out: str, workers: int) -> None:
    started, clock = datetime.now(timezone.utc), time.time()
    windows = {kind: os.path.join(out, f"hrdem-1m-{kind}-area.vrt") for kind in HRDEM_URLS}
    jobs = []
    for z in HEIGHT_ZOOMS:
        jobs += [(windows["surface"], windows["ground"], z, x, y) for x, y in area_tiles(z)]
    mbtiles = os.path.join(out, "height.mbtiles")
    db = new_mbtiles(mbtiles)
    per_zoom: dict[str, dict] = {str(z): {"tiles": 0, "bytes": 0} for z in HEIGHT_ZOOMS}
    finest = np.zeros(len(HEIGHT_CLASSES) + 2, np.int64)
    with Pool(workers, initializer=worker_setup) as pool:
        for z, x, y, data, counts in pool.imap_unordered(height_tile, jobs, chunksize=16):
            if z == HEIGHT_ZOOMS[-1]:
                finest += counts
            if data is None:
                continue
            put(db, z, x, y, data)
            per_zoom[str(z)]["tiles"] += 1
            per_zoom[str(z)]["bytes"] += len(data)
    db.commit()
    bounds = area_bounds_lonlat()
    finish(db, {
        "name": "terrain-prototype-squamish-height", "format": "png", "type": "overlay",
        "bounds": ",".join(f"{v:.6f}" for v in bounds), "minzoom": str(HEIGHT_ZOOMS[0]), "maxzoom": str(HEIGHT_ZOOMS[-1]),
        "center": centre_text(CORE_Z),
        "attribution": "Height above ground: Natural Resources Canada, HRDEM Mosaic (CanElevation Series)",
    })
    lowers = [int(lower) for lower, _ in HEIGHT_CLASSES]
    labels = ["under 2 m"] + [f"{a} to {b} m" for a, b in zip(lowers, lowers[1:])] + [f"{lowers[-1]} m or more", "no lidar"]
    write_record(out, "height", {
        "meaning": "digital surface model minus digital terrain model: the height of whatever stands on the ground, trees and buildings alike",
        "classes": [{"fromMetres": lower, "rgb": list(colour)} for lower, colour in HEIGHT_CLASSES],
        "tiles": {"size": HEIGHT_TILE, "format": "png", "zooms": list(HEIGHT_ZOOMS), "perZoom": per_zoom},
        "finestZoomPixels": dict(zip(labels, (int(v) for v in finest))),
        "mbtiles": {"path": os.path.basename(mbtiles), "byteLength": os.path.getsize(mbtiles), "sha256": sha256_file(mbtiles)},
    }, started, clock)
    print("height", json.dumps({"perZoom": per_zoom, "finestZoomPixels": dict(zip(labels, (int(v) for v in finest)))}), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--far", help="the folder of the 30 m build (needed by the elevation step)")
    parser.add_argument("--step", choices=("fetch-photo", "elevation", "photo", "height", "all"), default="all")
    parser.add_argument("--workers", type=int, default=max(1, min(6, (os.cpu_count() or 2) - 2)))
    args = parser.parse_args()
    out = os.path.expanduser(args.out)
    os.makedirs(out, exist_ok=True)
    steps = ("fetch-photo", "elevation", "photo", "height") if args.step == "all" else (args.step,)
    for step in steps:
        if step == "fetch-photo":
            step_fetch_photo(out)
        elif step == "elevation":
            if not args.far:
                parser.error("--far is required for the elevation step")
            step_elevation(out, os.path.expanduser(args.far), args.workers)
        elif step == "photo":
            step_photo(out, args.workers)
        elif step == "height":
            step_height(out, args.workers)
    return 0


if __name__ == "__main__":
    sys.exit(main())
