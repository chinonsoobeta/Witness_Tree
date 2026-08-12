#!/usr/bin/env python3
"""Create a lossless, locally staged Québec historical-wildfire GeoPackage.

This is deliberately a narrow, reproducible transformation.  It copies the
two published layers and makes no semantic, attribute, coordinate, or geometry
change.  Its adjacent evidence file binds the result to the verified raw
archive and records the validation that was actually performed.
"""

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pyogrio
from shapely import from_wkb, is_empty, is_valid


SOURCE_ID = "qc-historic-wildfire-detailed"
RAW_ARCHIVE_SHA256 = "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815"
ATTRIBUTION = (
    "Source: Ministère des Ressources naturelles et des Forêts du Québec, "
    "Secteur des Forêts, Direction des inventaires forestiers and Direction "
    "de la protection des forêts, Feux de forêt. Licensed under CC BY 4.0."
)
LICENCE_URL = "https://www.donneesquebec.ca/licence/#cc-by"
EXPECTED_LAYERS = ("feux_prov", "meta_feux_prov")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return {"type": "float", "value": "NaN"}
    if isinstance(value, (bytes, bytearray)):
        return {"type": "bytes", "hex": bytes(value).hex()}
    if hasattr(value, "isoformat"):
        return {"type": type(value).__name__, "value": value.isoformat()}
    if isinstance(value, (str, int, float, bool)):
        return value
    return {"type": type(value).__name__, "value": str(value)}


def layer_fingerprint(path: Path, layer: str, feature_count: int, chunk_size: int) -> str:
    """Hash field values and exact WKB in source order without altering them."""
    digest = hashlib.sha256()
    for offset in range(0, feature_count, chunk_size):
        metadata, _, geometries, field_data = pyogrio.raw.read(
            path, layer=layer, skip_features=offset, max_features=min(chunk_size, feature_count - offset)
        )
        fields = [str(name) for name in metadata["fields"]]
        for index, geometry in enumerate(geometries):
            row = {
                "geometryWkbHex": None if geometry is None else bytes(geometry).hex(),
                "attributes": [json_value(values[index]) for values in field_data],
            }
            digest.update(json.dumps([fields, row], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))
            digest.update(b"\n")
    return digest.hexdigest()


def geometry_counts(path: Path, layer: str, feature_count: int, chunk_size: int) -> dict[str, int]:
    missing = empty = invalid = 0
    for offset in range(0, feature_count, chunk_size):
        _, _, encoded, _ = pyogrio.raw.read(
            path, layer=layer, columns=[], skip_features=offset, max_features=min(chunk_size, feature_count - offset)
        )
        missing_mask = np.fromiter((value is None for value in encoded), dtype=bool, count=len(encoded))
        missing += int(missing_mask.sum())
        present = encoded[~missing_mask]
        if len(present):
            geometries = from_wkb(present)
            empty += int(is_empty(geometries).sum())
            invalid += int((~is_valid(geometries)).sum())
    return {"missingGeometryCount": missing, "emptyGeometryCount": empty, "invalidGeometryCount": invalid}


def layer_snapshot(path: Path, layer: str, chunk_size: int) -> dict[str, Any]:
    info = pyogrio.read_info(path, layer=layer, force_feature_count=True)
    count = int(info["features"])
    return {
        "name": layer,
        "featureCount": count,
        "geometryType": str(info["geometry_type"]),
        "crs": info["crs"],
        "fields": [{"name": str(name), "dtype": str(dtype)} for name, dtype in zip(info["fields"], info["dtypes"])],
        "contentSha256": layer_fingerprint(path, layer, count, chunk_size),
        **geometry_counts(path, layer, count, chunk_size),
    }


def assert_expected_input(source: Path) -> None:
    layer_names = tuple(str(name) for name, _ in pyogrio.list_layers(source))
    if layer_names != EXPECTED_LAYERS:
        raise ValueError(f"expected exactly {EXPECTED_LAYERS}; found {layer_names}")


