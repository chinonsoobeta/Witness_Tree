#!/usr/bin/env python3
"""Append checksum-bound stand-copy lineage columns to an ogr2ogr artifact.

This helper deliberately does not use GDAL for the copy itself: ogr2ogr has
already copied the source geometry and published fields.  SQLite is used only
to append deterministic lineage values without touching the source GeoPackage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def quote(identifier: str) -> str:
    if not identifier or "\x00" in identifier:
        raise ValueError("unsafe SQLite identifier")
    return '"' + identifier.replace('"', '""') + '"'


def value_bytes(value):
    if value is None:
        return b"N"
    if isinstance(value, bytes):
        return b"B" + len(value).to_bytes(8, "big") + value
    if isinstance(value, int):
        return b"I" + str(value).encode()
    if isinstance(value, float):
        return b"F" + value.hex().encode()
    return b"T" + str(value).encode("utf-8")


def update_digest(digest, values):
    for value in values:
        token = value_bytes(value)
        digest.update(len(token).to_bytes(8, "big"))
        digest.update(token)


def row_digest(connection, table, columns):
    digest = hashlib.sha256()
    sql = f"SELECT {', '.join(quote(c) for c in columns)} FROM {quote(table)} ORDER BY {quote('fid')} ASC"
    count = 0
    for row in connection.execute(sql):
        update_digest(digest, row)
        count += 1
    return count, digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--source-layer", required=True)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--layer", required=True)
    parser.add_argument("--published-attributes", required=True)
    parser.add_argument("--raw-sha256", required=True)
    args = parser.parse_args()

    artifact = args.artifact.resolve()
    published = json.loads(args.published_attributes)
    if not isinstance(published, list) or not published or any(not isinstance(c, str) for c in published):
        raise SystemExit("published attributes must be a non-empty JSON string array")
    if not artifact.is_file() or artifact.is_symlink():
        raise SystemExit("artifact must be a regular file")

    source = args.source.resolve()
    if not source.is_file() or source.is_symlink():
        raise SystemExit("source must be a regular file")
    source_connection = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    connection = sqlite3.connect(artifact)
    try:
        source_info = source_connection.execute(f"PRAGMA table_info({quote(args.source_layer)})").fetchall()
        source_names = [row[1] for row in source_info]
        if source_names[:2] != ["fid", "geom"] or not all(c in source_names for c in published):
            raise SystemExit("source schema drifted before copy")
        source_count, source_fingerprint = row_digest(source_connection, args.source_layer, ["fid", "geom", *published])
        table_info = connection.execute(f"PRAGMA table_info({quote(args.layer)})").fetchall()
        names = [row[1] for row in table_info]
        if "fid" not in names or "geom" not in names:
            raise SystemExit("ogr2ogr artifact is missing fid or geom")
        if names[0] != "fid" or not all(c in names for c in published):
            raise SystemExit("ogr2ogr artifact schema drifted")
        for name in ("source_fid", "output_record_id", "source_raw_sha256", "source_layer"):
            if name in names:
                raise SystemExit(f"refusing to overwrite existing {name}")

        connection.execute(f"ALTER TABLE {quote(args.layer)} ADD COLUMN source_fid INTEGER")
        connection.execute(f"ALTER TABLE {quote(args.layer)} ADD COLUMN output_record_id TEXT")
        connection.execute(f"ALTER TABLE {quote(args.layer)} ADD COLUMN source_raw_sha256 TEXT")
        connection.execute(f"ALTER TABLE {quote(args.layer)} ADD COLUMN source_layer TEXT")
        # ogr2ogr writes gpkg_contents.last_change with the current clock.  A
        # fixed value is required before comparing two otherwise identical
        # deterministic runs; it is not used as evidence of processing time.
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gpkg_contents'").fetchone():
            connection.execute("UPDATE gpkg_contents SET last_change='2000-01-01T00:00:00.000Z'")

        before_columns = ["fid", "geom", *published]
        rows = connection.execute(f"SELECT {quote('fid')} FROM {quote(args.layer)} ORDER BY {quote('fid')} ASC")
        update_sql = f"UPDATE {quote(args.layer)} SET source_fid=?, output_record_id=?, source_raw_sha256=?, source_layer=? WHERE fid=?"
        batch = []
        for (fid,) in rows:
            source_fid = int(fid)
            output_id = hashlib.sha256(f"{args.raw_sha256}:{args.source_layer}:{source_fid}".encode()).hexdigest()
            batch.append((source_fid, output_id, args.raw_sha256, args.source_layer, source_fid))
            if len(batch) >= 10_000:
                connection.executemany(update_sql, batch)
                batch.clear()
        if batch:
            connection.executemany(update_sql, batch)
        connection.execute(f"CREATE UNIQUE INDEX {quote(args.layer + '_output_record_id_uq')} ON {quote(args.layer)} (output_record_id)")
        connection.execute(f"CREATE INDEX {quote(args.layer + '_source_fid_idx')} ON {quote(args.layer)} (source_fid)")
        connection.commit()

        output_columns = ["fid", "geom", *published]
        output_count, output_fingerprint = row_digest(connection, args.layer, output_columns)
        null_lineage = connection.execute(
            f"SELECT COUNT(*) FROM {quote(args.layer)} WHERE source_fid IS NULL OR output_record_id IS NULL OR source_raw_sha256 IS NULL OR source_layer IS NULL"
        ).fetchone()[0]
        if output_count != source_count or null_lineage:
            raise SystemExit("lineage or feature count QA failed")
        print(json.dumps({
            "featureCount": output_count,
            "sourceRowFingerprintSha256": source_fingerprint,
            "outputRowFingerprintSha256": output_fingerprint,
            "sourceSchema": before_columns,
            "outputSchema": [*before_columns, "source_fid", "output_record_id", "source_raw_sha256", "source_layer"],
            "geometryByteCopy": True,
        }, sort_keys=True))
    finally:
        connection.close()
        source_connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
