#!/usr/bin/env python3
"""Build the 1984-2022 owner admission packet (template, not approved).

Every binding is computed from the bytes on disk at build time. The packet
records a direction the owner gave in chat; it does not record a decision.
"""
import hashlib
import json
import os
import sys

REPO = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/wt/premises"
SSD = "/Volumes/Extended_SSD/Witness_Tree-data"
SPANS_REL = "data/phase3-province-interval-spans-1984-2022.json"
PIECES_REL = "data/phase3-province-interval-spans-1984-2022.pieces.jsonl.gz"
DRIVER_REL = "scripts/phase3-province-interval-spans-block-partition.py"
ANCHORS_REL = "data/phase3-province-interval-spans-anchor-check.json"
VALIDATION_REL = "data/phase3-province-interval-spans-partition-validation.json"
OUT_REL = "data/phase2-1984-2022-owner-admission-packet.json"
SOURCES_REL = "data/provincial-electoral-sources-2026-09-18.json"
OVERLAY_V4_MANIFEST = f"{SSD}/derived/boundary-overlays-v4/manifest.json"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def bind(rel, **extra):
    path = rel if rel.startswith("/") else os.path.join(REPO, rel)
    return {"path": rel, "byteLength": os.path.getsize(path), "sha256": sha(path), **extra}


def load(rel):
    return json.load(open(os.path.join(REPO, rel)))


spans = load(SPANS_REL)
anchors = load(ANCHORS_REL)
validation = load(VALIDATION_REL)
series = load("data/phase2-province-series.json")
raster = load("data/phase2-real-national-execution-evidence.json")
percell = load("data/phase2-per-cell-tile-release.json")
grid = load("data/phase6-coarse-grid-tiles.json")
ridings = load("data/phase3-riding-interval-measurements.json")

if not (anchors["allAnchorsHold"] and validation["comparison"]["exact"]):
    sys.exit("anchors or partition validation failed; no packet is built")

districts = {j["jurisdiction"]: {"edition": j["boundaryEdition"], "districts": len(j["districts"])} for j in ridings["jurisdictions"]}

