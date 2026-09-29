#!/usr/bin/env python3
"""Every overlap between a 2021 census subdivision and a riding: stage one of the place-name index.

Search could only find the illustrative fixtures, because the repository had no
list of real places.  The place-name index supplies one, built from the 2021
census subdivisions, the unit the owner accepted for municipalities on
2026-08-21 (data/phase2-real-data-owner-decision.json,
ownerDecision.municipalityBoundaryDecision).

This stage is geometry only.  It intersects every subdivision in British
Columbia, Alberta, Ontario and Quebec with every federal and provincial riding
it can touch, and writes the whole overlap table, slivers included.  Nothing is
left out here: which places to list, and which overlaps are too small to name,
are decisions, and they belong to the second stage
(scripts/place_name_index.py).  Keeping the full table on the data drive means
either decision can be audited or changed without redoing the geometry.

The ridings are read from the exact bytes the district index was built from:
each layer is checked against the source digest that
data/phase6-district-index.json records before it is read.  A riding is named
by the id the released riding figures use, jurisdiction first (CA-59001,
BC-258), so an overlap joins to that riding's numbers without a second lookup.
Features that share an id are unioned first, as the district index does.

Areas are computed in Canada Albers Equal Area (ESRI:102001), so a share is a
share of ground area rather than of projected map area.

Everything is written once into the output directory and never overwritten.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from osgeo import gdal, ogr, osr

METHOD_VERSION = "place-name-overlaps-csd-riding-v1"
EDITION_ID = "statcan-2021-census-subdivisions-cbf"
SUBDIVISION_LAYER = "lcsd000b21a_e"
SUBDIVISION_FEATURES = 5161
AREA_CRS = "ESRI:102001"
PROVINCES = {"59": "BC", "48": "AB", "35": "ON", "24": "QC"}
OUTPUTS = ("subdivisions.jsonl", "overlaps.jsonl")


def fail(message: str) -> None:
    print(f"place-name overlaps: {message}", file=sys.stderr)
    raise SystemExit(1)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256_file(path: str) -> str:
    """Hash a local file, or the whole archive behind a /vsizip path, as phase6_district_index.py does."""

    source = path
    if source.startswith("/vsizip/"):
        archive = source[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        source = archive[: marker + 4] if marker >= 0 else archive
    digest = hashlib.sha256()
    with open(source, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def toolchain() -> dict:
    return {
        "python": sys.version.split()[0],
        "gdal": gdal.__version__,
        "proj": f"{osr.GetPROJVersionMajor()}.{osr.GetPROJVersionMinor()}.{osr.GetPROJVersionMicro()}",
        "geos": f"{ogr.GetGEOSVersionMajor()}.{ogr.GetGEOSVersionMinor()}.{ogr.GetGEOSVersionMicro()}",
    }


def write_once(path: Path, text: str) -> None:
    if path.exists():
        fail(f"refusing to overwrite {path}")
    with open(path, "x", encoding="utf-8") as stream:
        stream.write(text)


def area_srs() -> osr.SpatialReference:
    srs = osr.SpatialReference()
    srs.SetFromUserInput(AREA_CRS)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def polygonal(geometry: ogr.Geometry) -> ogr.Geometry | None:
    """The polygon parts of a geometry, dropping any lines or points a repair leaves behind."""

    kind = ogr.GT_Flatten(geometry.GetGeometryType())
    if kind in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
        return geometry
    if kind != ogr.wkbGeometryCollection:
        return None
    parts = ogr.Geometry(ogr.wkbMultiPolygon)
    for index in range(geometry.GetGeometryCount()):
        part = geometry.GetGeometryRef(index)
        part_kind = ogr.GT_Flatten(part.GetGeometryType())
        if part_kind == ogr.wkbPolygon:
            parts.AddGeometry(part)
        elif part_kind == ogr.wkbMultiPolygon:
            for inner in range(part.GetGeometryCount()):
                parts.AddGeometry(part.GetGeometryRef(inner))
    return parts if parts.GetGeometryCount() else None


def repaired(geometry: ogr.Geometry, label: str) -> tuple[ogr.Geometry, dict | None]:
    """A valid polygonal geometry, and a record of the repair if one was needed.

    The area of an invalid polygon is not a reliable figure, so a repair is not
    judged against it exactly.  Every repair is recorded with both areas for
    the manifest, and one that moves more than a thousandth of the area is
    refused rather than trusted.
    """

    if geometry.IsValid():
        return geometry, None
    before = geometry.GetArea()
    fixed = polygonal(geometry.MakeValid())
    if fixed is not None and not fixed.IsValid():
        fixed = fixed.Buffer(0)
    if fixed is None or fixed.IsEmpty() or not fixed.IsValid():
        fail(f"cannot repair the geometry of {label}")
    after = fixed.GetArea()
    if before <= 0 or abs(after - before) / before > 1e-3:
        fail(f"repairing {label} changed its area from {before:.1f} to {after:.1f} square metres")
    return fixed, {"id": label, "areaBeforeM2": round(before, 1), "areaAfterM2": round(after, 1)}


def transformer(layer: ogr.Layer, target: osr.SpatialReference, label: str) -> osr.CoordinateTransformation:
    source = layer.GetSpatialRef()
    if source is None:
        fail(f"{label} carries no spatial reference")
    source = source.Clone()
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(source, target)


def read_subdivisions(path: str, target: osr.SpatialReference) -> tuple[list[dict], list[dict]]:
    dataset = ogr.Open(path)
    if dataset is None:
        fail(f"cannot open {path}")
    layer = dataset.GetLayerByName(SUBDIVISION_LAYER)
    if layer is None:
        fail(f"{path} has no layer {SUBDIVISION_LAYER}")
    if layer.GetFeatureCount() != SUBDIVISION_FEATURES:
        fail(f"expected {SUBDIVISION_FEATURES} subdivisions nationally, found {layer.GetFeatureCount()}")
    transform = transformer(layer, target, path)
    subdivisions, repairs = [], []
    for feature in layer:
        province = feature.GetField("PRUID")
        if province not in PROVINCES:
            continue
        uid, name, kind = feature.GetField("CSDUID"), feature.GetField("CSDNAME"), feature.GetField("CSDTYPE")
        if not uid or not name or not kind:
            fail(f"a subdivision in province {province} is missing its id, name or type")
        if not uid.startswith(province):
            fail(f"subdivision {uid} does not carry its province code {province}")
        geometry = feature.GetGeometryRef()
        if geometry is None or geometry.IsEmpty():
            fail(f"subdivision {uid} has no geometry")
        geometry = geometry.Clone()
        if geometry.Transform(transform) != 0:
            fail(f"cannot reproject subdivision {uid}")
        geometry, repair = repaired(geometry, f"subdivision {uid}")
        if repair:
            repairs.append(repair)
        subdivisions.append({
            "id": uid, "name": name, "type": kind, "province": province,
            "landAreaKm2": feature.GetField("LANDAREA"),
            "geometry": geometry, "areaM2": geometry.GetArea(), "envelope": geometry.GetEnvelope(),
        })
    ids = [entry["id"] for entry in subdivisions]
    if len(ids) != len(set(ids)):
        fail("subdivision ids are not unique")
    return subdivisions, repairs


def read_ridings(spec: dict, target: osr.SpatialReference) -> tuple[list[dict], list[dict]]:
    dataset = ogr.Open(spec["path"])
    if dataset is None:
        fail(f"cannot open {spec['path']}")
    layer = dataset.GetLayerByName(spec["layer"]) if spec.get("layer") else dataset.GetLayer(0)
    if layer is None:
        fail(f"cannot open layer {spec.get('layer')} in {spec['path']}")
    transform = transformer(layer, target, spec["path"])
    collected: dict[str, ogr.Geometry] = {}
    for feature in layer:
        value = feature.GetField(spec["idField"])
        if value is None:
            fail(f"a riding in {spec['id']} has no {spec['idField']}")
        raw = str(value)
        # A federal riding's number starts with its province code; a
        # provincial layer is one province.
        province = raw[:2] if spec["jurisdiction"] == "CA" else spec["province"]
        if province not in PROVINCES:
            continue
        geometry = feature.GetGeometryRef()
        if geometry is None or geometry.IsEmpty():
            fail(f"riding {raw} of {spec['id']} has no geometry")
        geometry = geometry.Clone()
        if geometry.Transform(transform) != 0:
            fail(f"cannot reproject riding {raw} of {spec['id']}")
        key = f"{spec['jurisdiction']}-{raw}"
        collected[key] = geometry if key not in collected else collected[key].Union(geometry)
    ridings, repairs = [], []
    for key in sorted(collected):
        geometry, repair = repaired(collected[key], f"riding {key}")
        if repair:
            repairs.append(repair)
        raw = key.split("-", 1)[1]
        ridings.append({
            "id": key,
            "province": raw[:2] if spec["jurisdiction"] == "CA" else spec["province"],
            "geometry": geometry, "areaM2": geometry.GetArea(), "envelope": geometry.GetEnvelope(),
        })
    if not ridings:
        fail(f"{spec['id']} produced no ridings")
    return ridings, repairs


def envelopes_meet(a: tuple, b: tuple) -> bool:
    # OGR envelopes are (minX, maxX, minY, maxY).
    return not (a[1] < b[0] or b[1] < a[0] or a[3] < b[2] or b[3] < a[2])


def intersection_m2(a: ogr.Geometry, b: ogr.Geometry, label: str) -> float:
    try:
        return a.Intersection(b).GetArea()
    except RuntimeError:
        try:
            return a.Buffer(0).Intersection(b.Buffer(0)).GetArea()
        except RuntimeError as error:
            fail(f"cannot intersect {label}: {error}")
    return 0.0


def checked_layers(layers_path: Path, district_index_path: Path) -> list[dict]:
    """The riding layers, each tied to the exact bytes the district index was built from."""

    specs = json.loads(layers_path.read_text(encoding="utf-8"))
    recorded = {layer["id"]: layer["source"] for layer in json.loads(district_index_path.read_text(encoding="utf-8"))["layers"]}
    if sorted(spec["id"] for spec in specs) != sorted(recorded):
        fail("the layer list does not name exactly the district index's layers")
    for spec in specs:
        source = recorded[spec["id"]]
        if source["path"] != spec["path"]:
            fail(f"{spec['id']} reads {spec['path']}, but the district index was built from {source['path']}")
        if spec["jurisdiction"] != "CA" and spec.get("province") not in PROVINCES:
            fail(f"{spec['id']} names no province this index covers")
        actual = sha256_file(spec["path"])
        if actual != source["sha256"]:
            fail(f"{spec['id']} hashes to {actual}, but the district index recorded {source['sha256']}")
        spec["sha256"] = actual
    return specs


def main() -> None:
    arguments = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    arguments.add_argument("--subdivisions", required=True, help="/vsizip path to the staged subdivision archive")
    arguments.add_argument("--editions", required=True, help="data/boundary-editions.json")
    arguments.add_argument("--district-index", required=True, help="data/phase6-district-index.json")
    arguments.add_argument("--layers", required=True)
    arguments.add_argument("--output", required=True)
    arguments.add_argument("--manifest", required=True)
    arguments.add_argument("--code-version", required=True)
    args = arguments.parse_args()

    gdal.UseExceptions()
    ogr.UseExceptions()
    osr.UseExceptions()
    output = Path(args.output)
    started = now()

    editions = json.loads(Path(args.editions).read_text(encoding="utf-8"))
    edition = next((entry for entry in editions["editions"] if entry["id"] == EDITION_ID), None)
    if edition is None:
        fail(f"{EDITION_ID} is not in the boundary editions record")
    if not args.subdivisions.startswith("/vsizip/"):
        fail("the subdivisions path must be a /vsizip path to the staged archive")
    subdivision_sha = sha256_file(args.subdivisions)
    if subdivision_sha != edition["sha256"]:
        fail(f"the subdivision archive hashes to {subdivision_sha}, not the recorded {edition['sha256']}")

    target = area_srs()
    specs = checked_layers(Path(args.layers), Path(args.district_index))
    subdivisions, subdivision_repairs = read_subdivisions(args.subdivisions, target)
    print(f"{now()} {len(subdivisions)} subdivisions read, {len(subdivision_repairs)} repaired", flush=True)

    rows, layer_summaries = [], []
    for spec in specs:
        ridings, riding_repairs = read_ridings(spec, target)
        by_province: dict[str, list[dict]] = {}
        for riding in ridings:
            by_province.setdefault(riding["province"], []).append(riding)
        count = 0
        for subdivision in subdivisions:
            for riding in by_province.get(subdivision["province"], []):
                if not envelopes_meet(subdivision["envelope"], riding["envelope"]):
                    continue
                area = intersection_m2(subdivision["geometry"], riding["geometry"], f"{subdivision['id']} with {riding['id']}")
                if area <= 0:
                    continue
                rows.append({
                    "subdivision": subdivision["id"],
                    "province": subdivision["province"],
                    "layer": spec["id"],
                    "riding": riding["id"],
                    "intersectionM2": round(area, 1),
                    "shareOfSubdivision": round(area / subdivision["areaM2"], 8),
                    "shareOfRiding": round(area / riding["areaM2"], 8),
                })
                count += 1
        layer_summaries.append({
            "id": spec["id"], "jurisdiction": spec["jurisdiction"], "province": spec.get("province"),
            "path": spec["path"], "sha256": spec["sha256"], "layer": spec.get("layer"), "idField": spec["idField"],
            "ridings": len(ridings), "ridingsByProvince": {code: len(group) for code, group in sorted(by_province.items())},
            "repairs": riding_repairs, "overlaps": count,
            "ridingAreasM2": {riding["id"]: round(riding["areaM2"], 1) for riding in ridings},
        })
        print(f"{now()} {spec['id']}: {len(ridings)} ridings, {len(riding_repairs)} repaired, {count} overlaps", flush=True)

    write_once(output / "subdivisions.jsonl", "".join(
        json.dumps({key: entry[key] for key in ("id", "name", "type", "province", "landAreaKm2")}
                   | {"areaM2": round(entry["areaM2"], 1)}) + "\n"
        for entry in subdivisions
    ))
    write_once(output / "overlaps.jsonl", "".join(json.dumps(row) + "\n" for row in rows))
    record = {
        "schemaVersion": "witness-tree/place-name-overlaps-manifest/1",
        "methodVersion": METHOD_VERSION,
        "codeVersion": args.code_version,
        "builderSha256": sha256_file(str(Path(__file__).resolve())),
        "startedAt": started,
        "finishedAt": now(),
        "toolchain": toolchain(),
        "areaCrs": AREA_CRS,
        "provinces": PROVINCES,
        "subdivisions": {
            "editionId": EDITION_ID, "path": args.subdivisions, "layer": SUBDIVISION_LAYER,
            "sha256": subdivision_sha, "nationalFeatures": SUBDIVISION_FEATURES,
            "read": len(subdivisions), "repairs": subdivision_repairs,
        },
        "layerList": {"path": args.layers, "sha256": sha256_file(args.layers)},
        "layers": layer_summaries,
        "outputs": {name: {"sha256": sha256_file(str(output / name)), "bytes": (output / name).stat().st_size} for name in OUTPUTS},
        "overlapCount": len(rows),
        "claims": {"admitted": False, "released": False, "productionEligible": False, "externalAction": False},
    }
    write_once(Path(args.manifest), json.dumps(record, indent=2) + "\n")
    print(f"{now()} wrote {len(rows)} overlaps to {output}")


if __name__ == "__main__":
    main()
