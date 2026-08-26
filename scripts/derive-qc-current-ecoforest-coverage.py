#!/usr/bin/env python3
"""Derive the MRNF footprint by resumably unioning every published stand."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
import zlib
from datetime import UTC, datetime
from pathlib import Path

EXPECTED_BYTES = 12_399_475_076
SOURCE_LAYER = "PEE_MAJ_PROV"
SOURCE_URL = "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Cartes_ecoforestieres_perturbations/02-Donnees/PROV/CARTE_ECO_MAJ_PROV_GPKG.zip"
CATALOGUE_URL = "https://www.donneesquebec.ca/recherche/dataset/carte-ecoforestiere-avec-perturbations"
LICENCE_URL = "https://www.donneesquebec.ca/licence/#cc-by"


def hash_and_crc32(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    checksum = 0
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
            checksum = zlib.crc32(block, checksum)
    return digest.hexdigest(), checksum & 0xFFFFFFFF


def sha256(path: Path) -> str:
    return hash_and_crc32(path)[0]


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def union_files(sources: list[tuple[Path, str]], output: Path, output_layer: str, temporary_parent: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="qc-coverage-union-", dir=temporary_parent) as temporary:
        collection = Path(temporary) / "inputs.gpkg"
        for index, (source, source_layer) in enumerate(sources):
            if index == 0:
                run("ogr2ogr", "-f", "GPKG", str(collection), str(source), source_layer,
                    "-explodecollections", "-nlt", "POLYGON", "-nln", "union_inputs")
            else:
                run("ogr2ogr", "-update", "-append", str(collection), str(source), source_layer,
                    "-explodecollections", "-nlt", "POLYGON", "-nln", "union_inputs")
        connection = sqlite3.connect(collection)
        try:
            geometry = connection.execute(
                "SELECT column_name FROM gpkg_geometry_columns WHERE table_name = 'union_inputs'"
            ).fetchone()
        finally:
            connection.close()
        if geometry is None or not geometry[0].replace("_", "").isalnum():
            raise SystemExit("Union-input geometry column is absent or unsafe")
        run("ogr2ogr", "-f", "GPKG", str(output), str(collection), "-dialect", "SQLite", "-sql",
            f'SELECT ST_Union("{geometry[0]}") AS geometry FROM "union_inputs"',
            "-nln", output_layer, "-nlt", "MULTIPOLYGON")


def layer_profile(path: Path, layer: str) -> dict:
    metadata = json.loads(subprocess.check_output(["ogrinfo", "-ro", "-json", "-so", str(path), layer], text=True))
    result = metadata["layers"][0]
    geometry = result["geometryFields"][0]
    query = (
        f'SELECT COUNT(*) AS feature_count, SUM(CASE WHEN "{geometry["name"]}" IS NULL THEN 1 ELSE 0 END) AS missing_count, '
        f'SUM(CASE WHEN ST_IsEmpty("{geometry["name"]}") THEN 1 ELSE 0 END) AS empty_count, '
        f'SUM(CASE WHEN ST_IsValid("{geometry["name"]}") = 0 THEN 1 ELSE 0 END) AS invalid_count FROM "{layer}"'
    )
    validity = json.loads(subprocess.check_output(
        ["ogrinfo", "-ro", "-json", "-features", "-dialect", "SQLite", "-sql", query, str(path)], text=True
    ))["layers"][0]["features"][0]["properties"]
    return {
        "layer": layer,
        "geometryColumn": geometry["name"],
        "geometryType": geometry["type"],
        "featureCount": int(validity["feature_count"]),
        "extent": geometry["extent"],
        "crs": geometry.get("coordinateSystem", {}).get("projjson", {}).get("id"),
        "missingGeometryCount": int(validity["missing_count"] or 0),
        "emptyGeometryCount": int(validity["empty_count"] or 0),
        "invalidGeometryCount": int(validity["invalid_count"] or 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--source-gpkg", required=True, type=Path)
    parser.add_argument("--source-profile", required=True, type=Path)
    parser.add_argument("--work-directory", required=True, type=Path)
    parser.add_argument("--partition-size", type=int, default=100_000)
    parser.add_argument("--final-group-size", type=int, default=10)
    parser.add_argument("--penultimate-group-size", type=int, default=6)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    archive = args.archive.resolve()
    source_gpkg = args.source_gpkg.resolve()
    source_profile = args.source_profile.resolve()
    work_directory = args.work_directory.resolve()
    output = args.output.resolve()
    evidence = args.evidence.resolve()
    if args.partition_size <= 0 or args.final_group_size <= 1 or args.penultimate_group_size <= 1:
        raise SystemExit("partition-size must be positive and union group sizes must exceed one")
    for required in (archive, source_gpkg, source_profile):
        if not required.is_file():
            raise SystemExit(f"Required input does not exist: {required}")
    if archive.stat().st_size != EXPECTED_BYTES:
        raise SystemExit("Archive byte length does not match official HTTP length")
    if evidence.exists():
        raise SystemExit("Refusing to overwrite an existing evidence record")

    raw_sha256 = sha256(archive)
    source_sha256, source_crc32 = hash_and_crc32(source_gpkg)
    with zipfile.ZipFile(archive) as source_zip:
        members = [member for member in source_zip.infolist() if member.filename.lower().endswith(".gpkg")]
        if len(members) != 1 or source_zip.testzip() is not None:
            raise SystemExit("Archive must pass integrity and contain exactly one GeoPackage")
        member = members[0]
        if member.file_size != source_gpkg.stat().st_size or member.CRC != source_crc32:
            raise SystemExit("Staged GeoPackage does not match the sole verified archive member")

    source_profile_sha256 = sha256(source_profile)
    source_profile_document = json.loads(source_profile.read_text(encoding="utf-8"))
    profiled_layers = [
        layer for source in source_profile_document.get("sources", []) for layer in source.get("layers", [])
        if str(layer.get("name", "")).lower() == SOURCE_LAYER.lower()
    ]
    if len(profiled_layers) != 1:
        raise SystemExit(f"Source profile must contain exactly one {SOURCE_LAYER} layer")
    source_layer_profile = profiled_layers[0]
    for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount"):
        if source_layer_profile.get(name) != 0:
            raise SystemExit(f"Published layer has non-zero {name}")
    feature_count = int(source_layer_profile["featureCount"])

    connection = sqlite3.connect(source_gpkg)
    try:
        table = connection.execute(
            "SELECT table_name FROM gpkg_contents WHERE lower(table_name) = lower(?) AND data_type = 'features'", (SOURCE_LAYER,)
        ).fetchone()
        if table is None:
            raise SystemExit(f"Required published layer {SOURCE_LAYER} is absent")
        geometry = connection.execute("SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?", (table[0],)).fetchone()
    finally:
        connection.close()
    if geometry is None or not table[0].replace("_", "").isalnum() or not geometry[0].replace("_", "").isalnum():
        raise SystemExit("Published table or geometry column is absent or unsafe")

    work_directory.mkdir(parents=True, exist_ok=True)
    chunks: list[dict] = []
    for index, first in enumerate(range(1, feature_count + 1, args.partition_size), start=1):
        last = min(first + args.partition_size - 1, feature_count)
        chunk = work_directory / f"chunk-{index:04d}.gpkg"
        chunk_record = work_directory / f"chunk-{index:04d}.json"
        expected = {"index": index, "fidFirst": first, "fidLast": last, "sourceFeatureCount": last - first + 1}
        if chunk.exists() or chunk_record.exists():
            if not chunk.is_file() or not chunk_record.is_file():
                raise SystemExit(f"Incomplete existing partition {index}; use a new work directory")
            record = json.loads(chunk_record.read_text(encoding="utf-8"))
            profile = record.get("profile", {})
            invalid_profile = profile.get("featureCount") != 1 or any(
                profile.get(name) != 0 for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
            )
            if (any(record.get(key) != value for key, value in expected.items()) or
                    record.get("sha256") != sha256(chunk) or invalid_profile):
                raise SystemExit(f"Existing partition {index} does not match its evidence")
        else:
            query = (
                f'SELECT {first} AS fid_first, {last} AS fid_last, COUNT(*) AS source_count, '
                f'ST_Union("{geometry[0]}") AS geometry FROM "{table[0]}" WHERE fid BETWEEN {first} AND {last}'
            )
            run("ogr2ogr", "-f", "GPKG", str(chunk), str(source_gpkg), "-dialect", "SQLite", "-sql", query,
                "-nln", "qc_coverage_chunk", "-nlt", "MULTIPOLYGON")
            profile = layer_profile(chunk, "qc_coverage_chunk")
            if profile["featureCount"] != 1 or any(profile[name] for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")):
                raise SystemExit(f"Partition {index} failed its geometry profile")
            record = {**expected, "byteLength": chunk.stat().st_size, "sha256": sha256(chunk), "profile": profile}
            chunk_record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        chunks.append(record)
        print(f"partition {index}/{(feature_count + args.partition_size - 1) // args.partition_size} passed", flush=True)

    grouped_count = len(chunks) - (len(chunks) % args.final_group_size)
    grouped_chunks = [chunks[offset:offset + args.final_group_size] for offset in range(0, grouped_count, args.final_group_size)]
    grouped_chunks.extend([chunk] for chunk in chunks[grouped_count:])
    groups: list[dict] = []
    for group_index, group_chunks in enumerate(grouped_chunks, start=1):
        group_output = work_directory / f"final-group-v2-{group_index:03d}.gpkg"
        group_record = work_directory / f"final-group-v2-{group_index:03d}.json"
        legacy_output = work_directory / f"final-group-{group_index:03d}.gpkg"
        legacy_record = work_directory / f"final-group-{group_index:03d}.json"
        expected_group = {
            "index": group_index,
            "chunkFirst": group_chunks[0]["index"],
            "chunkLast": group_chunks[-1]["index"],
            "sourceFeatureCount": sum(chunk["sourceFeatureCount"] for chunk in group_chunks),
            "inputChecksums": [chunk["sha256"] for chunk in group_chunks],
        }
        if len(group_chunks) == 1:
            chunk = group_chunks[0]
            geometry_path = work_directory / f"chunk-{chunk['index']:04d}.gpkg"
            expected_group.update({
                "passThrough": True,
                "geometryPath": str(geometry_path),
                "geometryLayer": "qc_coverage_chunk",
                "byteLength": geometry_path.stat().st_size,
                "sha256": chunk["sha256"],
                "profile": chunk["profile"],
            })
            if group_record.exists() and json.loads(group_record.read_text(encoding="utf-8")) != expected_group:
                raise SystemExit(f"Existing final tail group {group_index} does not match its evidence")
            if not group_record.exists():
                group_record.write_text(json.dumps(expected_group, indent=2) + "\n", encoding="utf-8")
            record = expected_group
        elif group_output.is_file() and group_record.is_file():
            record = json.loads(group_record.read_text(encoding="utf-8"))
            profile = record.get("profile", {})
            invalid_profile = profile.get("featureCount") != 1 or any(
                profile.get(name) != 0 for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
            )
            if (any(record.get(key) != value for key, value in expected_group.items()) or
                    record.get("sha256") != sha256(group_output) or invalid_profile):
                raise SystemExit(f"Existing final group {group_index} does not match its evidence")
        elif legacy_output.is_file() and legacy_record.is_file():
            legacy = json.loads(legacy_record.read_text(encoding="utf-8"))
            profile = legacy.get("profile", {})
            invalid_profile = profile.get("featureCount") != 1 or any(
                profile.get(name) != 0 for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
            )
            if (any(legacy.get(key) != value for key, value in expected_group.items()) or
                    legacy.get("sha256") != sha256(legacy_output) or invalid_profile):
                raise SystemExit(f"Legacy final group {group_index} does not match its evidence")
            record = {**expected_group, "passThrough": True, "geometryPath": str(legacy_output),
                      "geometryLayer": "qc_coverage_group", "byteLength": legacy_output.stat().st_size,
                      "sha256": legacy["sha256"], "profile": profile}
            group_record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        elif group_output.exists() or group_record.exists():
            raise SystemExit(f"Incomplete existing final group {group_index}")
        else:
            sources = [(work_directory / f"chunk-{chunk['index']:04d}.gpkg", "qc_coverage_chunk") for chunk in group_chunks]
            union_files(sources, group_output, "qc_coverage_group", work_directory)
            profile = layer_profile(group_output, "qc_coverage_group")
            if profile["featureCount"] != 1 or any(profile[name] for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")):
                raise SystemExit(f"Final group {group_index} failed its geometry profile")
            record = {**expected_group, "passThrough": False, "geometryPath": str(group_output),
                      "geometryLayer": "qc_coverage_group", "byteLength": group_output.stat().st_size,
                      "sha256": sha256(group_output), "profile": profile}
            group_record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        groups.append(record)
        print(f"final group {group_index}/{len(grouped_chunks)} passed", flush=True)

    penultimate_groups: list[dict] = []
    for group_index, offset in enumerate(range(0, len(groups), args.penultimate_group_size), start=1):
        inputs = groups[offset:offset + args.penultimate_group_size]
        group_output = work_directory / f"penultimate-group-{group_index:03d}.gpkg"
        group_record = work_directory / f"penultimate-group-{group_index:03d}.json"
        expected = {"index": group_index, "inputFirst": inputs[0]["index"], "inputLast": inputs[-1]["index"],
                    "inputChecksums": [item["sha256"] for item in inputs],
                    "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in inputs)}
        if group_output.is_file() and group_record.is_file():
            record = json.loads(group_record.read_text(encoding="utf-8"))
            profile = record.get("profile", {})
            invalid_profile = profile.get("featureCount") != 1 or any(
                profile.get(name) != 0 for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
            )
            if (any(record.get(key) != value for key, value in expected.items()) or
                    record.get("sha256") != sha256(group_output) or invalid_profile):
                raise SystemExit(f"Existing penultimate group {group_index} does not match its evidence")
        elif group_output.is_file() and not group_record.exists():
            subgroup_records = []
            for subgroup_index, subgroup_offset in enumerate(range(0, len(inputs), 2), start=1):
                subgroup_inputs = inputs[subgroup_offset:subgroup_offset + 2]
                subgroup_output = work_directory / f"penultimate-group-{group_index:03d}-binary-{subgroup_index:02d}.gpkg"
                subgroup_record = work_directory / f"penultimate-group-{group_index:03d}-binary-{subgroup_index:02d}.json"
                if not subgroup_output.is_file() or not subgroup_record.is_file():
                    raise SystemExit(f"Unrecorded penultimate group {group_index} lacks binary lineage")
                subgroup = json.loads(subgroup_record.read_text(encoding="utf-8"))
                subgroup_expected = {
                    "index": subgroup_index,
                    "inputChecksums": [item["sha256"] for item in subgroup_inputs],
                    "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in subgroup_inputs),
                }
                subgroup_profile = subgroup.get("profile", {})
                if (any(subgroup.get(key) != value for key, value in subgroup_expected.items()) or
                        subgroup.get("sha256") != sha256(subgroup_output) or
                        subgroup_profile.get("featureCount") != 1 or any(
                            subgroup_profile.get(name) != 0
                            for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                        )):
                    raise SystemExit(f"Binary lineage {group_index}.{subgroup_index} does not match its evidence")
                subgroup_records.append(subgroup)
            binary_merges = []
            if len(subgroup_records) > 2:
                merge_inputs = subgroup_records[:2]
                merge_output = work_directory / f"penultimate-group-{group_index:03d}-binary-merge-01.gpkg"
                merge_record = work_directory / f"penultimate-group-{group_index:03d}-binary-merge-01.json"
                if not merge_output.is_file() or not merge_record.is_file():
                    raise SystemExit(f"Unrecorded penultimate group {group_index} lacks binary-merge lineage")
                merge = json.loads(merge_record.read_text(encoding="utf-8"))
                merge_expected = {
                    "index": 1,
                    "inputChecksums": [item["sha256"] for item in merge_inputs],
                    "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in merge_inputs),
                }
                merge_profile = merge.get("profile", {})
                if (any(merge.get(key) != value for key, value in merge_expected.items()) or
                        merge.get("sha256") != sha256(merge_output) or
                        merge_profile.get("featureCount") != 1 or any(
                            merge_profile.get(name) != 0
                            for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                        )):
                    raise SystemExit(f"Binary-merge lineage {group_index}.1 does not match its evidence")
                binary_merges.append(merge)
            profile = layer_profile(group_output, "qc_coverage_penultimate")
            if profile["featureCount"] != 1 or any(
                profile[name] for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
            ):
                raise SystemExit(f"Unrecorded penultimate group {group_index} failed its geometry profile")
            record = {**expected, "binarySubgroups": subgroup_records, "binaryMerges": binary_merges,
                      "geometryPath": str(group_output), "geometryLayer": "qc_coverage_penultimate",
                      "byteLength": group_output.stat().st_size, "sha256": sha256(group_output), "profile": profile}
            group_record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        elif group_output.exists() or group_record.exists():
            raise SystemExit(f"Incomplete existing penultimate group {group_index}")
        else:
            subgroup_records: list[dict] = []
            for subgroup_index, subgroup_offset in enumerate(range(0, len(inputs), 2), start=1):
                subgroup_inputs = inputs[subgroup_offset:subgroup_offset + 2]
                subgroup_output = work_directory / f"penultimate-group-{group_index:03d}-binary-{subgroup_index:02d}.gpkg"
                subgroup_record = work_directory / f"penultimate-group-{group_index:03d}-binary-{subgroup_index:02d}.json"
                subgroup_expected = {
                    "index": subgroup_index,
                    "inputChecksums": [item["sha256"] for item in subgroup_inputs],
                    "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in subgroup_inputs),
                }
                if subgroup_output.is_file() and subgroup_record.is_file():
                    subgroup = json.loads(subgroup_record.read_text(encoding="utf-8"))
                    subgroup_profile = subgroup.get("profile", {})
                    invalid_subgroup = subgroup_profile.get("featureCount") != 1 or any(
                        subgroup_profile.get(name) != 0
                        for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                    )
                    if (any(subgroup.get(key) != value for key, value in subgroup_expected.items()) or
                            subgroup.get("sha256") != sha256(subgroup_output) or invalid_subgroup):
                        raise SystemExit(f"Existing binary subgroup {group_index}.{subgroup_index} does not match its evidence")
                elif subgroup_output.is_file() and not subgroup_record.exists():
                    subgroup_profile = layer_profile(subgroup_output, "qc_coverage_binary")
                    if subgroup_profile["featureCount"] != 1 or any(
                        subgroup_profile[name]
                        for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                    ):
                        raise SystemExit(f"Unrecorded binary subgroup {group_index}.{subgroup_index} failed its geometry profile")
                    subgroup = {
                        **subgroup_expected,
                        "geometryPath": str(subgroup_output),
                        "geometryLayer": "qc_coverage_binary",
                        "byteLength": subgroup_output.stat().st_size,
                        "sha256": sha256(subgroup_output),
                        "profile": subgroup_profile,
                    }
                    subgroup_record.write_text(json.dumps(subgroup, indent=2) + "\n", encoding="utf-8")
                elif subgroup_output.exists() or subgroup_record.exists():
                    raise SystemExit(f"Incomplete existing binary subgroup {group_index}.{subgroup_index}")
                else:
                    union_files([(Path(item["geometryPath"]), item["geometryLayer"]) for item in subgroup_inputs],
                                subgroup_output, "qc_coverage_binary", work_directory)
                    subgroup_profile = layer_profile(subgroup_output, "qc_coverage_binary")
                    if subgroup_profile["featureCount"] != 1 or any(
                        subgroup_profile[name]
                        for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                    ):
                        raise SystemExit(f"Binary subgroup {group_index}.{subgroup_index} failed its geometry profile")
                    subgroup = {
                        **subgroup_expected,
                        "geometryPath": str(subgroup_output),
                        "geometryLayer": "qc_coverage_binary",
                        "byteLength": subgroup_output.stat().st_size,
                        "sha256": sha256(subgroup_output),
                        "profile": subgroup_profile,
                    }
                    subgroup_record.write_text(json.dumps(subgroup, indent=2) + "\n", encoding="utf-8")
                subgroup_records.append(subgroup)
                print(f"binary subgroup {group_index}.{subgroup_index} passed", flush=True)
            penultimate_inputs = subgroup_records
            binary_merges: list[dict] = []
            if len(subgroup_records) > 2:
                merge_inputs = subgroup_records[:2]
                merge_output = work_directory / f"penultimate-group-{group_index:03d}-binary-merge-01.gpkg"
                merge_record = work_directory / f"penultimate-group-{group_index:03d}-binary-merge-01.json"
                merge_expected = {
                    "index": 1,
                    "inputChecksums": [item["sha256"] for item in merge_inputs],
                    "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in merge_inputs),
                }
                if merge_output.is_file() and merge_record.is_file():
                    merge = json.loads(merge_record.read_text(encoding="utf-8"))
                    merge_profile = merge.get("profile", {})
                    invalid_merge = merge_profile.get("featureCount") != 1 or any(
                        merge_profile.get(name) != 0
                        for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                    )
                    if (any(merge.get(key) != value for key, value in merge_expected.items()) or
                            merge.get("sha256") != sha256(merge_output) or invalid_merge):
                        raise SystemExit(f"Existing binary merge {group_index}.1 does not match its evidence")
                elif merge_output.exists() or merge_record.exists():
                    raise SystemExit(f"Incomplete existing binary merge {group_index}.1")
                else:
                    union_files([(Path(item["geometryPath"]), item["geometryLayer"]) for item in merge_inputs],
                                merge_output, "qc_coverage_binary_merge", work_directory)
                    merge_profile = layer_profile(merge_output, "qc_coverage_binary_merge")
                    if merge_profile["featureCount"] != 1 or any(
                        merge_profile[name]
                        for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                    ):
                        raise SystemExit(f"Binary merge {group_index}.1 failed its geometry profile")
                    merge = {
                        **merge_expected,
                        "geometryPath": str(merge_output),
                        "geometryLayer": "qc_coverage_binary_merge",
                        "byteLength": merge_output.stat().st_size,
                        "sha256": sha256(merge_output),
                        "profile": merge_profile,
                    }
                    merge_record.write_text(json.dumps(merge, indent=2) + "\n", encoding="utf-8")
                binary_merges.append(merge)
                penultimate_inputs = [merge, *subgroup_records[2:]]
                print(f"binary merge {group_index}.1 passed", flush=True)
            union_files([(Path(item["geometryPath"]), item["geometryLayer"]) for item in penultimate_inputs],
                        group_output, "qc_coverage_penultimate", work_directory)
            profile = layer_profile(group_output, "qc_coverage_penultimate")
            if profile["featureCount"] != 1 or any(profile[name] for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")):
                raise SystemExit(f"Penultimate group {group_index} failed its geometry profile")
            record = {**expected, "binarySubgroups": subgroup_records, "binaryMerges": binary_merges,
                      "geometryPath": str(group_output), "geometryLayer": "qc_coverage_penultimate",
                      "byteLength": group_output.stat().st_size, "sha256": sha256(group_output), "profile": profile}
            group_record.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        penultimate_groups.append(record)
        print(f"penultimate group {group_index}/{(len(groups) + args.penultimate_group_size - 1) // args.penultimate_group_size} passed", flush=True)

    province_merge_output = work_directory / "province-binary-merge-001.gpkg"
    province_merge_record = work_directory / "province-binary-merge-001.json"
    province_merge_inputs = penultimate_groups[:2]
    province_merge_expected = {
        "index": 1,
        "inputChecksums": [item["sha256"] for item in province_merge_inputs],
        "sourceFeatureCount": sum(item["sourceFeatureCount"] for item in province_merge_inputs),
    }
    if province_merge_output.is_file() and province_merge_record.is_file():
        province_merge = json.loads(province_merge_record.read_text(encoding="utf-8"))
        province_merge_profile = province_merge.get("profile", {})
        if (any(province_merge.get(key) != value for key, value in province_merge_expected.items()) or
                province_merge.get("sha256") != sha256(province_merge_output) or
                province_merge_profile.get("featureCount") != 1 or any(
                    province_merge_profile.get(name) != 0
                    for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
                )):
            raise SystemExit("Existing province binary merge does not match its evidence")
    elif province_merge_output.exists() or province_merge_record.exists():
        raise SystemExit("Incomplete existing province binary merge")
    else:
        union_files([(Path(item["geometryPath"]), item["geometryLayer"]) for item in province_merge_inputs],
                    province_merge_output, "qc_coverage_province_binary", work_directory)
        province_merge_profile = layer_profile(province_merge_output, "qc_coverage_province_binary")
        if province_merge_profile["featureCount"] != 1 or any(
            province_merge_profile[name]
            for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
        ):
            raise SystemExit("Province binary merge failed its geometry profile")
        province_merge = {
            **province_merge_expected,
            "geometryPath": str(province_merge_output),
            "geometryLayer": "qc_coverage_province_binary",
            "byteLength": province_merge_output.stat().st_size,
            "sha256": sha256(province_merge_output),
            "profile": province_merge_profile,
        }
        province_merge_record.write_text(json.dumps(province_merge, indent=2) + "\n", encoding="utf-8")
    print("province binary merge 1/1 passed", flush=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.exists():
        union_files(
            [(Path(province_merge["geometryPath"]), province_merge["geometryLayer"]),
             (Path(penultimate_groups[2]["geometryPath"]), penultimate_groups[2]["geometryLayer"])],
            output, "qc_current_ecoforest_coverage", work_directory,
        )

    derivative_profile = layer_profile(output, "qc_current_ecoforest_coverage")
    if derivative_profile["featureCount"] != 1 or any(
        derivative_profile[name] for name in ("missingGeometryCount", "emptyGeometryCount", "invalidGeometryCount")
    ):
        raise SystemExit("Final derivative failed its geometry profile")
    output_sha256 = sha256(output)
    verified_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps({
        "schemaVersion": "1.0", "kind": "deterministic-coverage-derivative", "derivedAt": verified_at,
        "rawSource": {"path": str(archive), "byteLength": archive.stat().st_size, "sha256": raw_sha256,
                      "zipIntegrity": "passed", "member": member.filename, "memberCrc32": f"{member.CRC:08x}",
                      "stagedGeoPackage": {"path": str(source_gpkg), "byteLength": source_gpkg.stat().st_size, "sha256": source_sha256},
                      "publishedLayer": table[0], "publishedGeometryColumn": geometry[0], "sourceUrl": SOURCE_URL,
                      "catalogueUrl": CATALOGUE_URL, "publisher": "Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers",
                      "licence": {"id": "cc-by-4.0", "url": LICENCE_URL},
                      "attribution": "Source : Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers. Sous licence CC BY 4.0.",
                      "profile": {"path": str(source_profile), "sha256": source_profile_sha256, "peeMajProv": source_layer_profile}},
        "partitions": {"size": args.partition_size, "count": len(chunks), "records": chunks,
                       "finalGroupSize": args.final_group_size, "finalGroupCount": len(groups), "finalGroups": groups,
                       "penultimateGroupSize": args.penultimate_group_size,
                       "penultimateGroupCount": len(penultimate_groups), "penultimateGroups": penultimate_groups,
                       "provinceBinaryMerge": province_merge},
        "derivative": {"path": str(output), "byteLength": output.stat().st_size, "sha256": output_sha256,
                       "method": "Fixed ascending contiguous FID partitions; ST_Union within each partition; ST_Union within complete fixed ascending groups; an incomplete tail remains as individually validated partition results; missing penultimate results are constructed through fixed ascending binary subgroups and merges. At every multi-file stage, MultiPolygon inputs are losslessly exploded to polygon parts before cascaded ST_Union; the final stage unions the penultimate results. No clipping, filtering, repair, simplification, or attribute mapping.",
                       "profile": derivative_profile},
        "software": {"python": sys.version.split()[0], "gdal": subprocess.check_output(["ogr2ogr", "--version"], text=True).strip()},
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Derived coverage SHA-256: {output_sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
