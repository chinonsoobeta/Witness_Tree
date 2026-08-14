#!/usr/bin/env python3
"""Build a bounded Alberta known-coverage footprint with explicit lineage.

This is deliberately not a forest-land-base, provincial-boundary, or coverage
completion transform.  It creates the union of two named, versioned sources:
the Alberta AVI Crown footprint and the Alberta FMA Published Area service
snapshot.  The FMA source contains self-intersections, so every repair is
recorded and is accepted only when the relative area delta is at most 1e-6.
No feature that exceeds that threshold is silently included.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pyogrio.raw
import shapely

FMA_SHA256 = "da4d3d80ddf71e6cae738077fed807cdb9ae39ba946a6a7ce5e2d3ffc69e0e0f"
AVI_FOOTPRINT_SHA256 = "ee27adbaacbf0733e08733f51c5c8711369ee1af5b9f9ee2b8b9c2708e0eb995"
MAX_RELATIVE_AREA_DELTA = 1e-6


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_geometries(path: Path):
    metadata, fids, geometry, fields = pyogrio.raw.read(path, return_fids=True)
    return metadata, fids, shapely.from_wkb(geometry), fields


def bounds(geometry):
    west, south, east, north = shapely.bounds(geometry)
    return {"west": float(west), "south": float(south), "east": float(east), "north": float(north)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fma-source", required=True, type=Path)
    parser.add_argument("--avi-footprint", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()

    if sha256(args.fma_source) != FMA_SHA256:
        raise ValueError("FMA source checksum does not match the recorded snapshot")
    if sha256(args.avi_footprint) != AVI_FOOTPRINT_SHA256:
        raise ValueError("AVI coverage-footprint checksum does not match recorded evidence")
    if shutil.which("ogr2ogr") is None:
        raise RuntimeError("ogr2ogr is required to transform the FMA source to EPSG:3400")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists() or args.evidence.exists():
        raise FileExistsError("output paths must not already exist")

    with tempfile.TemporaryDirectory(prefix="witness-tree-alberta-fma-") as temporary:
        fma_3400 = Path(temporary) / "fma-3400.gpkg"
        subprocess.run([
            "ogr2ogr", "-f", "GPKG", "-t_srs", "EPSG:3400", "-ct_opt", "ONLY_BEST=YES",
            str(fma_3400), str(args.fma_source), "-nln", "fma_published_area",
        ], check=True)
        fma_metadata, fma_fids, fma_geometries, fma_fields = read_geometries(fma_3400)
        avi_metadata, avi_fids, avi_geometries, _ = read_geometries(args.avi_footprint)

        if fma_metadata["crs"] != "EPSG:3400" or avi_metadata["crs"] != "EPSG:3400":
            raise ValueError("both inputs must be EPSG:3400 before union")
        if len(fma_geometries) != 21 or len(avi_geometries) != 1:
            raise ValueError("unexpected source feature count")
        if np.any(shapely.is_missing(fma_geometries)) or np.any(shapely.is_empty(fma_geometries)):
            raise ValueError("FMA source contains missing or empty geometry")
        if np.any(shapely.is_missing(avi_geometries)) or np.any(shapely.is_empty(avi_geometries)) or not np.all(shapely.is_valid(avi_geometries)):
            raise ValueError("AVI footprint must be present, non-empty, and valid")

        repaired = []
        repairs = []
        for index, geometry in enumerate(fma_geometries):
            if shapely.is_valid(geometry):
                repaired.append(geometry)
                continue
            replacement = shapely.make_valid(geometry, method="structure", keep_collapsed=False)
            before = float(shapely.area(geometry))
            after = float(shapely.area(replacement))
            relative_delta = abs(after - before) / max(abs(before), 1.0)
            if replacement.is_empty or not shapely.is_valid(replacement) or relative_delta > MAX_RELATIVE_AREA_DELTA:
                raise ValueError(f"FMA FID {int(fma_fids[index])} cannot be deterministically repaired within tolerance")
            repaired.append(replacement)
            repairs.append({
                "fid": int(fma_fids[index]),
                "holder": str(fma_fields[0][index]),
                "reason": shapely.is_valid_reason(geometry),
                "areaBeforeSquareMetres": before,
                "areaAfterSquareMetres": after,
                "relativeAreaDelta": relative_delta,
                "replacementGeometryType": replacement.geom_type,
            })

        # Source FID order, then AVI; GEOS union is deterministic for these inputs.
        fma_union = shapely.union_all(np.asarray(repaired, dtype=object))
        known_coverage = shapely.union_all(np.asarray([fma_union, avi_geometries[0]], dtype=object))
        if known_coverage.is_empty or not shapely.is_valid(known_coverage):
            raise ValueError("combined known-coverage union must be non-empty and valid")
        overlap = shapely.intersection(fma_union, avi_geometries[0])
        if not shapely.is_valid(overlap):
            raise ValueError("source overlap must be valid")

        pyogrio.raw.write(
            args.out,
            np.asarray([shapely.to_wkb(known_coverage)], dtype=object),
            [np.asarray(["alberta-known-coverage-fma-and-avi-v1"], dtype=object)],
            ["coverage_id"], layer="alberta_known_coverage", driver="GPKG",
            geometry_type="MultiPolygon", crs="EPSG:3400", promote_to_multi=True,
        )
        _, _, output_geometries, _ = read_geometries(args.out)
        if len(output_geometries) != 1 or not shapely.is_valid(output_geometries[0]):
            raise ValueError("output must contain one valid coverage geometry")

        profile = {
            "featureCount": 1,
            "geometryType": output_geometries[0].geom_type,
            "missingGeometryCount": int(np.sum(shapely.is_missing(output_geometries))),
            "emptyGeometryCount": int(np.sum(shapely.is_empty(output_geometries))),
            "invalidGeometryCount": int(np.sum(~shapely.is_valid(output_geometries))),
            "validity": "passed",
            "extentProjected": bounds(output_geometries[0]),
            "areaSquareKilometres": float(shapely.area(output_geometries[0]) / 1_000_000),
        }
        evidence = {
            "schemaVersion": "1.0",
            "status": "local-derived-not-land-base-admitted",
            "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "derivative": {"id": "alberta-known-coverage-fma-and-avi-v1", "file": args.out.name, "sha256": sha256(args.out), "crs": "EPSG:3400", "layer": "alberta_known_coverage"},
            "inputs": [
                {"id": "alberta-fma-published-area", "sha256": FMA_SHA256, "featureCount": 21, "sourceUrl": "https://geospatial.alberta.ca/titan/rest/services/boundaries/forest_management_agreement_public/FeatureServer/0", "scope": "All published FMA holder areas in Alberta; not all Alberta forest land."},
                {"id": "alberta-avi-crown-coverage-footprint-v1", "sha256": AVI_FOOTPRINT_SHA256, "featureCount": 1, "scope": "Dissolved footprint of the staged AVI Crown geometry; not all Alberta forest land."},
            ],
            "fmaRepairOrQuarantine": {"rule": "shapely.make_valid(method='structure', keep_collapsed=False); reject relative area delta > 1e-6", "repairedCount": len(repairs), "quarantinedCount": 0, "repairs": repairs},
            "combination": {"operation": "FMA union in source-FID order, then topological union with AVI Crown footprint", "fmaAreaSquareKilometres": float(shapely.area(fma_union) / 1_000_000), "aviAreaSquareKilometres": float(shapely.area(avi_geometries[0]) / 1_000_000), "overlapAreaSquareKilometres": float(shapely.area(overlap) / 1_000_000), "knownCoverageAreaSquareKilometres": profile["areaSquareKilometres"]},
            "profile": profile,
            "limitations": ["This footprint is a union of two known source footprints, not an Alberta provincial boundary or a complete forest land-base geometry.", "It does not establish coverage for private land, non-FMA Crown land outside AVI, or any area absent from both input sources.", "It is admissible only as partial local-context coverage when the coverage gate explicitly supports that status."],
            "licence": {"id": "ogl-alberta-2.2", "url": "https://open.alberta.ca/licence", "attribution": "Contains information licensed under the Open Government Licence – Alberta."},
        }
        args.evidence.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
