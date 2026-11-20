"""Terrain prototype: photographs taken at ground level inside the close-up area.

PROTOTYPE. Not a release, not an admitted source, not production eligible.

The close-up area is seen from above. This script adds what open archives hold
from the ground, and nothing else: it invents no picture and fills no gap.

Panoramax (panoramax.xyz, a federated open archive run by OpenStreetMap France
and the French national mapping institute)
    Every photo in the box. Each carries its own licence, read from its record;
    a photo is taken only if that licence is CC BY-SA 4.0. A 360-degree photo
    is kept as it came and at two smaller widths.

KartaView (kartaview.org, run by Grab)
    Flat photos taken from vehicles. The terms of use, section 4, license the
    street images under CC BY-SA 4.0 and require the credit
    "(c) Grab and KartaView Contributors". Only photos the service has passed
    through its blurring of faces and plates are taken, and they are thinned so
    that photos kept from one drive are at least THIN_M metres apart.

Both archives are read through their public search, with no account, one
request at a time. Originals are kept in the work folder; the copies the view
loads go to the publish folder (inside public/prototype/, which is not checked
in), with an index the view reads and a provenance record beside the originals.

Memory: one photo at a time, at most about 250 MB for a 360-degree original.

Run with a Python that has GDAL and NumPy:
    python -I fetch_ground_photos.py --work ~/Witness_Tree-terrain-prototype/street-level \
        --publish public/prototype/terrain/ground
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from osgeo import gdal

gdal.UseExceptions()

# The close-up area of build_close_tiles.py (west, south, east, north).
BOX = (-123.200684, 49.667628, -123.112793, 49.738682)
AGENT = "terrain-prototype-build/1.0"
PAUSE_S = 1.0
LICENCE = "CC-BY-SA-4.0"
LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

PANORAMAX = "https://api.panoramax.xyz/api/search"
SPHERE_WIDTHS = (4096, 8192)
SPHERE_QUALITY = 88

KARTAVIEW = "https://api.kartaview.org/2.0/photo/"
KARTAVIEW_RADIUS_M = 500
KARTAVIEW_PAGE = 150
KARTAVIEW_CREDIT = "© Grab and KartaView Contributors"
THIN_M = 40.0
GIVE_UP_AFTER = 5
FLAT_WIDTH = 2048
FLAT_QUALITY = 85


def get_json(url: str) -> dict:
    """Read one answer. A slow or dropped connection is tried again, a little later each time."""
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError:
            raise
        except (TimeoutError, OSError):
            if attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))
    raise AssertionError("unreachable")


def download(url: str, path: str, timeout: int = 600) -> bool:
    """Fetch a file once. Returns whether a request was made. The timeout is for each read, in seconds."""
    if os.path.exists(path):
        return False
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response, open(path + ".partial", "wb") as handle:
                while chunk := response.read(1 << 20):
                    handle.write(chunk)
            break
        except urllib.error.HTTPError:
            raise
        except (TimeoutError, OSError):
            if attempt == 2:
                raise
            time.sleep(10 * (attempt + 1))
    os.replace(path + ".partial", path)
    time.sleep(PAUSE_S)
    return True


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return 6371008.8 * math.hypot(x, y)


def copy_at(source: str, path: str, width: int | None, quality: int) -> dict:
    """Write a copy, narrower or the original itself, and describe it."""
    if not os.path.exists(path):
        image = gdal.Open(source)
        if width is None or width >= image.RasterXSize:
            # At its own width the copy is the original file, byte for byte.
            image = None
            shutil.copyfile(source, path)
        else:
            gdal.Translate(
                path + ".partial.jpg", image, format="JPEG", creationOptions=[f"QUALITY={quality}", "PROGRESSIVE=ON"],
                width=width, height=round(image.RasterYSize * width / image.RasterXSize), resampleAlg="lanczos",
            )
            image = None
            os.replace(path + ".partial.jpg", path)
            if os.path.exists(path + ".partial.jpg.aux.xml"):
                os.remove(path + ".partial.jpg.aux.xml")
    image = gdal.Open(path)
    described = {"width": image.RasterXSize, "height": image.RasterYSize, "byteLength": os.path.getsize(path)}
    image = None
    return described


def panoramax(work: str, publish: str) -> tuple[list[dict], list[dict], list[dict]]:
    found = get_json(f"{PANORAMAX}?bbox={BOX[0]:.6f},{BOX[1]:.6f},{BOX[2]:.6f},{BOX[3]:.6f}&limit=1000")["features"]
    time.sleep(PAUSE_S)
    if len(found) >= 1000:
        raise SystemExit("Panoramax returned a full page; the box needs splitting.")
    photos, records, unfetched = [], [], []
    for feature in sorted(found, key=lambda f: (f["properties"].get("datetime") or "", f["id"])):
        p = feature["properties"]
        if p.get("license") != LICENCE:
            print("skipped, licence", p.get("license"), feature["id"], flush=True)
            continue
        original = os.path.join(work, "originals", f"panoramax-{feature['id']}.jpg")
        try:
            download(feature["assets"]["hd"]["href"], original)
        except Exception as error:  # a record whose file the archive no longer serves: leave it out and say so
            print("panoramax", feature["id"], "not fetched:", str(error)[:100], flush=True)
            unfetched.append({"id": feature["id"], "url": feature["assets"]["hd"]["href"], "error": str(error)[:100]})
            continue
        sphere = str(p.get("pers:interior_orientation", {}).get("field_of_view")) == "360"
        stem = f"panoramax-{feature['id'][:8]}"
        files = []
        if sphere:
            for width in SPHERE_WIDTHS:
                name = f"{stem}-{width}.jpg"
                files.append({"href": name, **copy_at(original, os.path.join(publish, name), width, SPHERE_QUALITY)})
        name = f"{stem}-full.jpg"
        files.append({"href": name, **copy_at(original, os.path.join(publish, name), None, SPHERE_QUALITY)})
        files = sorted({entry["width"]: entry for entry in files}.values(), key=lambda entry: entry["width"])
        lon, lat = feature["geometry"]["coordinates"][:2]
        by = next((q.get("name") for q in feature.get("providers", []) if q.get("name")), None) or p.get("geovisio:producer") or "unnamed contributor"
        page = next((link["href"] for link in feature.get("links", []) if link.get("rel") == "self"), None)
        photos.append({
            "id": stem, "archive": "Panoramax", "kind": "sphere" if sphere else "flat", "lon": lon, "lat": lat,
            "heading": p.get("view:azimuth"), "taken": (p.get("datetime") or "")[:10], "by": by, "licence": LICENCE,
            "files": [{k: entry[k] for k in ("href", "width", "height")} for entry in files],
        })
        records.append({
            "id": feature["id"], "record": page, "licence": p.get("license"), "collection": feature.get("collection"), "by": by,
            "datetime": p.get("datetime"), "original": {"url": feature["assets"]["hd"]["href"], "byteLength": os.path.getsize(original), "sha256": sha256_file(original)},
            "copies": files,
        })
        print("panoramax", stem, "sphere" if sphere else "flat", [entry["width"] for entry in files], flush=True)
    return photos, records, unfetched


def kartaview(work: str, publish: str, count_only: bool, on_disk_only: bool) -> tuple[list[dict], list[dict], dict]:
    # Every answer is kept as it arrives, so a run that is cut short picks up where it stopped
    # and a second run asks the archive nothing it has already said. Delete the folder to search again.
    kept_answers = os.path.join(work, "kartaview-search")
    os.makedirs(kept_answers, exist_ok=True)
    requests = 0

    def pages(query: str) -> list[dict]:
        nonlocal requests
        found, page = [], 1
        while True:
            data = get_json(f"{KARTAVIEW}?{query}&itemsPerPage={KARTAVIEW_PAGE}&page={page}").get("result", {}).get("data") or []
            requests += 1
            time.sleep(PAUSE_S / 2)
            found += data
            if len(data) < KARTAVIEW_PAGE:
                return found
            page += 1

    def kept_answer(name: str, ask):
        path = os.path.join(kept_answers, name)
        if not os.path.exists(path):
            with open(path + ".partial", "w") as handle:
                json.dump(ask(), handle)
            os.replace(path + ".partial", path)
        with open(path) as handle:
            return json.load(handle)

    def inside_box(photos: list[dict]) -> list[dict]:
        return [p for p in photos if BOX[0] <= float(p["lng"]) <= BOX[2] and BOX[1] <= float(p["lat"]) <= BOX[3]]

    def search_by_place() -> list[str]:
        # Circles of 500 m on a square grid 700 m apart cover the box.
        lat_step = 700 / 111320
        lng_step = 700 / (111320 * math.cos(math.radians((BOX[1] + BOX[3]) / 2)))
        drives = set()
        lat = BOX[1]
        while lat <= BOX[3] + lat_step:
            lng = BOX[0]
            while lng <= BOX[2] + lng_step:
                drives.update(p["sequenceId"] for p in pages(f"lat={lat:.6f}&lng={lng:.6f}&radius={KARTAVIEW_RADIUS_M}"))
                lng += lng_step
            lat += lat_step
        return sorted(drives, key=int)

    # The search by place answers with a sample of each drive, so read every drive it names in full.
    # The drives run far beyond the box; only what lies inside it is kept.
    found, seen = 0, {}
    for drive in kept_answer("drives.json", search_by_place):
        def read_drive(drive=drive) -> dict:
            photos = pages(f"sequenceId={drive}")
            return {"found": len(photos), "photos": inside_box(photos)}
        answer = kept_answer(f"drive-{drive}.json", read_drive)
        found += answer["found"]
        seen.update((p["id"], p) for p in answer["photos"])
        print("kartaview drive", drive, "photos in the box so far", len(seen), flush=True)
    searched = datetime.fromtimestamp(os.path.getmtime(os.path.join(kept_answers, "drives.json")), timezone.utc).isoformat(timespec="seconds")
    inside = list(seen.values())
    usable = [p for p in inside if p.get("autoImgProcessingResult") == "BLURRED" and p.get("status") == "active" and p.get("visibility") == "public" and p.get("projection") == "PLANE"]
    # Newest first, and a photo is kept only if no photo already kept stands within THIN_M of it, whatever drive it came from.
    usable.sort(key=lambda p: (p.get("shotDate") or "", int(p["sequenceIndex"])), reverse=True)
    cell = THIN_M / 111320
    taken: dict[tuple[int, int], list[tuple[float, float]]] = {}
    kept = []
    for p in usable:
        here = (float(p["lng"]), float(p["lat"]))
        key = (int(here[0] / (cell * 1.55)), int(here[1] / cell))
        near = (point for dx in (-1, 0, 1) for dy in (-1, 0, 1) for point in taken.get((key[0] + dx, key[1] + dy), ()))
        if all(metres(point, here) >= THIN_M for point in near):
            kept.append(p)
            taken.setdefault(key, []).append(here)
    kept.sort(key=lambda p: (int(p["sequenceId"]), int(p["sequenceIndex"])))
    if count_only:
        print("kartaview", found, "found,", len(inside), "in the box,", len(usable), "usable,", len(kept), "would be kept", flush=True)
        raise SystemExit(0)
    photos, records, not_fetched = [], [], []
    # The photo store sometimes stops answering. After GIVE_UP_AFTER photos in a row it would not
    # give, the rest of this run uses only what is already on disk; run again later for the others.
    misses, asking = 0, not on_disk_only
    for p in kept:
        original = os.path.join(work, "originals", f"kartaview-{p['id']}.jpg")
        if not os.path.exists(original):
            if not asking:
                not_fetched.append({"id": p["id"], "error": "not asked for in this run"})
                continue
            try:
                # A store that does not answer within 45 seconds, three times, is left out and named.
                download(p["fileurlProc"], original, timeout=45)
                time.sleep(PAUSE_S)
                misses = 0
            except Exception as error:
                print("kartaview", p["id"], "not fetched:", str(error)[:100], flush=True)
                not_fetched.append({"id": p["id"], "error": str(error)[:100]})
                misses += 1
                if misses >= GIVE_UP_AFTER:
                    asking = False
                    print("kartaview: the photo store has stopped answering; the rest are left for another run", flush=True)
                continue
        stem = f"kartaview-{p['id']}"
        name = f"{stem}-{FLAT_WIDTH}.jpg"
        copy = {"href": name, **copy_at(original, os.path.join(publish, name), FLAT_WIDTH, FLAT_QUALITY)}
        photos.append({
            "id": stem, "archive": "KartaView", "kind": "flat", "lon": float(p["lng"]), "lat": float(p["lat"]),
            "heading": float(p["heading"]) if p.get("heading") not in (None, "") else None, "taken": (p.get("shotDate") or "")[:10],
            "by": KARTAVIEW_CREDIT, "licence": LICENCE, "files": [{k: copy[k] for k in ("href", "width", "height")}],
        })
        records.append({
            "id": p["id"], "sequenceId": p["sequenceId"], "sequenceIndex": p["sequenceIndex"], "shotDate": p.get("shotDate"),
            "original": {"url": p["fileurlProc"], "byteLength": os.path.getsize(original), "sha256": sha256_file(original)}, "copies": [copy],
        })
    print("kartaview", found, "found,", len(inside), "in the box,", len(usable), "usable,", len(kept), "kept,", len(photos), "fetched,", len(not_fetched), "not fetched", flush=True)
    counts = {"searchedAt": searched, "searchRequestsThisRun": requests, "found": found, "insideBox": len(inside), "usable": len(usable), "keptAfterThinning": len(kept), "fetched": len(photos), "notFetched": not_fetched, "askedTheStore": not on_disk_only, "storeStoppedAnswering": not asking and not on_disk_only}
    return photos, records, counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", required=True, help="where originals and the provenance record are kept")
    parser.add_argument("--publish", required=True, help="where the copies the view loads are written")
    parser.add_argument("--count-only", action="store_true", help="stop after counting the KartaView photos that would be kept")
    parser.add_argument("--on-disk-only", action="store_true", help="ask KartaView for no photo; use the originals already kept")
    args = parser.parse_args()
    work, publish = os.path.expanduser(args.work), os.path.expanduser(args.publish)
    os.makedirs(os.path.join(work, "originals"), exist_ok=True)
    os.makedirs(publish, exist_ok=True)
    started, clock = datetime.now(timezone.utc), time.time()

    spheres, sphere_records, unfetched = panoramax(work, publish)
    flats, flat_records, counts = kartaview(work, publish, args.count_only, args.on_disk_only)
    photos = spheres + flats
    index = os.path.join(publish, "index.json")
    with open(index, "w") as handle:
        json.dump({"licence": LICENCE, "licenceUrl": LICENCE_URL, "photos": photos}, handle, indent=1, ensure_ascii=False)
        handle.write("\n")
    published = sum(os.path.getsize(os.path.join(publish, name)) for name in os.listdir(publish))
    with open(__file__, "rb") as handle:
        script_sha = hashlib.sha256(handle.read()).hexdigest()
    record = {
        "schema": "witness-tree/terrain-prototype-ground-photos-provenance/1",
        "status": "prototype",
        "claims": {"released": False, "admittedSource": False, "expertReviewed": False, "productionEligible": False},
        "boxLonLat": list(BOX),
        "licence": {"name": LICENCE, "url": LICENCE_URL, "changesMade": "narrower copies are resized and recompressed; the full-width copy is the original file"},
        "panoramax": {"search": PANORAMAX, "licenceReadFrom": "each photo's own record", "photos": sphere_records, "notFetched": unfetched},
        "kartaview": {
            "search": KARTAVIEW, "terms": "https://kartaview.org/terms (section 4, read 2026-11-19)", "credit": KARTAVIEW_CREDIT,
            "taken": "photos the service marks BLURRED, active and public, flat projection", "thinMetres": THIN_M, "counts": counts, "photos": flat_records,
        },
        "index": {"path": index, "photos": len(photos), "sha256": sha256_file(index)},
        "publishedBytes": published,
        "script": {"path": "scripts/terrain_prototype/fetch_ground_photos.py", "sha256": script_sha},
        "gdal": gdal.__version__,
        "startedAt": started.isoformat(timespec="seconds"),
        "seconds": round(time.time() - clock, 1),
    }
    with open(os.path.join(work, "provenance-ground-photos.json"), "w") as handle:
        json.dump(record, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("photos", len(photos), "published bytes", published, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