def copy_layer(source: Path, output: Path, layer: str, append: bool) -> None:
    metadata, _, geometries, field_data = pyogrio.raw.read(source, layer=layer)
    info = pyogrio.read_info(source, layer=layer)
    pyogrio.raw.write(
        output,
        geometries,
        field_data,
        metadata["fields"],
        layer=layer,
        driver="GPKG",
        geometry_type=info["geometry_type"],
        crs=info["crs"],
        append=append,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-archive", required=True, type=Path, help="absolute path to verified FEUX_PROV_GPKG.zip")
    parser.add_argument("--source", required=True, type=Path, help="absolute path to extracted FEUX_PROV.gpkg")
    parser.add_argument("--output", required=True, type=Path, help="absolute path for a new derived GeoPackage")
    parser.add_argument("--evidence", required=True, type=Path, help="absolute path for a new JSON evidence file")
    parser.add_argument("--chunk-size", type=int, default=25_000)
    parser.add_argument("--verify-existing", action="store_true", help="validate an existing lossless output and write fresh evidence")
    args = parser.parse_args()
    if args.chunk_size <= 0:
        parser.error("chunk size must be positive")
    for name in ("raw_archive", "source", "output", "evidence"):
        path = getattr(args, name)
        if not path.is_absolute():
            parser.error(f"--{name} must be an absolute path")
    if not args.raw_archive.is_file() or not args.source.is_file():
        parser.error("--raw-archive and --source must be existing files")
    if args.evidence.exists() or (args.output.exists() and not args.verify_existing):
        parser.error("refusing to overwrite an existing output or evidence file")
    if args.verify_existing and not args.output.is_file():
        parser.error("--verify-existing requires an existing output file")
    if args.output == args.source:
        parser.error("--output cannot be the source")
    return args


def main() -> None:
    args = parse_args()
    raw_archive_sha256 = sha256_file(args.raw_archive)
    if raw_archive_sha256 != RAW_ARCHIVE_SHA256:
        raise ValueError("raw archive checksum does not match the verified Québec staging checksum")
    assert_expected_input(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    input_layers = [layer_snapshot(args.source, layer, args.chunk_size) for layer in EXPECTED_LAYERS]
    if not args.verify_existing:
        for layer in EXPECTED_LAYERS:
            copy_layer(args.source, args.output, layer, append=args.output.exists())
    output_layers = [layer_snapshot(args.output, layer, args.chunk_size) for layer in EXPECTED_LAYERS]
    for input_layer, output_layer in zip(input_layers, output_layers):
        for key in ("featureCount", "geometryType", "crs", "fields", "contentSha256"):
            if input_layer[key] != output_layer[key]:
                raise RuntimeError(f"{input_layer['name']} failed lossless validation for {key}")
        if any(output_layer[key] != 0 for key in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")):
            raise RuntimeError(f"{input_layer['name']} has missing, empty, or invalid output geometry")
    evidence = {
        "status": "local-derived-validation",
        "notice": "Lossless local transformation evidence only. This output is not immutable object storage, ingested data, or a production release.",
        "specification": "qc-historic-wildfire-v1",
        "transformedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {
            "sourceId": SOURCE_ID,
            "rawArchivePath": str(args.raw_archive),
            "rawArchiveSha256": raw_archive_sha256,
            "workingGeoPackageSha256": sha256_file(args.source),
            "attribution": ATTRIBUTION,
            "licenceUrl": LICENCE_URL,
        },
        "transformation": {
            "operation": "lossless-layer-copy" if not args.verify_existing else "lossless-layer-copy-verified",
            "fieldNormalizations": [],
            "geometryOperation": "none",
            "semanticChanges": [],
        },
        "tools": {"python": sys.version.split()[0], "pyogrio": pyogrio.__version__, "gdal": pyogrio.__gdal_version_string__},
        "output": {
            "path": str(args.output),
            "byteLength": args.output.stat().st_size,
            "sha256": sha256_file(args.output),
            "layers": output_layers,
        },
        "inputLayers": input_layers,
        "immutableObjectStorage": False,
        "ingested": False,
        "productionEligible": False,
    }
    args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"output": evidence["output"], "evidence": str(args.evidence)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
