#!/usr/bin/env python3
"""The place-name index: which ridings hold each community.  Stage two.

Stage one (scripts/place_name_overlaps.py) wrote every overlap between a 2021
census subdivision and a riding, slivers included.  This stage decides which
places to list and which ridings to name for each, and writes the index that
search reads once it is copied to data/place-name-index.json.

Places.  Every census subdivision in British Columbia, Alberta, Ontario and
Quebec is listed except reserves, settlements, and treaty or agreement lands,
the D5 default in the plan for Batches A, B and 5b.  Phase 7 has not cleared
official Indigenous boundary admission or an owner-managed right-of-reply
route, so those places are left out rather than given a page.  That default
is the plan's, not an owner decision, and the index says so.

Names.  English and French names come from Statistics Canada's classification
pages for the 2021 Standard Geographical Classification, read in both
languages on 2026-09-21 and recorded as a digest of every row (--names).  The
record lists only the names that differ from the boundary file's, which are
the four official bilingual names the file writes as "English / French".  This
stage rebuilds both digests from the boundary file's names, the recorded
differences and the recorded type labels, so a difference or a label that was
not recorded stops the build.

Ridings.  A place's area in a riding layer is the part of it inside any riding
of that layer.  Boundary files drawn by different agencies do not share every
edge, so this can fall short of the whole place: Quebec's ridings leave out
large lakes that the subdivisions include.  A riding's share is its part of
that area.  A riding is listed when

  - it holds the largest share of the place, or
  - its share is at least 1 percent once strips narrower than 100 metres are
    removed, or
  - at least 5 percent of the riding lies in the place once those strips are
    removed.

The strips are where two agencies' boundaries follow the same line without
coinciding.  The plan's rule was a flat 1 percent, and the stage-one QA showed
what it does: such strips reach 3 percent of a town (a 35-metre-wide ribbon of
Charlemagne), while a downtown Toronto riding that lies wholly inside the city
covers less than 1 percent of it.  A strip is removed by a morphological
opening: the part is shrunk by 50 metres and grown back, and only what
survives counts.  The displayed share is never the opened one.

Every overlap of a listed place is written, with its decision and the reason,
to listing-decisions.jsonl beside the index, so any listing can be audited.
Everything is written once and never overwritten.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from osgeo import gdal, ogr, osr

import place_name_overlaps as overlaps

SCHEMA = "witness-tree/place-name-index/1"
MANIFEST_SCHEMA = "witness-tree/place-name-index-manifest/1"
OVERLAPS_SCHEMA = "witness-tree/place-name-overlaps-manifest/1"
MEASUREMENTS_SCHEMA = "witness-tree/phase3-riding-interval-measurements/1"
NAMES_SCHEMA = "witness-tree/sgc-2021-csd-names/1"
METHOD_VERSION = "place-name-index-csd-overlay-v1"
OWNER_DECISION_FIELD = "municipalityBoundaryDecision"
OWNER_DECISION_VALUE = "accept-statcan-2021-csd"

E_ACUTE = "\N{LATIN SMALL LETTER E WITH ACUTE}"
EXCLUDED_TYPES = (
    "IRI", "S-\N{LATIN CAPITAL LETTER E WITH ACUTE}", "IGD", "NL", "TAL", "TWL",
    "TC", "TI", "TK", "VC", "VK", "VN",
)
PLACE_SHARE = 0.01
RIDING_SHARE = 0.05
STRIP_WIDTH_M = 100.0
QUADRANT_SEGMENTS = 8
SHARE_DECIMALS = 4
AREA_TOLERANCE_M2 = 1.0

ATTRIBUTION_FR = (
    f"Adapt{E_ACUTE} de Statistique Canada, Fichier des limites cartographiques des subdivisions "
    f"de recensement du Recensement de 2021, date de r{E_ACUTE}f{E_ACUTE}rence le 1er janvier 2021. "
    "Cela ne constitue pas une approbation de ce produit par Statistique Canada."
)
EXCLUSION_REASON = (
    "Reserves, settlements, and treaty or agreement lands are left out until Phase 7 clears "
    "official Indigenous boundary admission and an owner-managed right-of-reply route, so that no "
    "place page appears ahead of the safeguards in section 11.4."
)
LISTING_RULE = (
    "A riding is listed when it holds the largest share of the place; or when its share is at "
    "least 1 percent once strips narrower than 100 metres are removed; or when at least 5 percent "
    "of the riding lies in the place once those strips are removed. Shares are of the part of the "
    "place inside any riding of the layer, largest first. The plan's rule was a flat 1 percent; "
    "the strip removal and the riding test are the data-driven refinement recorded here."
)
CLAIMS = {"admitted": False, "released": False, "productionEligible": False, "externalAction": False}

fail = overlaps.fail
now = overlaps.now
sha256_file = overlaps.sha256_file
write_once = overlaps.write_once


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"cannot read {path}: {error}")
    return {}


def canonical(value: str) -> str:
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", value).strip())


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def checked_overlaps(manifest_path: Path) -> tuple[dict, list[dict], list[dict]]:
    """Stage one's outputs, byte for byte, and a builder that matches the module imported here."""

    manifest = read_json(manifest_path)
    if manifest.get("schemaVersion") != OVERLAPS_SCHEMA:
        fail(f"{manifest_path} is not a place-name overlaps manifest")
    module_sha = sha256_file(str(Path(overlaps.__file__).resolve()))
    if module_sha != manifest["builderSha256"]:
        fail("scripts/place_name_overlaps.py no longer matches the builder that wrote the overlaps")
    run = manifest_path.parent
    for name, recorded in manifest["outputs"].items():
        path = run / name
        if path.is_symlink() or sha256_file(str(path)) != recorded["sha256"] or path.stat().st_size != recorded["bytes"]:
            fail(f"{path} does not match the overlaps manifest")
    subdivisions = [json.loads(line) for line in (run / "subdivisions.jsonl").read_text(encoding="utf-8").splitlines()]
    rows = [json.loads(line) for line in (run / "overlaps.jsonl").read_text(encoding="utf-8").splitlines()]
    if len(subdivisions) != manifest["subdivisions"]["read"] or len(rows) != manifest["overlapCount"]:
        fail("the overlap outputs do not hold the counts their manifest records")
    return manifest, subdivisions, rows


