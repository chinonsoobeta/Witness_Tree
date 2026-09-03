#!/usr/bin/env python3
"""Measure how much of each province each Hansen tile actually holds.

The gap measurement clips a shared tile set with province geometry, so it carries no
per-province tile label that could name the wrong tile. Its failure mode is the opposite
one: a province reaching past the tile set and being silently truncated, which would
understate that province's gap without any number looking wrong.

This measures the overlap directly. Provinces come from the unsimplified geometry the
Phase 8 map release binds by checksum, so the audit cannot drift from what the site
publishes. Output carries no timestamp, so it is a pure function of its bound input.

Usage: audit-vlce2-gap-tile-coverage.py <repo-root> <data-root> <output.json>
"""
import hashlib
import json
import math
import sys

from osgeo import ogr

ogr.UseExceptions()

GEOJSON_FILE = "phase2-province-loss-2020-2022.geojson"
GEOJSON_DIR = "derived/phase8-province-map-geojson-v1"
# Every genuinely needed tile measured at least 457,131 ha. Every sliver measured at most
# 184 ha, all of them where boundary vertices sit a fraction above the 60th parallel, which
# is the real northern limit of both Alberta and British Columbia. A threshold anywhere in
# that three-order-of-magnitude gap separates them; 1,000 ha errs toward demanding tiles.
THRESHOLD_HECTARES = 1000.0
EARTH_METRES_PER_DEGREE = 111320.0


def tile_name(min_x, max_y):
    return f"{abs(max_y):02d}{'N' if max_y >= 0 else 'S'}_{abs(min_x):03d}{'W' if min_x < 0 else 'E'}"


def tile_polygon(min_x, max_y):
    ring = ogr.Geometry(ogr.wkbLinearRing)
    for x, y in [(min_x, max_y - 10), (min_x + 10, max_y - 10), (min_x + 10, max_y), (min_x, max_y), (min_x, max_y - 10)]:
        ring.AddPoint_2D(float(x), float(y))
    polygon = ogr.Geometry(ogr.wkbPolygon)
    polygon.AddGeometry(ring)
    return polygon


def main(repo_root, data_root, output_path):
    release = json.load(open(f"{repo_root}/data/phase8-province-map-release.json"))
    digest = release["browserCompatibilityOutput"]["displayGeometry"]["parentSha256"]
    raw = open(f"{data_root}/{GEOJSON_DIR}/{digest}/{GEOJSON_FILE}", "rb").read()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise SystemExit("province geometry does not match the checksum the Phase 8 map release binds")

    provinces = {}
    envelopes = {}
    for feature in json.loads(raw)["features"]:
        name = feature["properties"]["province_name_en"]
        geometry = ogr.CreateGeometryFromJson(json.dumps(feature["geometry"]))
        if not geometry.IsValid():
            geometry = geometry.Buffer(0)
        min_x, max_x, min_y, max_y = geometry.GetEnvelope()
        envelopes[name] = [min_x, min_y, max_x, max_y]
        overlaps = {}
        first_column = math.floor(min_x / 10) * 10
        last_column = math.floor((max_x - 1e-12) / 10) * 10
        first_row = math.ceil((min_y + 1e-12) / 10) * 10
        last_row = math.ceil(max_y / 10) * 10
        for column in range(int(first_column), int(last_column) + 10, 10):
            for row in range(int(first_row), int(last_row) + 10, 10):
                tile = tile_polygon(column, row)
                if not geometry.Intersects(tile):
                    continue
                intersection = geometry.Intersection(tile)
                if intersection.IsEmpty():
                    continue
                mid_latitude = math.radians((max(min_y, row - 10) + min(max_y, row)) / 2)
                hectares = intersection.GetArea() * EARTH_METRES_PER_DEGREE ** 2 * math.cos(mid_latitude) / 10000
                overlaps[tile_name(column, row)] = round(hectares, 1)
        provinces[name] = dict(sorted(overlaps.items()))

    required = sorted({t for o in provinces.values() for t, ha in o.items() if ha > THRESHOLD_HECTARES})
    below = {}
    for overlaps in provinces.values():
        for tile, hectares in overlaps.items():
            if hectares <= THRESHOLD_HECTARES and tile not in required:
                below[tile] = max(below.get(tile, 0.0), hectares)

    document = {
        "schema": "witness-tree/vlce2-gap-tile-coverage-audit/1",
        "question": "Does the tile set the gap measurement clipped cover every province it reports?",
        "geometrySource": {
            "boundRecord": "data/phase8-province-map-release.json",
            "field": "browserCompatibilityOutput.displayGeometry.parentSha256",
            "sha256": digest,
            "why": "The unsimplified parent, not the display copy. The display copy omits small islands, so a coverage test against it could miss a tile a province genuinely reaches.",
        },
        "thresholdHectares": THRESHOLD_HECTARES,
        "areaMethod": "planar intersection in degrees scaled by cos(mid-latitude); an estimate sufficient to separate a real tile from a boundary sliver, not a published area",
        "provinceEnvelopesWgs84": dict(sorted(envelopes.items())),
        "overlapHectaresByProvince": dict(sorted(provinces.items())),
        "requiredTiles": required,
        "belowThresholdTiles": dict(sorted(below.items())),
    }
    with open(output_path, "w") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")
    print(f"{len(required)} tiles required above {THRESHOLD_HECTARES:,.0f} ha; {len(below)} below-threshold slivers")


if __name__ == "__main__":
    main(*sys.argv[1:4])
