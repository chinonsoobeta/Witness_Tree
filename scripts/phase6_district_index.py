#!/usr/bin/env python3
"""A 960 m district index, so a point can be resolved without shipping polygons.

The worker cannot open a vector file and the boundary tiles are generalized,
so a point cannot be tested against a polygon at request time.  This builds a
lookup on exactly the coarse grid the shape product uses: one entry per 960 m
block, addressable by byte offset, so resolving a point is a single two-byte
range request rather than a download of the country.

The honest part is the mixture.  A 960 m block near a boundary lies in more
than one district, and an index that stored a single winner would answer such
a point confidently and sometimes wrongly.  So a block stores one of:

    0                  no district covers this block
    1 .. 39999         exactly one district, by legend position
    40000 + k          more than one, and k indexes the mixture table

A caller that lands on a mixture is told which districts are candidates and
that the index cannot separate them at this resolution.  That is a smaller
answer than a polygon test, and it is a true one.

Districts are burned with ALL_TOUCHED, so a block counts as covered when any
part of it falls inside the district.  Mixture is therefore detected rather
than approximated: any block a boundary crosses is a mixture by construction.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr

BLOCK = 32  # 960 m, matching phase6_coarse_grid_aggregate.py
MIXTURE_BASE = 40000
SINGLE_LIMIT = MIXTURE_BASE - 1


def fail(message: str) -> None:
    print(f"district index: {message}", file=sys.stderr)
    raise SystemExit(1)


def sha256_file(path: str) -> str:
    """Hash a local file, or the whole archive behind a /vsizip path.

    Matching phase2_annual_zonal_aggregate_v2.sha256, so a boundary source
    hashes to the same value here as it does in the zonal provenance.
    """

    source = path
    if source.startswith("/vsizip/"):
        archive = source[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        if marker >= 0:
            source = archive[: marker + 4]
    digest = hashlib.sha256()
    with open(source, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def block_grid(reference: str) -> dict[str, object]:
    raster = gdal.Open(reference, gdal.GA_ReadOnly)
    if raster is None:
        fail(f"cannot open the reference raster {reference}")
    transform = raster.GetGeoTransform()
    if transform[2] or transform[4]:
        fail("the reference raster is rotated")
    if round(transform[1], 6) != 30.0 or round(transform[5], 6) != -30.0:
        fail("the reference raster is not a 30 m grid")
    return {
        "width": (raster.RasterXSize + BLOCK - 1) // BLOCK,
        "height": (raster.RasterYSize + BLOCK - 1) // BLOCK,
        "originX": transform[0],
        "originY": transform[3],
        "metres": BLOCK * 30.0,
        "wkt": raster.GetProjection(),
        "rasterWidth": raster.RasterXSize,
        "rasterHeight": raster.RasterYSize,
    }


def district_features(path: str, layer_name: str, id_field: str, name_fields: dict[str, str], target_wkt: str):
    """Every district as one geometry in the raster's CRS, keyed by its own id."""

    source = ogr.Open(path)
    if source is None:
        fail(f"cannot open {path}")
    layer = source.GetLayerByName(layer_name) if layer_name else source.GetLayerByIndex(0)
    if layer is None:
        fail(f"cannot open layer {layer_name} in {path}")

    source_srs = layer.GetSpatialRef()
    if source_srs is None:
        fail(f"{path} carries no spatial reference")
    target_srs = osr.SpatialReference()
    target_srs.ImportFromWkt(target_wkt)
    source_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(source_srs, target_srs)

    collected: dict[str, dict[str, object]] = {}
    for feature in layer:
        key = str(feature.GetField(id_field))
        geometry = feature.GetGeometryRef()
        if geometry is None:
            continue
        clone = geometry.Clone()
        if clone.Transform(transform) != 0:
            fail(f"cannot reproject district {key}")
        entry = collected.get(key)
        if entry is None:
            collected[key] = {
                "id": key,
                "names": {locale: feature.GetField(field) for locale, field in name_fields.items()},
                "geometry": clone,
            }
        else:
            entry["geometry"] = entry["geometry"].Union(clone)
    if not collected:
        fail(f"{path} produced no districts")
    return [collected[key] for key in sorted(collected, key=lambda value: (len(value), value))]