def checked_edition(editions_path: Path, manifest: dict) -> dict:
    editions = read_json(editions_path)
    edition = next((entry for entry in editions["editions"] if entry["id"] == overlaps.EDITION_ID), None)
    if edition is None:
        fail(f"{overlaps.EDITION_ID} is not in the boundary editions record")
    if edition["sha256"] != manifest["subdivisions"]["sha256"]:
        fail("the overlaps were built from a different subdivision archive than the editions record names")
    if sha256_file(manifest["subdivisions"]["path"]) != edition["sha256"]:
        fail("the subdivision archive on the data drive no longer matches the editions record")
    if not edition.get("requiredAttribution"):
        fail("the editions record carries no attribution for the subdivisions")
    return edition


def checked_owner_decision(path: Path) -> dict:
    decision = read_json(path).get("ownerDecision") or {}
    if decision.get(OWNER_DECISION_FIELD) != OWNER_DECISION_VALUE:
        fail(f"the owner decision does not accept the 2021 census subdivisions ({OWNER_DECISION_FIELD})")
    return {
        "file": "data/phase2-real-data-owner-decision.json",
        "field": f"ownerDecision.{OWNER_DECISION_FIELD}",
        "value": OWNER_DECISION_VALUE,
        "status": decision.get("status"),
        "recordedAt": decision.get("recordedAt"),
    }


