#!/usr/bin/env python3
"""Per-cell tiles for Explore "Condition and recovery", built locally, never uploaded.

Reads the per-cell strips written by scripts/phase4_condition_recovery_v2.py
(band 1 is the set A state, band 2 the latest loss year minus 1900) and draws
every cell whose state is unknown, recovered, not recovered, or not recovered
with an unconfirmed return. Cells that were never treed, or treed and never
lost, are not drawn: the base map already shows them. Unknown is drawn as its
own state so an unmeasured place never reads as a place with no loss.

Each lost cell also carries the decade of its latest loss (0 = 1985-1994,
1 = 1995-2004, 2 = 2005-2014, 3 = 2015-2022), so the map can mark the losses
too recent to have recovered. Geometry is the exact cell outline, polygonized
per strip with 4-connectivity and never simplified here; whatever
generalization the tiles carry is the tiler's, at zooms below 14.

Memory is bounded on purpose. GDAL's JSON writers leak in the GDAL 3.13 Python
bindings, about 3.6 KB per feature, and ten workers writing tens of millions of
features that way exhausted the machine. So geometry leaves GDAL as WKB and is
written by polygon_json, each strip is polygonized in blocks of BLOCK columns
so no block holds more than a few thousand shapes, and GDAL's raster cache is
capped. A few workers run at once (four by default), and a worker stops the
run if its peak memory passes MAX_RSS_BYTES instead of letting the machine
swap. The tiler is held to the same number of threads and reads its inputs one
at a time. Shapes cut at a block edge meet exactly at that edge.

The GeoJSON sequences, the tiler's temporary files and the archive all stay on
the data root; the sequences are deleted once the archive exists. The tiler
runs inside the work directory with relative paths, because tippecanoe writes
its command line into the archive header.
"""
import argparse, hashlib, json, os, resource, shutil, subprocess, sys, tempfile, time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
gdal.SetCacheMax(64 * 1024 * 1024)  # GDAL's default is 5% of RAM per process
UNKNOWN, RECOVERED, NOT_RECOVERED, UNCONFIRMED = 1, 4, 5, 6
DRAWN = (UNKNOWN, RECOVERED, NOT_RECOVERED, UNCONFIRMED)
DECADE_STARTS = (1985, 1995, 2005, 2015)
PROVINCES = ("british-columbia", "alberta", "ontario", "quebec")
OGR_MEMORY = ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")
LAYER = "condition_recovery"
BLOCK = 1024
MAX_RSS_BYTES = 1_000_000_000
DEFAULT_WORKERS = min(4, os.cpu_count() or 1)


def code_for(state, year_minus_1900):
    """One integer per drawn (state, decade) pair; 0 is not drawn. Unknown has no decade."""
    year = year_minus_1900.astype(np.int32) + 1900
    decade = np.searchsorted(np.array(DECADE_STARTS), year, side="right") - 1
    lost = np.isin(state, (RECOVERED, NOT_RECOVERED, UNCONFIRMED))
    code = np.zeros(state.shape, np.uint8)
    code[state == UNKNOWN] = 10
    code[lost] = (state[lost] * 10 + np.clip(decade[lost], 0, 3)).astype(np.uint8)
    return code


def polygon_json(wkb):
    """GeoJSON for one little-endian WKB polygon, coordinates rounded to 7 places.

    GDAL's own JSON writers (ExportToJson and the GeoJSONSeq driver) leak about
    3.6 KB per feature in the GDAL 3.13 Python bindings, which is what ran the
    machine out of memory; WKB export does not leak."""
    assert wkb[0] == 1 and int.from_bytes(wkb[1:5], "little") == 3, "not a little-endian 2D polygon"
    rings, at = [], 9
    for _ in range(int.from_bytes(wkb[5:9], "little")):
        n = int.from_bytes(wkb[at:at + 4], "little")
        xy = np.frombuffer(wkb, "<f8", 2 * n, at + 4).reshape(n, 2)
        rings.append(np.round(xy, 7).tolist())
        at += 4 + 16 * n
    return json.dumps({"type": "Polygon", "coordinates": rings}, separators=(",", ":"))