def burn(geometry, grid: dict[str, object], target_wkt: str) -> tuple[np.ndarray, int, int]:
    """Rasterize one district over its own bounding window only."""

    min_x, max_x, min_y, max_y = geometry.GetEnvelope()
    left = int(np.floor((min_x - grid["originX"]) / grid["metres"]))
    right = int(np.ceil((max_x - grid["originX"]) / grid["metres"]))
    top = int(np.floor((grid["originY"] - max_y) / grid["metres"]))
    bottom = int(np.ceil((grid["originY"] - min_y) / grid["metres"]))
    left = max(0, min(left, grid["width"]))
    right = max(0, min(right, grid["width"]))
    top = max(0, min(top, grid["height"]))
    bottom = max(0, min(bottom, grid["height"]))
    width = right - left
    height = bottom - top
    if width <= 0 or height <= 0:
        return np.zeros((0, 0), dtype=bool), left, top

    driver = gdal.GetDriverByName("MEM")
    target = driver.Create("", width, height, 1, gdal.GDT_Byte)
    target.SetGeoTransform(
        (
            grid["originX"] + left * grid["metres"],
            grid["metres"],
            0.0,
            grid["originY"] - top * grid["metres"],
            0.0,
            -grid["metres"],
        )
    )
    target.SetProjection(target_wkt)

    memory = ogr.GetDriverByName("Memory").CreateDataSource("burn")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(target_wkt)
    layer = memory.CreateLayer("burn", srs=srs, geom_type=ogr.wkbMultiPolygon)
    feature = ogr.Feature(layer.GetLayerDefn())
    feature.SetGeometry(geometry)
    layer.CreateFeature(feature)

    if gdal.RasterizeLayer(target, [1], layer, burn_values=[1], options=["ALL_TOUCHED=TRUE"]) != 0:
        fail("rasterization failed")
    values = target.GetRasterBand(1).ReadAsArray()
    return values.astype(bool), left, top


def build_layer(spec: dict[str, str], grid: dict[str, object]) -> dict[str, object]:
    districts = district_features(
        spec["path"], spec.get("layer", ""), spec["idField"],
        {"en": spec["nameFieldEn"], "fr": spec["nameFieldFr"]}, grid["wkt"],
    )
    if len(districts) > SINGLE_LIMIT:
        fail(f"{spec['id']} has more districts than the single-district encoding allows")

    height, width = int(grid["height"]), int(grid["width"])
    index = np.zeros((height, width), dtype=np.uint16)
    mixtures: dict[int, tuple[int, ...]] = {}
    mixture_lookup: dict[tuple[int, ...], int] = {}

    for position, district in enumerate(districts, start=1):
        mask, left, top = burn(district["geometry"], grid, grid["wkt"])
        if mask.size == 0:
            continue
        rows, columns = np.nonzero(mask)
        if rows.size == 0:
            continue
        rows = rows + top
        columns = columns + left
        current = index[rows, columns]

        empty = current == 0
        index[rows[empty], columns[empty]] = position

        taken = ~empty
        for row, column, existing in zip(rows[taken], columns[taken], current[taken]):
            if existing >= MIXTURE_BASE:
                members = mixtures[int(existing) - MIXTURE_BASE]
            else:
                members = (int(existing),)
            if position in members:
                continue
            combined = tuple(sorted(members + (position,)))
            key = mixtures_key(mixtures, mixture_lookup, combined)
            index[row, column] = np.uint16(MIXTURE_BASE + key)

    table = [None] * len(mixtures)
    for key, members in mixtures.items():
        table[key] = list(members)
    if MIXTURE_BASE + len(table) > 65535:
        fail(f"{spec['id']} needs more mixtures than the encoding allows")

    single = int(np.count_nonzero((index > 0) & (index < MIXTURE_BASE)))
    mixed = int(np.count_nonzero(index >= MIXTURE_BASE))
    return {
        "id": spec["id"],
        "index": index,
        "legend": [
            {"position": position, "districtId": district["id"], "name": district["names"]}
            for position, district in enumerate(districts, start=1)
        ],
        "mixtures": table,
        "coveredBlocks": single + mixed,
        "singleDistrictBlocks": single,
        "mixedBlocks": mixed,
        "sourceSha256": sha256_file(spec["path"]),
        "sourcePath": spec["path"],
    }