def checked_riding_figures(measurements_path: Path, figures: Path, manifest: dict) -> tuple[dict, dict, list[dict]]:
    """The released riding figures, tied to the same boundary bytes the overlaps were cut from."""

    measurements = read_json(measurements_path)
    if measurements.get("schema") != MEASUREMENTS_SCHEMA:
        fail(f"{measurements_path} is not the riding interval measurements")
    if Path(measurements["builtFrom"]).name != figures.name:
        fail(f"the riding figures were built from {measurements['builtFrom']}, not {figures}")
    jurisdictions, inputs = measurements["jurisdictions"], measurements["inputs"]
    if len(jurisdictions) != len(inputs):
        fail("the riding figures do not pair each jurisdiction with one input")
    layer_for = {layer["jurisdiction"]: layer for layer in manifest["layers"]}
    ids, editions, checked = {}, {}, []
    for jurisdiction, source in zip(jurisdictions, inputs):
        code = jurisdiction["jurisdiction"]
        provenance_path = figures / f"{source['slug']}.provenance.json"
        provenance = read_json(provenance_path)
        output = figures / provenance["output"]
        if provenance["outputSha256"] != source["sha256"] or sha256_file(str(output)) != source["sha256"]:
            fail(f"the {code} riding figures do not match their zonal output {output}")
        if provenance["districtCount"] != len(jurisdiction["districts"]):
            fail(f"the {code} riding figures count {len(jurisdiction['districts'])} districts, the zonal run {provenance['districtCount']}")
        boundaries = [entry for entry in provenance["inputs"] if entry["kind"] == "boundaries"]
        layer = layer_for.get(code)
        if len(boundaries) != 1 or layer is None or boundaries[0]["sha256"] != layer["sha256"]:
            fail(f"the {code} riding figures were not measured on the boundaries the overlaps used")
        ids[code] = {f"{code}-{district['boundaryId']}" for district in jurisdiction["districts"]}
        editions[layer["id"]] = jurisdiction["boundaryEdition"]
        checked.append({
            "jurisdiction": code, "slug": source["slug"], "sha256": source["sha256"],
            "provenanceSha256": sha256_file(str(provenance_path)), "boundariesSha256": layer["sha256"],
        })
    return ids, editions, checked


def checked_names(path: Path, subdivisions: list[dict]) -> tuple[dict, dict, dict]:
    """Both languages' names and type labels, verified against the recorded page digests."""

    record = read_json(path)
    if record.get("schema") != NAMES_SCHEMA:
        fail(f"{path} is not a classification names record")
    divisions = set(record["censusDivisions"])
    if {entry["id"][:4] for entry in subdivisions} - divisions:
        fail("the names record does not cover every census division that holds a subdivision")
    scope = sorted((entry for entry in subdivisions if entry["id"][:4] in divisions), key=lambda entry: entry["id"])
    by_id = {entry["id"]: entry for entry in scope}
    differences = {}
    for difference in record["nameDifferences"]:
        subject = by_id.get(difference["code"])
        if subject is None or canonical(subject["name"]) != canonical(difference["file"]):
            fail(f"the names record misquotes the boundary file's name for {difference['code']}")
        differences[difference["code"]] = difference
    labels = record["typeLabels"]
    names: dict[str, dict] = {}
    for language in ("en", "fr"):
        name_lines, row_lines = [], []
        for entry in scope:
            name = canonical(differences[entry["id"]][language] if entry["id"] in differences else entry["name"])
            if entry["type"] not in labels:
                fail(f"the names record has no label for type {entry['type']}")
            label = canonical(labels[entry["type"]][language])
            name_lines.append(f"{entry['id']}\t{name}")
            row_lines.append(f"{entry['id']}\t{name}\t{label}")
            names.setdefault(entry["id"], {})[language] = name
        digest = record["digests"][language]
        if digest["rows"] != len(scope):
            fail(f"the {language} pages list {digest['rows']} subdivisions, the boundary file {len(scope)}")
        if sha256_text("\n".join(name_lines)) != digest["namesSha256"]:
            fail(f"the {language} names differ from the classification pages in a way the record does not list")
        if sha256_text("\n".join(row_lines)) != digest["rowsSha256"]:
            fail(f"the {language} type labels differ from the classification pages")
    return record, names, labels