def strip_job(args):
    strip, out = args[0], args[1]
    block = args[2] if len(args) > 2 else BLOCK
    if os.path.exists(out + ".done"):
        with open(out + ".done") as fh:
            return json.load(fh)
    ds = gdal.Open(strip)
    gt = ds.GetGeoTransform()
    src = osr.SpatialReference(); src.ImportFromWkt(ds.GetProjection())
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx = osr.CoordinateTransformation(src, dst)
    counts, features = {}, 0
    with open(out + ".part", "w") as fh:
        for x0 in range(0, ds.RasterXSize, block):
            w = min(block, ds.RasterXSize - x0)
            code = code_for(ds.GetRasterBand(1).ReadAsArray(x0, 0, w, ds.RasterYSize),
                            ds.GetRasterBand(2).ReadAsArray(x0, 0, w, ds.RasterYSize))
            if not code.any():
                continue
            for c, n in zip(*np.unique(code, return_counts=True)):
                if c:
                    counts[int(c)] = counts.get(int(c), 0) + int(n)
            mem = gdal.GetDriverByName("MEM").Create("", w, ds.RasterYSize, 1, gdal.GDT_Byte)
            mem.SetGeoTransform((gt[0] + x0 * gt[1], gt[1], 0, gt[3], 0, gt[5]))
            mem.SetProjection(ds.GetProjection())
            band = mem.GetRasterBand(1); band.WriteArray(code)
            vds = OGR_MEMORY.CreateDataSource("p")
            lyr = vds.CreateLayer("p", src, ogr.wkbPolygon)
            lyr.CreateField(ogr.FieldDefn("code", ogr.OFTInteger))
            gdal.Polygonize(band, band, lyr, 0, [], callback=None)
            for f in lyr:
                c = f.GetField("code")
                g = f.GetGeometryRef(); g.Transform(tx)
                props = f'{{"state":{c // 10}}}' if c == 10 else f'{{"state":{c // 10},"decade":{c % 10}}}'
                fh.write(f'{{"type":"Feature","properties":{props},"geometry":{polygon_json(g.ExportToWkb(ogr.wkbNDR))}}}\n')
                features += 1
            lyr = vds = band = mem = code = None
            rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            if rss > MAX_RSS_BYTES:
                raise MemoryError(f"{os.path.basename(strip)} block at column {x0}: peak memory {rss} bytes")
    os.replace(out + ".part", out)
    result = {"strip": os.path.basename(strip), "features": features, "cellsByCode": counts}
    with open(out + ".done", "w") as fh:
        json.dump(result, fh)
    return result


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 24), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True, help="directory of per-cell strips from the v2 worker")
    ap.add_argument("--work", required=True, help="work directory on the data root")
    ap.add_argument("--out", required=True, help="output directory for the archive and its manifest")
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    a = ap.parse_args()
    t0 = time.time()
    os.makedirs(a.work, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    strips = sorted(f for f in os.listdir(a.cells) if f.endswith(".tif") and f.split("-")[0] in
                    {p.split("-")[0] for p in PROVINCES})
    jobs = [(os.path.join(a.cells, f), os.path.join(a.work, f[:-4] + ".geojsonl")) for f in strips]
    results = []
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        for i, r in enumerate(ex.map(strip_job, jobs, chunksize=1), 1):
            results.append(r)
            if i % 50 == 0 or i == len(jobs):
                print(f"polygonized {i}/{len(jobs)} strips, {time.time() - t0:.0f}s", flush=True)
    emitted = time.time() - t0
    inputs = [os.path.basename(out) for _, out in jobs]
    archive = "condition-recovery.pmtiles"
    mbtiles = os.path.join(a.work, "condition-recovery.mbtiles")
    tip = ["tippecanoe", "--output=condition-recovery.mbtiles", "--temporary-directory=.",
           f"--layer={LAYER}", "--minimum-zoom=8", "--maximum-zoom=14",
           "--drop-smallest-as-needed", "--extend-zooms-if-still-dropping",
           "--no-simplification-of-shared-nodes", "--preserve-input-order",
           "--attribute-type=state:int", "--attribute-type=decade:int", *inputs]
    # The tiler takes hours; a finished tile set is kept behind its marker, like a strip.
    resumed = os.path.exists(mbtiles) and os.path.exists(mbtiles + ".done")
    if not resumed:
        if os.path.exists(mbtiles):
            os.remove(mbtiles)
        with open(os.path.join(a.work, "tile.log"), "w") as log:
            subprocess.run(tip, cwd=a.work, check=True, stderr=log,
                           env={**os.environ, "TIPPECANOE_MAX_THREADS": str(a.workers)})
        with open(mbtiles + ".done", "w") as fh:
            json.dump({"tippecanoeFinishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}, fh)
    # pmtiles reads the tile set in tile order, one small random read at a time,
    # which a USB disk serves at about 15 tiles a second (two days for this set).
    # So it reads a copy on the local disk instead; the copy is deleted after.
    local = tempfile.mkdtemp(prefix="condition-recovery-")
    try:
        shutil.copyfile(mbtiles, os.path.join(local, "condition-recovery.mbtiles"))
        subprocess.run(["pmtiles", "convert", "condition-recovery.mbtiles", os.path.join(os.path.abspath(a.out), archive)],
                       cwd=local, check=True)
    finally:
        shutil.rmtree(local)
    header = subprocess.run(["pmtiles", "show", os.path.join(a.out, archive)], check=True,
                            capture_output=True, text=True).stdout
    with open(os.path.join(a.out, "condition-recovery.header.txt"), "w") as fh:
        fh.write(header)
    cells = {}
    for r in results:
        for c, n in r["cellsByCode"].items():
            cells[str(c)] = cells.get(str(c), 0) + n
    manifest = {
        "method": "condition-recovery-per-cell-tiles-v1",
        "builderSha256": sha256(__file__),
        "executedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "layer": LAYER, "minZoom": 8, "maxZoom": 14, "set": "A",
        "states": {"1": "unknown", "4": "recovered", "5": "notRecovered", "6": "notRecoveredUnconfirmedReturn"},
        "decades": {"0": "1985-1994", "1": "1995-2004", "2": "2005-2014", "3": "2015-2022"},
        "blockColumns": BLOCK, "tilerThreads": a.workers,
        "strips": len(jobs), "features": sum(r["features"] for r in results),
        "cellsByCode": dict(sorted(cells.items(), key=lambda kv: int(kv[0]))),
        "tippecanoe": " ".join(tip[:-len(inputs)]) + f" <{len(inputs)} strip files>",
        "archive": {"path": archive, "byteLength": os.path.getsize(os.path.join(a.out, archive)),
                    "sha256": sha256(os.path.join(a.out, archive))},
        "uploaded": False, "tilerResumed": resumed,
        "workers": a.workers, "emitSeconds": round(emitted, 1), "elapsedSeconds": round(time.time() - t0, 1),
    }
    with open(os.path.join(a.out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1); fh.write("\n")
    os.remove(mbtiles); os.remove(mbtiles + ".done")
    for _, out in jobs:
        os.remove(out)
    print(json.dumps({k: manifest[k] for k in ("features", "archive", "elapsedSeconds")}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