packet = {
    "schemaVersion": "witness-tree/phase2-1984-2022-owner-admission-packet/1",
    "status": "template-not-approved",
    "decisionId": "phase2-1984-2022-series-spans-and-map-admission-v1",
    "preparedOn": "2026-09-18",
    "ownerDirection": {
        "date": "2026-09-18",
        "words": "All the map data should be admitted and published to the site from 1984 to 2022.",
        "standing": ("A direction given in chat. It is not an admission decision: it names no bytes. "
                     "This packet names the bytes; only an owner decision recorded against this "
                     "packet's SHA-256 can admit them."),
    },
    "purpose": ("Let a visitor get forest loss for any span from 1984 to 2022 for the four provinces, "
                "each province, electoral districts, drawn areas, and the patch map, by admitting the "
                "exact 1984-2022 artifacts below. The 2026-08-26 record admitted only the 2020-2022 "
                "province aggregate and is not edited or widened by this packet."),
    "requestedDecision": {
        "ownerMayChoose": ["approve-admission-and-release", "approve-admission-only", "reject", "defer"],
        "itemsMayBeChosenIndividually": True,
        "approvalScope": ("Admit (and, if chosen, release) only the exact items bound below, under the "
                          "stated method and limits. Items listed under notApprovable cannot be "
                          "admitted by this packet whatever the decision."),
        "futureRecordRule": ("If approved, create a new dated immutable admission record that names this "
                             "decisionId and this packet's SHA-256 and revalidates every binding. Do not "
                             "edit this packet, the 2026-08-26 record, or any historical readback evidence."),
        "releaseMeans": ("New release records for the chosen items; the coarse grid uploaded to the "
                         "delivery bucket behind the CDN; the site copy that says the aggregate covers "
                         "only 2020-2022 rewritten; a 1984-2022 bulk download; deployment only through "
                         "the ChatGPT Sites control plane."),
    },
    "items": {
        "A-base-rasters": {
            "what": "The national annual raster batch every other item is computed from: 39 forest masks and 38 annual loss rasters, 1984-2022.",
            "batchId": raster["batchId"],
            "lineageSha256": raster["lineageSha256"],
            "counts": raster["counts"],
            "totalRasterBytes": raster["totalRasterBytes"],
            "evidence": bind("data/phase2-real-national-execution-evidence.json"),
            "currentStatus": raster["reviewStatus"],
            "note": ("This batch is not the 21-output V2.1 batch the 2026-08-26 record admitted. The "
                     "2020-2022 figures from both agree exactly (see C), but agreement is not admission."),
        },
        "B-province-annual-series-and-union": {
            "what": "Each province's 38 annual losses and the 1984-2022 loss counted once per place.",
            "series": bind("data/phase2-province-series.json"),
            "readback": bind("data/phase2-province-series-readback.json"),
            "cumulativeArtifact": bind(f"{SSD}/derived/phase2-cumulative-province-zonal-v1/cumulative-province-zonal-1984-2022.json"),
            "cumulativeProvenance": bind(f"{SSD}/derived/phase2-cumulative-province-zonal-v1/cumulative-province-zonal-1984-2022.provenance.json"),
            "currentClaims": series["claims"],
        },
        "C-province-span-aggregate": {
            "what": ("Loss counted once per place, forest known at the start year, unknown area, and yearly "
                     "losses added together, for all 741 spans, for BC, AB, ON and QC. The four-province "
                     "figure is the sum of the four, which is exact because provinces are disjoint."),
            "output": bind(SPANS_REL),
            "pieces": bind(PIECES_REL),
            "driver": bind(DRIVER_REL),
            "worker": {"path": "scripts/phase3_interval_zonal_aggregate.py",
                       "sha256": spans["derivation"]["worker"]["sha256"], "changed": False},
            "boundaries": "Statistics Canada 2021 province and territory cartographic boundary file (source input admitted 2026-08-26)",
            "method": spans["derivation"]["why"],
            "partitionValidation": bind(VALIDATION_REL, exact=validation["comparison"]["exact"],
                                        boundaries=validation["comparison"]["boundaries"]),
            "anchorCheck": bind(ANCHORS_REL, allAnchorsHold=anchors["allAnchorsHold"]),
            "anchorsHeld": [
                "1984-2022 union and known 1984 forest equal the cumulative run, every province",
                "all 38 one-year spans equal the annual series rows, loss and forest",
                "2020-2022 equals the admitted aggregate hectares and percent, every province",
                "no span's union exceeds its yearly sum or its start-year forest",
            ],
            "whyNotTheFederalRollup": ("data/phase3-interval-province-rollup.json sums federal districts, "
                                       "which reach into water the cartographic provinces exclude. It misses "
                                       "the cumulative union in BC, ON and QC and is not proposed."),
        },
        "D-district-span-figures": {
            "what": "Loss for all 741 spans in each federal and provincial electoral district.",
            "file": bind("data/phase3-riding-interval-measurements.json"),
            "jurisdictionsInFile": districts,
            "approvableJurisdictions": ["federal-ridings-2023", "bc-provincial-ridings-2023",
                                        "ab-provincial-ridings-2019-goa", "on-provincial-ridings-2022",
                                        "qc-provincial-ridings-2026-published"],
            "boundaryAdmission": {
                "federal-ridings-2023": "admitted and release-approved (data/phase1-federal-electoral-production-admission.json)",
                "bc-provincial-ridings-2023": "checksum-bound and profiled; no use-specific admission record found; owner to confirm",
                "ab-provincial-ridings-2019-goa": ("re-sourced on 2026-09-18 from the Government of Alberta copy under the "
                                                   "Open Government Licence - Alberta 2.2, which allows modification; owner to confirm"),
                "on-provincial-ridings-2022": "checksum-bound and profiled; no use-specific admission record found; owner to confirm",
                "qc-provincial-ridings-2026-published": ("Élections Québec's published bytes, reused unchanged on the owner's "
                                                         "2026-09-18 determination that this is reproduction under the publisher's "
                                                         "non-profit terms with the © credit. Not written permission; owner to confirm"),
            },
            "sourcesRecord": bind(SOURCES_REL),
            "outlines": {
                "what": ("The v4 boundary overlay tiles, built locally with the same Alberta and Québec sources. Québec "
                         "(and the provincial overlay it shares) is drawn without simplification. Not uploaded."),
                "manifest": bind(OVERLAY_V4_MANIFEST),
                "creditsToShowWithV4": {
                    "alberta": "the Open Government Licence - Alberta sentence, exactly as the sources record gives it",
                    "quebec": "Source : © Directeur général des élections du Québec et Commission de la représentation électorale, 2026.",
                },
            },
            "note": ("The file holds all five jurisdictions in one set of bytes. Admitting part of it means "
                     "the record names the approvable jurisdictions and the site must not show the excluded "
                     "ones, or a new file without them is built and bound instead."),
        },
        "E-per-cell-patch-archives": {
            "what": "38 annual per-cell loss patch archives, zoom 8-14, already served from CloudFront.",
            "release": bind("data/phase2-per-cell-tile-release.json", releaseId=percell["releaseId"],
                            intervalCount=percell["totals"]["intervalCount"],
                            byteLength_archives=percell["totals"]["byteLength"]),
            "readback": bind("data/phase2-per-cell-geometry-readback.json"),
            "scopeAuthority": bind("data/phase2-zonal-aggregation-contract-amendment-2026-08-29.json"),
            "currentClaims": {"countable": percell["countable"], "expertReviewed": percell["expertReviewed"],
                              "productionEligible": percell["productionEligible"]},
            "knownDefects": ["The archives are national, so patches draw outside the four provinces (audit finding 3).",
                             "Each archive is one year; a span-ready archive does not exist and is not in this packet."],
        },
        "F-coarse-grid": {
            "what": "960 m union-and-sum grid for draw and measure, any span 1984-2022.",
            "manifest": bind("data/phase6-coarse-grid-tiles.json"),
            "artifactRoot": grid["artifactRoot"],
            "tilesWritten": grid["tilesWritten"],
            "totalBytes": grid["totalBytes"],
            "completionMarker": grid["completionMarker"]["value"],
            "currentClaims": grid["claims"],
            "uploaded": False,
        },
    },
    "notApprovable": {
        "the earlier AB and QC district sources": (
            "The Elections Alberta shapefile (sha256 89d0393f...) and the project's sans-eau Québec copy (sha256 "
            "dd164f0a..., one name rewritten) and every output built from them. They are superseded by "
            + SOURCES_REL + ", which records why. The live boundary-overlays-v3 tiles still draw the Elections "
            "Alberta outlines until a v4 release replaces them and the credit together."),
        "rightsEvidence": [bind("data/phase1-source-inventory.json"), bind("data/phase1-production-source-ledger.json"),
                           bind("data/phase1-outreach-reply-audit.json")],
        "rightsEvidenceNote": ("These records still describe the earlier sources as rights-blocked. They are not edited; "
                               "the sources record is their dated successor for Alberta and Québec."),
        "a span-ready patch archive": "It does not exist yet, and its scope under the 2026-08-29 amendment is unconfirmed.",
    },
    "limitsEveryItemCarries": [
        "Every province is partial-with-unknown, so every figure is a minimum. Unmapped share of the cartographic province: "
        + ", ".join(f"{k} {v['unmappedSharePercent']}%" for k, v in anchors["provinces"].items()) + ".",
        "Loss is counted once per place, against the forest known at the start year. Yearly losses added together carry no percentage.",
        "Unmapped and nodata cells stay Unknown and are never shown as no loss.",
        "Nothing has been expert reviewed. Independent comparisons are not published.",
        "Harvest and wildfire on patches are overlaps with recorded events, not causal attribution.",
    ],
    "permittedClaimsAfterAdmission": [
        "The chosen items are admitted for 1984-2022 under the bound method and limits.",
        "If release is chosen: the chosen items may be published on the site and in a bulk download, with the limits above shown next to them.",
    ],
    "prohibitedClaimsEvenAfterAdmission": [
        "expert review completed",
        "independent comparison completed or published",
        "accuracy, completeness or causal attribution",
        "any figure as a complete-province total",
        "net forest change or regrowth",
        "admission of any unbound output or of the notApprovable items",
    ],
    "formalGateAssessment": {
        "phase2FormalExit": "stays 2 of 4: expert review was retired, not met, and the comparisons are unpublished",
        "phase8LaunchReadiness": "stays 8 of 16 until the real external events occur",
        "honestConclusion": "Approval admits and can release bytes. It completes no formal gate.",
        "statusRecords": [bind("data/phase2-formal-exit-status.json"), bind("data/phase8-launch-readiness-exit-status.json")],
    },
    "doesNotTouch": [
        bind("data/phase2-admission-record-2026-08-26.json"),
        bind("data/phase2-owner-admission-packet.json"),
    ],
}

packet["ownerCopyPaste"] = "\n".join([
    "PHASE2 OWNER INPUT: 1984-2022 SERIES, SPANS AND MAP",
    f"decision_id={packet['decisionId']}",
    "packet_sha256=<the SHA-256 of data/phase2-1984-2022-owner-admission-packet.json as committed>",
    "decision=<OWNER: approve-admission-and-release | approve-admission-only | reject | defer>",
    "items=<OWNER: all approvable, or a list from A, B, C, D, E, F>",
    "acknowledge=exact bindings, limits, not-approvable items, permitted and prohibited claims reviewed",
    "FORMAL_GATES_UNCHANGED=true",
    "DO_NOT_EDIT=the 2026-08-26 record, historical readback evidence, or this packet",
])

out = os.path.join(REPO, OUT_REL)
if os.path.exists(out):
    sys.exit(f"refusing to overwrite {OUT_REL}")
with open(out, "x") as f:
    json.dump(packet, f, indent=2, ensure_ascii=False)
    f.write("\n")
text = open(out, encoding="utf-8").read()
assert "\u2014" not in text and "\u2013" not in text, "dash rule"
print(OUT_REL, sha(out))