def area_of(geometry: ogr.Geometry | None) -> float:
    return 0.0 if geometry is None or geometry.IsEmpty() else geometry.GetArea()


def piece_of(subdivision: ogr.Geometry, riding: ogr.Geometry, label: str) -> ogr.Geometry | None:
    try:
        return overlaps.polygonal(subdivision.Intersection(riding))
    except RuntimeError:
        try:
            return overlaps.polygonal(subdivision.Buffer(0).Intersection(riding.Buffer(0)))
        except RuntimeError as error:
            fail(f"cannot intersect {label}: {error}")
    return None


def solid_m2(piece: ogr.Geometry) -> float:
    """The area left once strips narrower than STRIP_WIDTH_M are removed (a morphological opening)."""

    radius = STRIP_WIDTH_M / 2
    shrunk = piece.Buffer(-radius, QUADRANT_SEGMENTS)
    if shrunk is None or shrunk.IsEmpty():
        return 0.0
    return area_of(overlaps.polygonal(shrunk.Buffer(radius, QUADRANT_SEGMENTS).Intersection(piece)))


def geometry_for_tests(manifest: dict, needed: set[tuple[str, str]]) -> tuple[dict, dict]:
    """Subdivision and riding geometry for the overlaps that need the strip test, read as stage one read it."""

    target = overlaps.area_srs()
    wanted_subdivisions = {subdivision for subdivision, _ in needed}
    wanted_ridings = {riding for _, riding in needed}
    subdivisions, _ = overlaps.read_subdivisions(manifest["subdivisions"]["path"], target)
    places = {entry["id"]: entry["geometry"] for entry in subdivisions if entry["id"] in wanted_subdivisions}
    ridings = {}
    for layer in manifest["layers"]:
        if sha256_file(layer["path"]) != layer["sha256"]:
            fail(f"{layer['id']} no longer matches the bytes the overlaps were cut from")
        spec = {key: layer[key] for key in ("id", "jurisdiction", "path", "idField")}
        if layer.get("province"):
            spec["province"] = layer["province"]
        if layer.get("layer"):
            spec["layer"] = layer["layer"]
        for riding in overlaps.read_ridings(spec, target)[0]:
            if riding["id"] in wanted_ridings:
                ridings[riding["id"]] = riding["geometry"]
    return places, ridings


def decide(manifest: dict, kept: dict, rows: list[dict]) -> tuple[dict, list[dict], dict]:
    """Which ridings each place lists, with every overlap's decision and the coverage per layer."""

    riding_area = {riding: area for layer in manifest["layers"] for riding, area in layer["ridingAreasM2"].items()}
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for row in rows:
        if row["subdivision"] in kept:
            groups[(row["subdivision"], row["layer"])].append(row)
    covered = {key: sum(row["intersectionM2"] for row in group) for key, group in groups.items()}
    for group in groups.values():
        group.sort(key=lambda row: (-row["intersectionM2"], row["riding"]))

    def tested(row: dict, rank: int, key: tuple[str, str]) -> bool:
        return rank > 0 and (row["intersectionM2"] / covered[key] >= PLACE_SHARE or row["shareOfRiding"] >= RIDING_SHARE)

    needed = {(row["subdivision"], row["riding"]) for key, group in groups.items()
              for rank, row in enumerate(group) if tested(row, rank, key)}
    print(f"{now()} {len(needed)} overlaps need the strip test", flush=True)
    places, ridings = geometry_for_tests(manifest, needed)

    listed: dict[tuple[str, str], list[list]] = {}
    decisions = []
    for key, group in sorted(groups.items()):
        chosen = []
        for rank, row in enumerate(group):
            share = row["intersectionM2"] / covered[key]
            record = {
                "subdivision": row["subdivision"], "layer": row["layer"], "riding": row["riding"],
                "share": round(share, 8), "shareOfRiding": row["shareOfRiding"],
                "solidShare": None, "solidShareOfRiding": None,
            }
            if rank == 0:
                record |= {"listed": True, "reason": "largest"}
            elif not tested(row, rank, key):
                record |= {"listed": False, "reason": "below-both-thresholds"}
            else:
                label = f"{row['subdivision']} with {row['riding']}"
                piece = piece_of(places[row["subdivision"]], ridings[row["riding"]], label)
                area = area_of(piece)
                if abs(area - row["intersectionM2"]) > max(AREA_TOLERANCE_M2, 1e-6 * area):
                    fail(f"{label} measures {area:.1f} square metres here and {row['intersectionM2']} in stage one")
                solid = solid_m2(piece)
                solid_share, solid_of_riding = solid / covered[key], solid / riding_area[row["riding"]]
                record |= {"solidShare": round(solid_share, 8), "solidShareOfRiding": round(solid_of_riding, 8)}
                if solid_share >= PLACE_SHARE:
                    record |= {"listed": True, "reason": "place-share"}
                elif solid_of_riding >= RIDING_SHARE:
                    record |= {"listed": True, "reason": "riding-share"}
                else:
                    record |= {"listed": False, "reason": "strips"}
            decisions.append(record)
            if record["listed"]:
                chosen.append([row["riding"], round(share, SHARE_DECIMALS)])
        listed[key] = chosen
    return listed, decisions, covered


