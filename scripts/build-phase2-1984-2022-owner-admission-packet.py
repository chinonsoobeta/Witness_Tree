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
            "approvableJurisdictions": ["federal-ridings-2023", "bc-provincial-ridings-2023", "on-provincial-ridings-2022"],
            "boundaryAdmission": {
                "federal-ridings-2023": "admitted and release-approved (data/phase1-federal-electoral-production-admission.json)",
                "bc-provincial-ridings-2023": "checksum-bound and profiled; no use-specific admission record found; owner to confirm",
                "on-provincial-ridings-2022": "checksum-bound and profiled; no use-specific admission record found; owner to confirm",
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
        "ab-provincial-ridings-2019 and qc-provincial-ridings-2026 district figures": (
            "data/phase1-source-inventory.json records Alberta as rights-blocked (written permission "
            "missing) and the Quebec 2026 map as not yet effective and rights-blocked. The outreach audit "
            "records the Elections Alberta permission request as unsent. No later record clears either. "
            "An admission here would invent source rights."),
        "rightsEvidence": [bind("data/phase1-source-inventory.json"), bind("data/phase1-production-source-ledger.json"),
                           bind("data/phase1-outreach-reply-audit.json")],
        "publisherTermsReadOn2026-09-18": {
            "note": ("Read from the public pages only. Nothing was sent, requested or accepted. These are the "
                     "publishers' own words, summarized; they are not a rights decision."),
            "alberta": {
                "boundArtifact": "Elections Alberta 2019Boundaries_ED shapefile (EDS_ENACTED_BILL33_15DEC2017), sha256 89d0393f8046fe9178f630012fbf4a68718e898f538523554e211fc8dae526a4",
                "terms": "https://www.elections.ab.ca/terms-conditions/",
                "nonCommercialReproductionConditions": [
                    "the materials are not modified",
                    "due diligence to keep them accurate",
                    "Elections Alberta is identified as the source",
                    "not represented as an official version, or as made in affiliation with or with the endorsement of Elections Alberta",
                ],
                "commercial": "written permission from Elections Alberta (Deputy Chief Electoral Officer)",
                "prescribedAttributionSentence": None,
                "shapefileMetadataConstraints": "none: the zip carries no licence file and its .shp.xml has no use-constraint fields",
                "whyAttributionAloneDoesNotClearIt": ("The site reprojects, generalizes and tiles the outlines and derives "
                                                      "figures from them. That is modification, which the non-commercial "
                                                      "exception does not allow."),
                "siteAttributionIsWrong": ("lib/explore/boundaries.ts:76 credits the Alberta outlines to the Open Government "
                                           "Licence - Alberta, but the bound file came from Elections Alberta under its own "
                                           "terms, not that licence."),
                "possibleCleanPath": {
                    "dataset": "Provincial Electoral Division - Current 2019 (Government of Alberta, Provincial Geospatial Centre)",
                    "catalogue": "https://open.alberta.ca/opendata/gda-e201c640-1f76-429c-8c24-89ff496f956e",
                    "metadata": "https://geodiscover.alberta.ca/geoportal/rest/metadata/item/0999f0448e384d81981ff82b25656d16/xml",
                    "licence": "Open Government Licence - Alberta (modification and commercial use allowed with attribution)",
                    "attributionIfUsed": "Contains information licensed under the Open Government Licence - Alberta.",
                    "status": ("Not acquired, checksummed or compared with the bound file. Re-sourcing Alberta from it, "
                               "then re-running the AB district figures, would need its own owner decision. The licence "
                               "page itself returned HTTP 520 on 2026-09-18 and should be re-read before relying on it."),
                },
            },
            "quebec": {
                "boundArtifact": "Élections Québec 2026 electoral map shapefile (127 divisions), sha256 dd164f0ad5ff7e9f5366f26696d78b9c562ceb88b3a5ad664c22a8e158843677",
                "terms": "https://www.electionsquebec.qc.ca/en/our-institution/terms-of-use/",
                "reproductionAllowed": "download and reproduce for non-profit purposes",
                "requiredCredit": "mention the source and the copyright (©), and the author where named",
                "adaptation": "written permission required",
                "commercial": "written permission required",
                "prescribedAttributionSentence": None,
                "attributionIfPermitted": "Source : © Directeur général des élections du Québec et Commission de la représentation électorale, 2026.",
                "mapStatus": ("Enacted by the National Assembly on 2026-06-12, boundaries published in the Gazette "
                              "officielle on 2026-06-17, first used at the 2026-10-05 general election. The shapefile is "
                              "now publicly downloadable, which closes the 'accessible artifact' half of the blocker."),
                "whyAttributionAloneDoesNotClearIt": "Tiling the outlines and deriving figures from them is adaptation, which needs written permission.",
                "openDataAlternative": ("None found. Données Québec lists only a CSV of division names "
                                        "(Assemblée nationale, CC BY-NC 4.0) and no boundary geometry."),
            },
        },
        "alreadyPublishedFlag": ("The AB and QC provincial district outlines are already in the live boundary-overlays-v3 "
                                 "release, which records no rights basis for them. This packet does not fix that; it is "
                                 "raised for a separate owner decision."),
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
