#!/usr/bin/env python3
"""Read-only schema and geometry profile for verified staged geospatial sources."""

import argparse
import json
from pathlib import Path

import numpy as np
import pyogrio
from shapely import from_wkb, is_empty, is_valid, is_valid_reason


def parse_source(value: str) -> tuple[str, Path]:
    source_id, separator, raw_path = value.partition("=")
    if not separator or not source_id or not raw_path:
        raise argparse.ArgumentTypeError("sources must use SOURCE_ID=/absolute/path")
    path = Path(raw_path)
    if not path.is_absolute() or not path.exists():
        raise argparse.ArgumentTypeError("source path must be absolute and exist")
    return source_id, path


def geometry_profile(path: Path, layer: str, feature_count: int, chunk_size: int) -> dict:
    missing = invalid = empty = 0
    invalid_reasons: dict[str, int] = {}
    for offset in range(0, feature_count, chunk_size):
        _, _, encoded, _ = pyogrio.raw.read(
            path,
            layer=layer,
            columns=[],
            skip_features=offset,
            max_features=min(chunk_size, feature_count - offset),
        )
        missing_mask = np.fromiter((value is None for value in encoded), dtype=bool, count=len(encoded))
        missing += int(missing_mask.sum())
        present = encoded[~missing_mask]
        if not len(present):
            continue
        geometries = from_wkb(present)
        valid_mask = is_valid(geometries)
        empty += int(is_empty(geometries).sum())
        invalid += int((~valid_mask).sum())
        for reason in is_valid_reason(geometries[~valid_mask]):
            category = str(reason).partition("[")[0].strip()
            invalid_reasons[category] = invalid_reasons.get(category, 0) + 1
    return {
        "missingGeometryCount": missing,
        "emptyGeometryCount": empty,
        "invalidGeometryCount": invalid,
        "invalidGeometryReasons": invalid_reasons,
    }


def profile(source_id: str, path: Path, chunk_size: int) -> dict:
    layers = []
    for name, geometry_type in pyogrio.list_layers(path):
        info = pyogrio.read_info(path, layer=name, force_feature_count=True, force_total_bounds=True)
        feature_count = int(info["features"])
        layers.append({
            "name": str(name),
            "geometryType": None if geometry_type is None else str(geometry_type),
            "featureCount": feature_count,
            "crs": info["crs"],
            "totalBounds": [float(value) for value in info["total_bounds"]],
            "fields": [
                {"name": str(field), "dtype": str(dtype)}
                for field, dtype in zip(info["fields"], info["dtypes"])
            ],
            **geometry_profile(path, str(name), feature_count, chunk_size),
        })
    return {"sourceId": source_id, "layers": layers}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="append", required=True, type=parse_source)
    parser.add_argument("--chunk-size", type=int, default=25_000)
    args = parser.parse_args()
    if args.chunk_size <= 0:
        parser.error("chunk size must be positive")
    document = {
        "status": "local-staging-profile",
        "tools": {"pyogrio": pyogrio.__version__, "gdal": pyogrio.__gdal_version_string__},
        "sources": [profile(source_id, path, args.chunk_size) for source_id, path in args.source],
    }
    print(json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
