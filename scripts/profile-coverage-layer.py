#!/usr/bin/env python3
"""Read-only profile for one publisher-selected coverage layer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pyogrio
from shapely import from_wkb, is_empty, is_valid, is_valid_reason


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--path", required=True, type=Path)
    parser.add_argument("--layer", required=True)
    parser.add_argument("--chunk-size", type=int, default=25_000)
    args = parser.parse_args()
    if not args.path.is_file() or args.chunk_size <= 0:
        parser.error("path must be a file and chunk-size must be positive")

    available = {str(name) for name, _ in pyogrio.list_layers(args.path)}
    if args.layer not in available:
        parser.error(f"published layer {args.layer} is absent")
    info = pyogrio.read_info(args.path, layer=args.layer, force_feature_count=True, force_total_bounds=True)
    count = int(info["features"])
    missing = empty = invalid = 0
    reasons: dict[str, int] = {}
    for offset in range(0, count, args.chunk_size):
        _, _, encoded, _ = pyogrio.raw.read(args.path, layer=args.layer, columns=[], skip_features=offset,
                                            max_features=min(args.chunk_size, count - offset))
        missing_mask = np.fromiter((value is None for value in encoded), dtype=bool, count=len(encoded))
        missing += int(missing_mask.sum())
        present = encoded[~missing_mask]
        if not len(present):
            continue
        geometries = from_wkb(present)
        empty += int(is_empty(geometries).sum())
        valid = is_valid(geometries)
        invalid += int((~valid).sum())
        for reason in is_valid_reason(geometries[~valid]):
            key = str(reason).partition("[")[0].strip()
            reasons[key] = reasons.get(key, 0) + 1
    print(json.dumps({
        "status": "local-staging-profile",
        "tools": {"pyogrio": pyogrio.__version__, "gdal": pyogrio.__gdal_version_string__},
        "sources": [{"sourceId": args.source_id, "layers": [{
            "name": args.layer,
            "geometryType": str(next(kind for name, kind in pyogrio.list_layers(args.path) if str(name) == args.layer)),
            "featureCount": count,
            "crs": info["crs"],
            "totalBounds": [float(value) for value in info["total_bounds"]],
            "fields": [{"name": str(field), "dtype": str(dtype)} for field, dtype in zip(info["fields"], info["dtypes"])],
            "missingGeometryCount": missing,
            "emptyGeometryCount": empty,
            "invalidGeometryCount": invalid,
            "invalidGeometryReasons": reasons,
        }]}],
    }, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
