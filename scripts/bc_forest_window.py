#!/usr/bin/env python3
"""Shared window, mask and tiling for the British Columbia forest-definition jobs.

Every NTEMS raster used by these jobs is published on one national grid:
193936 by 128340 cells, 30 m, geotransform
(-2660910.524, 30, 0, 2998848.1105, 0, -30), NAD83 Lambert Conformal Conic with
central meridian -95 and standard parallels 49 and 77. Because the grid is
shared, a province is a fixed pixel window into every product and no
reprojection or resampling is ever required. That is the whole reason these
jobs can cross five products against each other and still claim the answers
refer to the same ground.

The British Columbia window is offset (0, 33312), size 60855 by 64176.

One trap is recorded here because it silently produces wrong answers rather
than an error. `gdal_rasterize -tap` snaps the target grid to a multiple of the
pixel size. The VLCE2 origin -2660910.524 is not a multiple of 30, so -tap moves
it to -2660940, a 29.476 m shift. Every mask cell then straddles two raster
cells and every zonal count is quietly wrong. The boundary mask must be
rasterized with an explicit -te matching the window and no -tap, and the
resulting offset must be verified integral before use. `assert_aligned` below
is that verification.

Tiling is exact rather than approximate for the small-area sieve. With a halo H
at least as large as the pixel threshold, a connected component containing an
interior pixel either lies wholly inside the haloed read, so the local count
equals the true count, or it reaches the halo edge, so its local count is at
least H and therefore already exceeds the threshold and is kept. Both branches
decide correctly, so no cross-tile union-find merge is needed and the work is
embarrassingly parallel.
"""
import os

from osgeo import gdal

gdal.UseExceptions()

DATA_ROOT = os.environ.get("WITNESS_TREE_DATA_ROOT", "/Volumes/Extended_SSD/Witness_Tree-data")

# The national grid every NTEMS product in these jobs shares.
GRID_WIDTH, GRID_HEIGHT = 193936, 128340
GRID_TRANSFORM = (-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0)

# British Columbia as a window into that grid.
XOFF, YOFF, XSIZE, YSIZE = 0, 33312, 60855, 64176

TILE, HALO = 4096, 16
HA_PER_CELL = 0.09
WORKERS = 9

# 0.5 ha = 5555.6 m2 / 900 = 5.56 cells, so 6 is the first qualifying size.
# 1 ha   = 10000  m2 / 900 = 11.11 cells, so 12 is the first qualifying size.
MIN_CELLS_0P5_HA = 6
MIN_CELLS_1_HA = 12

VLCE2_CLASS_NAMES = {
    0: "Unclassified", 20: "Water", 31: "Snow and ice", 32: "Rock and rubble",
    33: "Exposed and barren", 40: "Bryoids", 50: "Shrubs", 80: "Wetland",
    81: "Wetland, treed", 100: "Herbs", 210: "Coniferous", 220: "Broadleaf",
    230: "Mixedwood",
}
VLCE2_CODES = tuple(VLCE2_CLASS_NAMES)

# The publisher's own treed classes, established empirically rather than by
# reading class names: see scripts/bc_ntems_definitional_crosswalk.py, which
# reproduces NRCan's published 1984 treed area from these four codes alone to
# within 0.006 percent.
VLCE2_TREED_UPLAND = (210, 220, 230)
VLCE2_TREED_ALL = (81, 210, 220, 230)


def assert_aligned(path):
    """Fail loudly unless `path` is on the national grid at an integral offset."""
    ds = gdal.Open(path)
    gt = ds.GetGeoTransform()
    if (gt[1], gt[5]) != (GRID_TRANSFORM[1], GRID_TRANSFORM[5]):
        raise SystemExit(f"{path}: pixel size {gt[1]}x{gt[5]} is not the national 30 m grid")
    dx = (gt[0] - GRID_TRANSFORM[0]) / GRID_TRANSFORM[1]
    dy = (gt[3] - GRID_TRANSFORM[3]) / GRID_TRANSFORM[5]
    if abs(dx - round(dx)) > 1e-6 or abs(dy - round(dy)) > 1e-6:
        raise SystemExit(
            f"{path}: origin offset ({dx}, {dy}) is not integral. "
            "This is the -tap misalignment described in the module docstring."
        )
    return int(round(dx)), int(round(dy))


def tiles(tile=TILE):
    """The BC window as a list of (x, y, width, height) reads."""
    return [
        (x, y, min(tile, XSIZE - x), min(tile, YSIZE - y))
        for y in range(0, YSIZE, tile)
        for x in range(0, XSIZE, tile)
    ]


def read_window(path, x0, y0, w, h):
    """Read a window in BC-window coordinates from a national-grid raster.

    The Dataset must outlive the Band. Chaining
    `gdal.Open(...).GetRasterBand(1).ReadAsArray(...)` frees the dataset while
    the band is still live and raises a SWIG type error from inside a worker,
    which is why the dataset is bound to a name here.
    """
    ds = gdal.Open(path)
    band = ds.GetRasterBand(1)
    return band.ReadAsArray(XOFF + x0, YOFF + y0, w, h)


def sieve(binary, threshold, connectedness):
    """Remove connected components smaller than `threshold` cells.

    GDAL's SieveFilter also fills small holes of 0 inside large 1 regions.
    Intersecting the result with the original keeps only the small-patch
    removal, which is the minimum-area rule; hole filling is not.
    """
    src = gdal.GetDriverByName("MEM").Create("", binary.shape[1], binary.shape[0], 1, gdal.GDT_Byte)
    src.GetRasterBand(1).WriteArray(binary)
    dst = gdal.GetDriverByName("MEM").Create("", binary.shape[1], binary.shape[0], 1, gdal.GDT_Byte)
    gdal.SieveFilter(src.GetRasterBand(1), None, dst.GetRasterBand(1), threshold, connectedness)
    return dst.GetRasterBand(1).ReadAsArray() & binary
