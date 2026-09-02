#!/usr/bin/env python3
"""Pack the coarse grid into range-readable tiles.

The pass writes one JSON record per block, which is 3 GB and unreadable by a
worker.  A drawn shape needs the blocks it covers and nothing else, so the
shipped form is tiled: 64 by 64 blocks, about 61 km on a side, at a predictable
path.  A capped shape touches a handful of tiles, and the worker fetches those
whole rather than issuing thousands of range reads.

Layout of one tile, little-endian throughout:

    magic      4 bytes  "WTG1"
    tileX      uint16   tile column
    tileY      uint16   tile row
    blocks     uint16   how many blocks follow

  then, per block:

    dx, dy     uint8    position inside the tile
    countable  uint16   cells this block could count, at most 1024
    mapped     uint16   cells inside the mapped extent
    forest[38] uint16   countable cells that were forest in each opening year
    loss[38]   uint16   countable cells lost in each annual step
    pairs      uint16   how many consecutive loss-year pairs follow
    pair       uint8, uint8, uint16   first step, second step, count

Empty blocks are not stored at all.  A block absent from a tile is a block
with nothing in it, which is different from a block that could not be counted:
that one is present with countable 0 and mapped above 0, and it is the reason
the mapped count is stored beside the countable one.

Every count fits in a uint16 because a block holds 1024 cells.  The packer
checks that rather than assuming it.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

MAGIC = b"WTG1"
TILE_BLOCKS = 64
STEPS = 38
BLOCK_CELLS = 32 * 32


def fail(message: str) -> None:
    print(f"pack: {message}", file=sys.stderr)
    raise SystemExit(1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_block(record: dict) -> bytes:
    countable = record["countableCells"]
    mapped = record["mappedCells"]
    forest = record["forestKnownCells"]
    loss = record["annualLossCells"]
    pairs = record["pairs"]

    if not 0 <= countable <= BLOCK_CELLS or not 0 <= mapped <= BLOCK_CELLS:
        fail(f"block {record['gx']},{record['gy']} counts more cells than a block holds")
    if len(forest) != STEPS or len(loss) != STEPS:
        fail(f"block {record['gx']},{record['gy']} does not carry {STEPS} annual steps")
    if len(pairs) > 65535:
        fail(f"block {record['gx']},{record['gy']} carries more pairs than the encoding allows")

    parts = [
        struct.pack("<BB", record["gx"] % TILE_BLOCKS, record["gy"] % TILE_BLOCKS),
        struct.pack("<HH", countable, mapped),
        struct.pack(f"<{STEPS}H", *forest),
        struct.pack(f"<{STEPS}H", *loss),
        struct.pack("<H", len(pairs)),
    ]
    for first, second, count in pairs:
        if not 0 <= first < second < STEPS:
            fail(f"block {record['gx']},{record['gy']} carries a pair outside the record")
        if not 0 <= count <= BLOCK_CELLS:
            fail(f"block {record['gx']},{record['gy']} carries a pair count larger than the block")
        parts.append(struct.pack("<BBH", first, second, count))
    return b"".join(parts)


def main(args: argparse.Namespace) -> None:
    started = datetime.now(timezone.utc)
    sidecar = json.loads(Path(args.sidecar).read_text(encoding="utf-8"))
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        fail(f"refusing to write into a non-empty {output}")
    output.mkdir(parents=True, exist_ok=True)

    grid_width = sidecar["gridWidth"]
    grid_height = sidecar["gridHeight"]
    tiles_across = (grid_width + TILE_BLOCKS - 1) // TILE_BLOCKS
    tiles_down = (grid_height + TILE_BLOCKS - 1) // TILE_BLOCKS

    # The blocks arrive in raster order, so a tile row can be finished and
    # written before the next one starts. Holding one tile row is 95 tiles;
    # holding the country is not possible.
    current_row = -1
    row_tiles: dict[int, list[bytes]] = {}
    written = 0
    blocks_seen = 0
    tile_index: list[dict] = []

    def flush(row: int) -> None:
        nonlocal written
        for tile_x in sorted(row_tiles):
            payload = row_tiles[tile_x]
            if not payload:
                continue
            body = b"".join(payload)
            header = MAGIC + struct.pack("<HHH", tile_x, row, len(payload))
            raw = header + body
            name = f"{row}-{tile_x}.bin.gz"
            path = output / name
            data = gzip.compress(raw, 9, mtime=0)
            path.write_bytes(data)
            tile_index.append(
                {
                    "tileX": tile_x,
                    "tileY": row,
                    "file": name,
                    "blocks": len(payload),
                    "bytes": len(data),
                    "rawBytes": len(raw),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            written += 1
        row_tiles.clear()

    with Path(args.blocks).open("r", encoding="utf-8") as stream:
        for line in stream:
            record = json.loads(line)
            blocks_seen += 1
            tile_y = record["gy"] // TILE_BLOCKS
            if tile_y != current_row:
                if tile_y < current_row:
                    fail("the blocks are not in raster order, so a tile row cannot be closed")
                flush(current_row)
                current_row = tile_y
            row_tiles.setdefault(record["gx"] // TILE_BLOCKS, []).append(encode_block(record))
            if blocks_seen % 1_000_000 == 0:
                print(f"  packed {blocks_seen} blocks into {written} tiles", flush=True)
    flush(current_row)

    if blocks_seen != sidecar["blocksWritten"]:
        fail(f"packed {blocks_seen} blocks but the sidecar records {sidecar['blocksWritten']}")

    manifest = {
        "schemaVersion": "witness-tree/phase6-coarse-grid-tiles/1",
        "methodVersion": sidecar["methodVersion"],
        "codeVersion": sidecar["codeVersion"],
        "packerSha256": sha256_file(Path(__file__).resolve()),
        "sourceSidecarSha256": sha256_file(Path(args.sidecar)),
        "sourceBlocksSha256": args.blocks_sha256,
        "startedAt": started.isoformat().replace("+00:00", "Z"),
        "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "magic": MAGIC.decode("ascii"),
        "tileBlocks": TILE_BLOCKS,
        "blockPixels": sidecar["blockPixels"],
        "blockMetres": sidecar["blockMetres"],
        "cellHectares": sidecar["cellHectares"],
        "gridWidth": grid_width,
        "gridHeight": grid_height,
        "tilesAcross": tiles_across,
        "tilesDown": tiles_down,
        "tilesWritten": written,
        "blocksPacked": blocks_seen,
        "countableCells": sidecar["countableCells"],
        "firstYear": sidecar["firstYear"],
        "lastYear": sidecar["lastYear"],
        "annualStepCount": sidecar["annualStepCount"],
        "totalBytes": sum(entry["bytes"] for entry in tile_index),
        "encoding": {
            "byteOrder": "little-endian",
            "header": "magic 4, tileX uint16, tileY uint16, blockCount uint16",
            "block": (
                "dx uint8, dy uint8, countable uint16, mapped uint16, "
                f"forest uint16 x {STEPS}, loss uint16 x {STEPS}, pairCount uint16, "
                "then pairCount x (first uint8, second uint8, count uint16)"
            ),
            "absentBlockMeaning": "nothing in the block at all, which is not the same as nothing countable",
            "compression": "gzip",
        },
        "claims": {"admitted": False, "released": False, "productionEligible": False, "expertReviewed": False},
    }
    Path(args.manifest).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    Path(args.tile_index).write_text(
        json.dumps({"tiles": sorted(tile_index, key=lambda e: (e["tileY"], e["tileX"]))}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {written} tiles, {manifest['totalBytes']} bytes, from {blocks_seen} blocks")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--blocks", required=True)
    p.add_argument("--sidecar", required=True)
    p.add_argument("--blocks-sha256", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--tile-index", required=True)
    return p


if __name__ == "__main__":
    main(parser().parse_args())