def mixtures_key(
    mixtures: dict[int, tuple[int, ...]],
    lookup: dict[tuple[int, ...], int],
    combined: tuple[int, ...],
) -> int:
    """Intern a candidate set.  Boundaries repeat the same pair block after
    block, so the table stays small only if identical sets share a key."""

    key = lookup.get(combined)
    if key is not None:
        return key
    key = len(mixtures)
    mixtures[key] = combined
    lookup[combined] = key
    return key


def main(args: argparse.Namespace) -> None:
    gdal.UseExceptions()
    ogr.UseExceptions()
    started = datetime.now(timezone.utc)
    grid = block_grid(args.reference_raster)
    specs = json.loads(Path(args.layers).read_text(encoding="utf-8"))

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    summary = []
    for spec in specs:
        print(f"building {spec['id']}", flush=True)
        built = build_layer(spec, grid)
        binary = output / f"{built['id']}.u16"
        if binary.exists():
            fail(f"refusing to overwrite {binary}")
        built["index"].astype("<u2").tofile(binary)
        summary.append(
            {
                "id": built["id"],
                "file": binary.name,
                "bytes": binary.stat().st_size,
                "sha256": sha256_file(str(binary)),
                "districts": len(built["legend"]),
                "legend": built["legend"],
                "mixtures": built["mixtures"],
                "coveredBlocks": built["coveredBlocks"],
                "singleDistrictBlocks": built["singleDistrictBlocks"],
                "mixedBlocks": built["mixedBlocks"],
                "source": {"path": built["sourcePath"], "sha256": built["sourceSha256"]},
            }
        )
        print(
            f"  {len(built['legend'])} districts, {built['singleDistrictBlocks']} single blocks, "
            f"{built['mixedBlocks']} mixed blocks, {len(built['mixtures'])} distinct mixtures",
            flush=True,
        )

    manifest = {
        "schemaVersion": "witness-tree/phase6-district-index/1",
        "methodVersion": args.method_version,
        "codeVersion": args.code_version,
        "builderSha256": sha256_file(str(Path(__file__).resolve())),
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "blockPixels": BLOCK,
        "blockMetres": grid["metres"],
        "gridWidth": grid["width"],
        "gridHeight": grid["height"],
        "originX": grid["originX"],
        "originY": grid["originY"],
        "rasterWidth": grid["rasterWidth"],
        "rasterHeight": grid["rasterHeight"],
        "crsWktSha256": hashlib.sha256(grid["wkt"].encode("utf-8")).hexdigest(),
        "encoding": {
            "dtype": "uint16-little-endian",
            "rowMajor": True,
            "empty": 0,
            "singleDistrictRange": [1, SINGLE_LIMIT],
            "mixtureBase": MIXTURE_BASE,
            "allTouched": True,
            "rule": (
                "a block holds a district only when the district covers part of it; a block a "
                "boundary crosses is a mixture and names its candidates rather than choosing one"
            ),
        },
        "layers": summary,
        "claims": {"admitted": False, "released": False, "productionEligible": False, "expertReviewed": False},
    }
    Path(args.manifest).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.manifest}")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reference-raster", required=True)
    p.add_argument("--layers", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--method-version", required=True)
    p.add_argument("--code-version", required=True)
    return p


if __name__ == "__main__":
    main(parser().parse_args())
