#!/usr/bin/env python3
"""Derive MRNF coverage from published PEE_MAJ_PROV polygons, not an index."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

EXPECTED_BYTES = 12_399_475_076
SOURCE_LAYER = "PEE_MAJ_PROV"
SOURCE_URL = "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Cartes_ecoforestieres_perturbations/02-Donnees/PROV/CARTE_ECO_MAJ_PROV_GPKG.zip"
CATALOGUE_URL = "https://www.donneesquebec.ca/recherche/dataset/carte-ecoforestiere-avec-perturbations"
LICENCE_URL = "https://www.donneesquebec.ca/licence/#cc-by"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--source-profile", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    archive, source_profile, output, evidence = args.archive.resolve(), args.source_profile.resolve(), args.output.resolve(), args.evidence.resolve()
    if not archive.is_file():
        raise SystemExit(f"Archive does not exist: {archive}")
    if archive.stat().st_size != EXPECTED_BYTES:
        raise SystemExit(f"Archive byte length does not match official HTTP length: {archive.stat().st_size}")
    if not source_profile.is_file():
        raise SystemExit(f"Source profile does not exist: {source_profile}")
    if output.exists() or evidence.exists():
        raise SystemExit("Refusing to overwrite an existing derivative or evidence record.")

    raw_sha256 = sha256(archive)
    profile_sha256 = sha256(source_profile)
    source_profile_document = json.loads(source_profile.read_text(encoding="utf-8"))
    profiled_layers = [
        layer for source in source_profile_document.get("sources", [])
        for layer in source.get("layers", []) if layer.get("name") == SOURCE_LAYER
    ]
    if len(profiled_layers) != 1:
        raise SystemExit(f"Source profile must contain exactly one {SOURCE_LAYER} layer")
    source_layer_profile = profiled_layers[0]
    if source_layer_profile.get("invalidGeometryCount") != 0:
        raise SystemExit(f"Published {SOURCE_LAYER} geometry profile is not valid")
    verified_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    with zipfile.ZipFile(archive) as source_zip:
        bad_member = source_zip.testzip()
        if bad_member:
            raise SystemExit(f"ZIP integrity failed at {bad_member}")
        gpkg_members = [member for member in source_zip.namelist() if member.lower().endswith(".gpkg")]
        if len(gpkg_members) != 1:
            raise SystemExit(f"Expected exactly one GeoPackage member, found {gpkg_members}")
        gpkg_member = gpkg_members[0]
        with tempfile.TemporaryDirectory(prefix="witness-tree-qc-coverage-") as temporary:
            source_zip.extract(gpkg_member, temporary)
            source_gpkg = Path(temporary) / gpkg_member
            connection = sqlite3.connect(source_gpkg)
            try:
                feature_table = connection.execute(
                    "SELECT table_name FROM gpkg_contents WHERE table_name = ? AND data_type = 'features'", (SOURCE_LAYER,)
                ).fetchone()
                geometry_column = connection.execute(
                    "SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?", (SOURCE_LAYER,)
                ).fetchone()
            finally:
                connection.close()
            if feature_table is None or geometry_column is None:
                raise SystemExit(f"Required published layer {SOURCE_LAYER} is absent")
            geometry_name = geometry_column[0]
            if not geometry_name.replace("_", "").isalnum():
                raise SystemExit(f"Unsafe GeoPackage geometry-column name: {geometry_name}")
            output.parent.mkdir(parents=True, exist_ok=True)
            run("ogr2ogr", "-f", "GPKG", str(output), str(source_gpkg), "-dialect", "SQLite", "-sql",
                f"SELECT ST_Union(\"{geometry_name}\") AS geometry FROM {SOURCE_LAYER}", "-nln", "qc_current_ecoforest_coverage", "-nlt", "MULTIPOLYGON")

    output_sha256 = sha256(output)
    profile = subprocess.check_output(["ogrinfo", "-ro", "-so", "-json", str(output), "qc_current_ecoforest_coverage"], text=True)
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps({
        "schemaVersion": "1.0",
        "kind": "deterministic-coverage-derivative",
        "derivedAt": verified_at,
        "rawSource": {"path": str(archive), "byteLength": archive.stat().st_size, "sha256": raw_sha256,
                      "zipIntegrity": "passed", "member": gpkg_member, "publishedLayer": SOURCE_LAYER,
                      "publishedGeometryColumn": geometry_name, "sourceUrl": SOURCE_URL,
                      "catalogueUrl": CATALOGUE_URL, "publisher": "Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers",
                      "licence": {"id": "cc-by-4.0", "url": LICENCE_URL},
                      "attribution": "Source : Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers. Sous licence CC BY 4.0.",
                      "verifiedAt": verified_at,
                      "profile": {"path": str(source_profile), "sha256": profile_sha256, "peeMajProv": source_layer_profile}},
        "derivative": {"path": str(output), "byteLength": output.stat().st_size, "sha256": output_sha256,
                       "layer": "qc_current_ecoforest_coverage",
                       "method": "GDAL SQLite ST_Union over every published PEE_MAJ_PROV polygon; no latitude clipping, tile-index geometry, repair, filtering, or attribute mapping.",
                       "ogrProfile": json.loads(profile)},
        "software": {"python": sys.version.split()[0], "ogr2ogr": subprocess.check_output(["ogr2ogr", "--version"], text=True).strip()},
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Derived coverage SHA-256: {output_sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