def coverage_qa(kept: dict, manifest: dict, covered: dict) -> tuple[dict, list[dict]]:
    """How much of each place lies inside its layers' ridings, and the places a layer misses entirely."""

    summary, gaps = {}, []
    for layer in manifest["layers"]:
        values = []
        for place in kept.values():
            if layer["jurisdiction"] != "CA" and layer["province"] != place["province"]:
                continue
            fraction = covered.get((place["id"], layer["id"]), 0.0) / place["areaM2"]
            values.append(fraction)
            if fraction == 0:
                gaps.append({"id": place["id"], "layer": layer["id"], "reason": "No riding in this layer overlaps the place."})
        summary[layer["id"]] = {
            "places": len(values), "minimum": round(min(values), 6),
            "below0_99": sum(value < 0.99 for value in values),
            "below0_9": sum(value < 0.9 for value in values),
            "below0_5": sum(value < 0.5 for value in values),
        }
    return summary, gaps


def serialize(record: dict) -> str:
    """Pretty-printed envelope, one line per place, ASCII only."""

    body = dict(record)
    places = body.pop("places")
    head = json.dumps(body, indent=2, ensure_ascii=True)
    lines = ",\n".join("    " + json.dumps(place, ensure_ascii=True, separators=(",", ":")) for place in places)
    text = head[:-2] + ',\n  "places": [\n' + lines + "\n  ]\n}\n"
    if json.loads(text) != record:
        fail("the serialized index does not read back as the record")
    return text


