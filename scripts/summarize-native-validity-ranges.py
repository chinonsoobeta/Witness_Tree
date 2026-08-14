#!/usr/bin/env python3
"""Bind exhaustive, bounded GDAL validity-query output into one evidence record."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path


VALUE = re.compile(r"^  (fid_first|fid_last|feature_count|missing_count|empty_count|invalid_count) \(Integer\) = (\d+)$")
FIELDS = ("fid_first", "fid_last", "feature_count", "missing_count", "empty_count", "invalid_count")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-feature-count", required=True, type=int)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Refusing to overwrite existing summary")
    values: dict[str, int] = {}
    ranges: list[dict[str, int]] = []
    for line in args.input.read_text(encoding="utf-8").splitlines():
        match = VALUE.match(line)
        if not match:
            continue
        values[match.group(1)] = int(match.group(2))
        if len(values) == len(FIELDS):
            ranges.append(values)
            values = {}
    if values or not ranges:
        raise SystemExit("Input does not contain complete GDAL range results")
    expected_first = 1
    totals = {name: 0 for name in ("feature_count", "missing_count", "empty_count", "invalid_count")}
    for result in ranges:
        if result["fid_first"] != expected_first or result["fid_last"] < result["fid_first"]:
            raise SystemExit("FID ranges are not contiguous and ascending")
        if result["feature_count"] != result["fid_last"] - result["fid_first"] + 1:
            raise SystemExit("A GDAL range result does not contain every requested FID")
        expected_first = result["fid_last"] + 1
        for name in totals:
            totals[name] += result[name]
    if expected_first != args.expected_feature_count + 1 or totals["feature_count"] != args.expected_feature_count:
        raise SystemExit("GDAL range results do not cover the expected feature count exactly")
    result = {
        "schemaVersion": "1.0",
        "kind": "exhaustive-native-validity-scan",
        "verifiedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "input": {"path": str(args.input.resolve()), "sha256": sha256(args.input), "rangeCount": len(ranges)},
        "method": "GDAL ogrinfo SQLite ST_IsValid/ST_IsEmpty over contiguous, non-overlapping published GeoPackage FID ranges",
        "expectedFeatureCount": args.expected_feature_count,
        "featureCount": totals["feature_count"],
        "missingGeometryCount": totals["missing_count"],
        "emptyGeometryCount": totals["empty_count"],
        "invalidGeometryCount": totals["invalid_count"],
        "ranges": ranges,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
