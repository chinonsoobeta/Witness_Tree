#!/usr/bin/env python3
"""Apply the deterministic Alberta AVI repair-or-quarantine rule and record the result.

The rule is evaluated over every feature of the verified Alberta File Geodatabase
working copy.  It reads the source only; it never writes, moves, or deletes source
geometry, and it never drops a feature silently.  Each feature ends in exactly one
of three recorded classes, and the three classes sum to the input feature count:

  unchanged   the source geometry is already valid
  repaired    the source geometry was invalid, and the structured repair produced a
              valid polygonal geometry whose area moved by no more than
              AREA_RELATIVE_TOLERANCE
  quarantined every other case, recorded with its source FID and an exact reason

Repairs are computed in memory so the rule can be counted and validated.  This
script deliberately writes no derived geometry: the Alberta source is still blocked
from transformation and ingestion, so producing a derived dataset here would
overstate its status.  The only artifacts written are the quarantine record and the
run record.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pyogrio
import shapely
from shapely import area, from_wkb, get_type_id, is_empty, is_valid, is_valid_reason, make_valid


SOURCE_ID = "alberta-avi-crown"
SPECIFICATION = "alberta-avi-geometry-repair-v1"
RAW_ARCHIVE_SHA256 = "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093"

# The Information Provider publishes no dataset-specific attribution statement, so the
# Open Government Licence - Alberta version 2.2 default statement applies verbatim.
ATTRIBUTION = "Contains information licensed under the Open Government Licence – Alberta."
LICENCE_URL = "https://open.alberta.ca/licence"
CHANGES_NOTICE = (
    "Witness Tree changed no source geometry. Repairs were computed in memory only, and "
    "every feature was recorded as unchanged, repaired, or quarantined."
)

EXPECTED_LAYERS = ("AVI_Crown", "AVI_PostInventoryHarvest", "AVI_CrownIndex", "AVI_PostInventoryHarvestIndex")

# Polygon and MultiPolygon type ids in the shapely/GEOS numeric type table.
POLYGONAL_TYPE_IDS = frozenset({3, 6})

# A structured repair may only remove degenerate self-touching area. A relative area
# move larger than this is treated as a semantic change and is quarantined instead.
AREA_RELATIVE_TOLERANCE = 1e-6


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_directory(path: Path) -> str:
    """Deterministic digest over a File Geodatabase directory.

    Files are visited in sorted relative-path order, and each contributes its path,
    byte length, and bytes, so the digest is stable across runs and machines.
    """
    digest = hashlib.sha256()
    for entry in sorted(p for p in path.rglob("*") if p.is_file()):
        relative = entry.relative_to(path).as_posix()
        digest.update(f"{relative}\0{entry.stat().st_size}\0".encode("utf-8"))
        with entry.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    return digest.hexdigest()


def classify(geometry: Any) -> tuple[str, str | None, dict[str, float] | None]:
    """Return (class, reason, measurements) for one invalid source geometry."""
    reason = str(is_valid_reason(geometry)).partition("[")[0].strip()
    repaired = make_valid(geometry, method="structure", keep_collapsed=False)
    if repaired is None:
        return "quarantined", f"{reason}; structured repair returned no geometry", None
    if bool(is_empty(repaired)):
        return "quarantined", f"{reason}; structured repair collapsed to an empty geometry", None
    if not bool(is_valid(repaired)):
        return "quarantined", f"{reason}; structured repair remained invalid", None
    if int(get_type_id(repaired)) not in POLYGONAL_TYPE_IDS:
        return "quarantined", f"{reason}; structured repair changed the geometry to a non-polygonal type", None
    source_area = float(area(geometry))
    repaired_area = float(area(repaired))
    if source_area <= 0.0:
        return "quarantined", f"{reason}; source area is not positive, so the repair cannot be bounded", None
    relative = abs(repaired_area - source_area) / source_area
    measurements = {"sourceArea": source_area, "repairedArea": repaired_area, "relativeAreaChange": relative}
    if relative > AREA_RELATIVE_TOLERANCE:
        return "quarantined", f"{reason}; structured repair moved area by {relative:.3e}, above the {AREA_RELATIVE_TOLERANCE:.0e} tolerance", measurements
    return "repaired", reason, measurements


def evaluate_layer(source: Path, layer: str, chunk_size: int) -> dict[str, Any]:
    info = pyogrio.read_info(source, layer=layer, force_feature_count=True)
    feature_count = int(info["features"])
    unchanged = repaired = quarantined = 0
    missing = empty = invalid = 0
    repaired_reasons: dict[str, int] = {}
    quarantine_entries: list[dict[str, Any]] = []
    max_relative_area_change = 0.0
    for offset in range(0, feature_count, chunk_size):
        _, fids, encoded, _ = pyogrio.raw.read(
            source,
            layer=layer,
            columns=[],
            read_geometry=True,
            return_fids=True,
            skip_features=offset,
            max_features=min(chunk_size, feature_count - offset),
        )
        for index, payload in enumerate(encoded):
            fid = int(fids[index])
            if payload is None:
                missing += 1
                quarantined += 1
                quarantine_entries.append({"layer": layer, "fid": fid, "reason": "Missing geometry"})
                continue
            geometry = from_wkb(payload)
            if bool(is_empty(geometry)):
                empty += 1
                quarantined += 1
                quarantine_entries.append({"layer": layer, "fid": fid, "reason": "Empty geometry"})
                continue
            if bool(is_valid(geometry)):
                unchanged += 1
                continue
            invalid += 1
            outcome, reason, measurements = classify(geometry)
            if outcome == "repaired":
                repaired += 1
                repaired_reasons[reason] = repaired_reasons.get(reason, 0) + 1
                if measurements:
                    max_relative_area_change = max(max_relative_area_change, measurements["relativeAreaChange"])
            else:
                quarantined += 1
                entry = {"layer": layer, "fid": fid, "reason": reason}
                if measurements:
                    entry["measurements"] = measurements
                quarantine_entries.append(entry)
    if unchanged + repaired + quarantined != feature_count:
        raise RuntimeError(f"{layer} classification counts do not sum to its feature count")
    return {
        "summary": {
            "name": layer,
            "featureCount": feature_count,
            "crs": info["crs"],
            "missingGeometryCount": missing,
            "emptyGeometryCount": empty,
            "invalidGeometryCount": invalid,
            "unchangedCount": unchanged,
            "repairedCount": repaired,
            "quarantinedCount": quarantined,
            "repairedReasons": repaired_reasons,
            "maxRelativeAreaChange": max_relative_area_change,
        },
        "quarantine": quarantine_entries,
    }


def assert_expected_input(source: Path) -> None:
    layer_names = tuple(str(name) for name, _ in pyogrio.list_layers(source))
    if layer_names != EXPECTED_LAYERS:
        raise ValueError(f"expected exactly {EXPECTED_LAYERS}; found {layer_names}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-archive", required=True, type=Path, help="absolute path to the verified AlbertaVegetationInventoryCrown.zip")
    parser.add_argument("--source", required=True, type=Path, help="absolute path to the extracted .gdb directory")
    parser.add_argument("--quarantine", required=True, type=Path, help="absolute path for a new quarantine record")
    parser.add_argument("--run-record", required=True, type=Path, help="absolute path for a new run record")
    parser.add_argument("--chunk-size", type=int, default=25_000)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="absolute project root used only to express the external quarantine path relatively",
    )
    args = parser.parse_args()
    if args.chunk_size <= 0:
        parser.error("chunk size must be positive")
    for name in ("raw_archive", "source", "quarantine", "run_record", "project_root"):
        if not getattr(args, name).is_absolute():
            parser.error(f"--{name.replace('_', '-')} must be an absolute path")
    if not args.raw_archive.is_file():
        parser.error("--raw-archive must be an existing file")
    if not args.source.is_dir():
        parser.error("--source must be the existing extracted .gdb directory")
    if args.quarantine.exists() or args.run_record.exists():
        parser.error("refusing to overwrite an existing quarantine or run record")
    return args


def main() -> None:
    args = parse_args()
    raw_archive_sha256 = sha256_file(args.raw_archive)
    if raw_archive_sha256 != RAW_ARCHIVE_SHA256:
        raise ValueError("raw archive checksum does not match the verified Alberta staging checksum")
    assert_expected_input(args.source)
    args.quarantine.parent.mkdir(parents=True, exist_ok=True)
    args.run_record.parent.mkdir(parents=True, exist_ok=True)

    evaluated = [evaluate_layer(args.source, layer, args.chunk_size) for layer in EXPECTED_LAYERS]
    layers = [item["summary"] for item in evaluated]
    quarantine_entries = [entry for item in evaluated for entry in item["quarantine"]]
    totals = {
        key: sum(int(layer[key]) for layer in layers)
        for key in ("featureCount", "invalidGeometryCount", "unchangedCount", "repairedCount", "quarantinedCount")
    }
    if totals["unchangedCount"] + totals["repairedCount"] + totals["quarantinedCount"] != totals["featureCount"]:
        raise RuntimeError("total classification counts do not sum to the total feature count")
    if len(quarantine_entries) != totals["quarantinedCount"]:
        raise RuntimeError("quarantine record length does not match the quarantined count")

    tools = {
        "python": sys.version.split()[0],
        "pyogrio": pyogrio.__version__,
        "gdal": pyogrio.__gdal_version_string__,
        "shapely": shapely.__version__,
        "geos": shapely.geos_version_string,
        "numpy": np.__version__,
    }
    quarantine_document = {
        "status": "local-geometry-quarantine",
        "notice": "Quarantined source features only. No source geometry was changed, and no feature was dropped.",
        "specification": SPECIFICATION,
        "sourceId": SOURCE_ID,
        "rawArchiveSha256": raw_archive_sha256,
        "rule": {
            "repairFunction": "shapely.make_valid(method='structure', keep_collapsed=False)",
            "areaRelativeTolerance": AREA_RELATIVE_TOLERANCE,
            "polygonalTypeIds": sorted(POLYGONAL_TYPE_IDS),
        },
        "tools": tools,
        "quarantinedCount": totals["quarantinedCount"],
        "entries": quarantine_entries,
    }
    args.quarantine.write_text(json.dumps(quarantine_document, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    run_record = {
        "status": "local-geometry-policy-run",
        "notice": "Deterministic repair-or-quarantine evaluation only. No source geometry was changed, no derived geometry was written, and the source remains outside immutable object storage, ingestion, and production.",
        "specification": SPECIFICATION,
        "transformedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourceId": SOURCE_ID,
        "rawArchiveSha256": raw_archive_sha256,
        "workingDatasetSha256": sha256_directory(args.source),
        "output": {
            "externalPath": os.path.relpath(args.quarantine, args.project_root),
            "byteLength": args.quarantine.stat().st_size,
            "sha256": sha256_file(args.quarantine),
        },
        "rule": quarantine_document["rule"],
        "totals": totals,
        "layers": layers,
        "attribution": ATTRIBUTION,
        "licenceUrl": LICENCE_URL,
        "changesNotice": CHANGES_NOTICE,
        "tools": tools,
        "immutableObjectStorage": False,
        "ingested": False,
        "productionEligible": False,
    }
    args.run_record.write_text(json.dumps(run_record, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"totals": totals, "layers": layers, "quarantine": str(args.quarantine), "runRecord": str(args.run_record)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