def main() -> None:
    arguments = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    arguments.add_argument("--overlaps-manifest", required=True)
    arguments.add_argument("--editions", required=True, help="data/boundary-editions.json")
    arguments.add_argument("--owner-decision", required=True, help="data/phase2-real-data-owner-decision.json")
    arguments.add_argument("--measurements", required=True, help="data/phase3-riding-interval-measurements.json")
    arguments.add_argument("--riding-figures", required=True, help="the zonal run the measurements were built from")
    arguments.add_argument("--names", required=True, help="the classification names record")
    arguments.add_argument("--output", required=True)
    arguments.add_argument("--manifest", required=True)
    arguments.add_argument("--code-version", required=True)
    args = arguments.parse_args()

    gdal.UseExceptions()
    ogr.UseExceptions()
    osr.UseExceptions()
    started = now()
    output = Path(args.output)
    overlaps_manifest_path = Path(args.overlaps_manifest)
    if overlaps_manifest_path.parent.resolve() != output.resolve():
        fail("the index must be written into the run directory that holds its overlaps")

    manifest, subdivisions, rows = checked_overlaps(overlaps_manifest_path)
    edition = checked_edition(Path(args.editions), manifest)
    owner_decision = checked_owner_decision(Path(args.owner_decision))
    riding_ids, boundary_editions, figure_inputs = checked_riding_figures(Path(args.measurements), Path(args.riding_figures), manifest)
    names_record, names, labels = checked_names(Path(args.names), subdivisions)

    excluded = collections.Counter(entry["type"] for entry in subdivisions if entry["type"] in EXCLUDED_TYPES)
    kept = {entry["id"]: entry for entry in subdivisions if entry["type"] not in EXCLUDED_TYPES}
    print(f"{now()} {len(kept)} places kept, {sum(excluded.values())} left out", flush=True)

    listed, decisions, covered = decide(manifest, kept, rows)
    coverage, gaps = coverage_qa(kept, manifest, covered)
    province_code = overlaps.PROVINCES

    places, unjoined = [], set()
    for entry in sorted(kept.values(), key=lambda entry: entry["id"]):
        place = {"id": entry["id"], "name": names[entry["id"]]["en"]}
        if names[entry["id"]]["fr"] != names[entry["id"]]["en"]:
            place["nameFr"] = names[entry["id"]]["fr"]
        place |= {"type": entry["type"], "province": province_code[entry["province"]]}
        for group, layers in (("federal", [layer for layer in manifest["layers"] if layer["jurisdiction"] == "CA"]),
                              ("provincial", [layer for layer in manifest["layers"] if layer.get("province") == entry["province"]])):
            if len(layers) != 1:
                fail(f"{entry['id']} has {len(layers)} {group} layers")
            chosen = listed.get((entry["id"], layers[0]["id"]), [])
            for riding, _ in chosen:
                if riding not in riding_ids[riding.split("-", 1)[0]]:
                    unjoined.add(riding)
            place[group] = chosen
        places.append(place)
    if unjoined:
        fail(f"listed ridings with no released figures: {sorted(unjoined)[:10]}")

    listed_ridings = collections.defaultdict(set)
    for place in places:
        for riding, _ in place["federal"] + place["provincial"]:
            listed_ridings[riding.split("-", 1)[0]].add(riding)
    in_scope = {
        code: {riding for layer in manifest["layers"] if layer["jurisdiction"] == code for riding in layer["ridingAreasM2"]}
        for code in riding_ids
    }
    reasons = collections.Counter(decision["reason"] for decision in decisions)
    counts = {
        "places": len(places),
        "placesByProvince": dict(sorted(collections.Counter(place["province"] for place in places).items())),
        "placesByType": dict(sorted(collections.Counter(place["type"] for place in places).items())),
        "leftOut": sum(excluded.values()),
        "leftOutByType": dict(sorted(excluded.items())),
        "listings": {
            group: {
                "ridings": sum(len(place[group]) for place in places),
                "placesWithOne": sum(len(place[group]) == 1 for place in places),
                "placesWithMore": sum(len(place[group]) > 1 for place in places),
                "placesWithNone": sum(len(place[group]) == 0 for place in places),
            }
            for group in ("federal", "provincial")
        },
        "overlapDecisions": dict(sorted(reasons.items())),
        "ridingsNamedByAPlace": {code: len(listed_ridings[code]) for code in sorted(riding_ids)},
        "ridingsInScope": {code: len(in_scope[code]) for code in sorted(riding_ids)},
    }

    layers_out = [{
        "id": layer["id"], "jurisdiction": layer["jurisdiction"], "province": layer.get("province") and province_code[layer["province"]],
        "boundaryEdition": boundary_editions[layer["id"]], "sourceSha256": layer["sha256"],
        "ridings": len(layer["ridingAreasM2"]),
    } for layer in manifest["layers"]]
    kept_types = sorted({place["type"] for place in places})
    record = {
        "schema": SCHEMA,
        "methodVersion": METHOD_VERSION,
        "codeVersion": args.code_version,
        "builderSha256": sha256_file(str(Path(__file__).resolve())),
        "builtAt": now(),
        "builtFrom": {
            "run": f"derived/{output.name}",
            "overlapsManifestSha256": sha256_file(str(overlaps_manifest_path)),
            "overlapsMethodVersion": manifest["methodVersion"],
        },
        "source": {
            "editionId": edition["id"], "publisher": edition["publisher"], "productName": edition["productName"],
            "fileName": edition["fileName"], "sha256": edition["sha256"], "referenceDate": edition["referenceDate"],
            "licenceId": edition["licenceId"], "productionEligible": edition["productionEligible"],
            "attribution": {"en": edition["requiredAttribution"], "fr": ATTRIBUTION_FR},
            "ownerDecision": owner_decision,
        },
        "names": {
            "source": "Statistics Canada, Standard Geographical Classification (SGC) 2021, census division pages in English and French",
            "readOn": names_record["retrieval"]["finishedAt"][:10],
            "recordSha256": sha256_file(args.names),
            "note": ("A name reads the same in both languages except the official bilingual names, whose French form is "
                     "nameFr. Six Quebec names contain two hyphens (--), as Statistics Canada writes them."),
        },
        "ridingLayers": layers_out,
        "method": {
            "areaCrs": manifest["areaCrs"],
            "rule": LISTING_RULE,
            "placeShare": PLACE_SHARE,
            "ridingShare": RIDING_SHARE,
            "stripWidthM": STRIP_WIDTH_M,
            "shareDecimals": SHARE_DECIMALS,
        },
        "exclusions": {
            "types": list(EXCLUDED_TYPES),
            "decision": "D5 in the plan for Batches A, B and 5b: a default the plan applied, which the owner may change. Not an owner decision.",
            "reason": EXCLUSION_REASON,
        },
        "gaps": gaps,
        "counts": counts,
        "claims": dict(CLAIMS),
        "typeLabels": {code: {"en": labels[code]["en"], "fr": labels[code]["fr"]} for code in kept_types},
        "places": places,
    }
    index_path = output / "place-name-index.json"
    decisions_path = output / "listing-decisions.jsonl"
    write_once(decisions_path, "".join(json.dumps(decision, ensure_ascii=True) + "\n" for decision in decisions))
    write_once(index_path, serialize(record))

    stripped = sorted((decision for decision in decisions if decision["reason"] == "strips"), key=lambda decision: -decision["share"])
    manifest_record = {
        "schemaVersion": MANIFEST_SCHEMA,
        "methodVersion": METHOD_VERSION,
        "codeVersion": args.code_version,
        "builderSha256": record["builderSha256"],
        "overlapsBuilderSha256": manifest["builderSha256"],
        "startedAt": started,
        "finishedAt": now(),
        "toolchain": overlaps.toolchain(),
        "inputs": {
            "overlapsManifest": {"path": str(overlaps_manifest_path), "sha256": record["builtFrom"]["overlapsManifestSha256"]},
            "editions": {"path": args.editions, "sha256": sha256_file(args.editions)},
            "ownerDecision": {"path": args.owner_decision, "sha256": sha256_file(args.owner_decision)},
            "measurements": {"path": args.measurements, "sha256": sha256_file(args.measurements)},
            "ridingFigures": figure_inputs,
            "names": {"path": args.names, "sha256": record["names"]["recordSha256"]},
        },
        "listing": {**record["method"], "openingRadiusM": STRIP_WIDTH_M / 2, "quadrantSegments": QUADRANT_SEGMENTS},
        "outputs": {
            path.name: {"sha256": sha256_file(str(path)), "bytes": path.stat().st_size}
            for path in (index_path, decisions_path)
        },
        "counts": counts,
        "qa": {
            "coverage": coverage,
            "gaps": gaps,
            "stripsRemoved": len(stripped),
            "stripsRemovedLargest": stripped[:40],
            "listedByRidingShare": [decision for decision in decisions if decision["reason"] == "riding-share"],
        },
        "claims": dict(CLAIMS),
    }
    write_once(Path(args.manifest), json.dumps(manifest_record, indent=2, ensure_ascii=True) + "\n")
    print(f"{now()} wrote {len(places)} places to {index_path}")


if __name__ == "__main__":
    main()
