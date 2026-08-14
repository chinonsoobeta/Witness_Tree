#!/usr/bin/env python3
"""Read-only profile for one publisher-selected coverage layer."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

def quoted_identifier(value: str) -> str:
    if not value.replace("_", "").isalnum():
        raise ValueError(f"unsafe GeoPackage identifier: {value}")
    return f'"{value}"'


def native_validity_counts(path: Path, layer: str, geometry_column: str) -> dict[str, int]:
    query = (
        "SELECT COUNT(*) AS feature_count, "
        f"SUM(CASE WHEN {quoted_identifier(geometry_column)} IS NULL THEN 1 ELSE 0 END) AS missing_count, "
        f"SUM(CASE WHEN {quoted_identifier(geometry_column)} IS NOT NULL AND ST_IsEmpty({quoted_identifier(geometry_column)}) THEN 1 ELSE 0 END) AS empty_count, "
        f"SUM(CASE WHEN {quoted_identifier(geometry_column)} IS NOT NULL AND ST_IsValid({quoted_identifier(geometry_column)}) = 0 THEN 1 ELSE 0 END) AS invalid_count "
        f"FROM {quoted_identifier(layer)}"
    )
    result = subprocess.check_output(
        ["ogrinfo", "-ro", "-json", "-features", "-dialect", "SQLite", "-sql", query, str(path)], text=True
    )
    feature = json.loads(result)["layers"][0]["features"][0]["properties"]
    return {
        "featureCount": int(feature["feature_count"]),
        "missingGeometryCount": int(feature["missing_count"] or 0),
        "emptyGeometryCount": int(feature["empty_count"] or 0),
        "invalidGeometryCount": int(feature["invalid_count"] or 0),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--path", required=True, type=Path)
    parser.add_argument("--layer", required=True)
    parser.add_argument("--chunk-size", type=int, default=25_000)
    parser.add_argument("--validity-summary", type=Path)
    args = parser.parse_args()
    if not args.path.is_file() or args.chunk_size <= 0:
        parser.error("path must be a file and chunk-size must be positive")

    metadata = json.loads(subprocess.check_output(["ogrinfo", "-ro", "-json", "-so", str(args.path), args.layer], text=True))
    layers = metadata.get("layers", [])
    if len(layers) != 1 or layers[0].get("name") != args.layer:
        parser.error(f"published layer {args.layer} is absent")
    layer_metadata = layers[0]
    geometry_fields = layer_metadata.get("geometryFields", [])
    if len(geometry_fields) != 1:
        raise RuntimeError("published layer must have exactly one geometry field")
    geometry_metadata = geometry_fields[0]
    geometry_column = str(geometry_metadata["name"])
    validity_evidence: dict[str, str] | None = None
    if args.validity_summary:
        summary_path = args.validity_summary.resolve()
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        if summary.get("kind") != "exhaustive-native-validity-scan":
            raise RuntimeError("validity summary has an unexpected kind")
        counts = {
            "featureCount": int(summary["featureCount"]),
            "missingGeometryCount": int(summary["missingGeometryCount"]),
            "emptyGeometryCount": int(summary["emptyGeometryCount"]),
            "invalidGeometryCount": int(summary["invalidGeometryCount"]),
        }
        validity_evidence = {"path": str(summary_path), "sha256": sha256(summary_path), "method": str(summary["method"])}
    else:
        counts = native_validity_counts(args.path, args.layer, geometry_column)
    if counts["featureCount"] != int(layer_metadata["featureCount"]):
        raise RuntimeError("GDAL feature count and native validity-scan count disagree")
    crs_id = geometry_metadata.get("coordinateSystem", {}).get("projjson", {}).get("id", {})
    crs = f"{crs_id.get('authority')}:{crs_id.get('code')}" if crs_id else None
    print(json.dumps({
        "status": "local-staging-profile",
        "tools": {"gdal": subprocess.check_output(["ogrinfo", "--version"], text=True).strip()},
        "sources": [{"sourceId": args.source_id, "layers": [{
            "name": args.layer,
            "geometryType": str(geometry_metadata["type"]),
            "featureCount": counts["featureCount"],
            "crs": crs,
            "totalBounds": [float(value) for value in geometry_metadata["extent"]],
            "fields": [{"name": str(field["name"]), "dtype": str(field["type"])} for field in layer_metadata["fields"]],
            "geometryColumn": geometry_column,
            **counts,
            "invalidGeometryReasons": {},
            "validityMethod": "GDAL SQLite ST_IsValid/ST_IsEmpty over every published feature",
            "validityEvidence": validity_evidence,
        }]}],
    }, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
