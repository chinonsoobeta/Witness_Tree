#!/usr/bin/env python3
"""Phase 1 ledger facts for the 16 incomplete core rows (2026-09-26).

Fills only the fields the field audit reports missing. Every value is either
copied from a checked-in record (publisher catalogue readback, staging and
profile records, source decisions) or authored by Witness Tree and marked as
such, and every field carries a one-line basis naming where it came from.
scripts/populate-phase1-source-ledger-field-audit.mjs binds each value into the
audit by JSON pointer, so a changed value breaks the binding.

Formats follow the two complete federal rows: dates as strings, transformations
and plain-language explanations as objects, refresh as {status, reason}, bulk
redistribution as a boolean, correction routes as an object.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
read = lambda p: json.loads((ROOT / p).read_text())
cat = {e["row"]: e for e in read("data/phase1-catalogue-readback-2026-09-26.json")["entries"]}
vlce2 = read("data/vlce2-promotion-preparation.json")["entries"]
qc_exec = read("data/phase1-qc-current-ecoforest-execution-approval.json")
qc4 = read("data/qc-fourth-inventory-evidence.json")
elect = read("data/provincial-electoral-sources-2026-09-18.json")
bc_el = read("data/bc-provincial-electoral-2023-profile.json")
on_el = read("data/on-electoral-2022-profile.json")
cwfis_now = read("data/cwfis-current-active-fires-profile.json")
CORRECTIONS = {"internalEn": "/en/corrections", "internalFr": "/fr/corrections"}

LICENCE = {
    "ogl-canada": "allowed-under-ogl-canada-2.0-with-required-attribution",
    "ogl-bc": "allowed-under-ogl-bc-2.0-with-required-attribution",
    "ogl-alberta": "allowed-under-ogl-alberta-2.2-with-required-attribution",
    "ogl-ontario": "allowed-under-ogl-ontario-1.0-with-required-attribution",
    "cc-by": "allowed-under-cc-by-4.0-with-attribution-and-indication-of-changes",
}
LICENCE_BASIS = {
    "ogl-canada": "Open Government Licence - Canada 2.0: copy, modify, publish, adapt and distribute in any medium, with attribution.",
    "ogl-bc": "Open Government Licence - British Columbia 2.0: copy, modify, publish, adapt and distribute in any medium, with attribution.",
    "ogl-alberta": "Open Government Licence - Alberta 2.2: copy, modify, publish, adapt and distribute in any medium, with attribution.",
    "ogl-ontario": "Open Government Licence - Ontario 1.0: copy, modify, publish, adapt and distribute in any medium, with attribution.",
    "cc-by": "Creative Commons Attribution 4.0: copy, redistribute and adapt in any medium or format, with attribution and an indication of changes.",
}


def contact(row, email, source):
    return {**CORRECTIONS, "publisherContact": email, "publisherContactSource": source}


def refresh(status, reason):
    return {"status": status, "reason": reason}


rows, basis = {}, {}


def put(row, field, value, why):
    rows.setdefault(row, {})[field] = value
    basis.setdefault(row, {})[field] = why


def rights(row, licence):
    put(row, "redistributionStatus", LICENCE[licence], LICENCE_BASIS[licence])
    put(row, "bulkRedistributionAllowed", True, f"{LICENCE_BASIS[licence]} The licence sets no limit on volume or medium.")


def stated(row):
    return cat[row]["stated"]


CATALOGUE = "data/phase1-catalogue-readback-2026-09-26.json"

# --- NTEMS: annual land cover, harvest, canopy cover, canopy height -----------
for row, title_en, title_fr, explain_en, explain_fr, transform in [
    ("ntems-annual-land-cover", "annual land cover", "couverture terrestre annuelle",
     "A satellite map of Canada's land cover for every year from 1984 to 2022 at 30 m. Witness Tree uses it to find where tree cover was lost.",
     "Une carte satellitaire de la couverture terrestre du Canada pour chaque année de 1984 à 2022, à 30 m. Arbre témoin s'en sert pour repérer les pertes de couvert arboré.",
     {"summary": "Used on its native 30 m EPSG:3978 grid without reprojection. Derived: the Version 2.1 interval rasters, the per-cell loss patches, province and district zonal totals, and the condition-and-recovery classes.",
      "records": ["data/phase2-v21-raster-readback-evidence.json", "data/phase2-per-cell-annual-series.json", "data/phase4-condition-recovery-v2.json"]}),
    ("ntems-forest-harvest", "harvest year", "année de récolte",
     "A satellite record of where forest was harvested in Canada, with the year each harvest was first seen, from 1985 to 2022.",
     "Un registre satellitaire des endroits où la forêt a été récoltée au Canada, avec l'année où chaque récolte a été vue pour la première fois, de 1985 à 2022.",
     {"summary": "Cross-tabulated with annual land cover by province and year to publish the harvest and fire series, and used to attribute a cause to detected loss.",
      "records": ["data/harvest-fire-province-annual-series.json", "data/phase2-per-cell-annual-series.json"]}),
    ("ntems-canopy-cover", "canopy cover", "couvert forestier",
     "A satellite estimate of how much of the ground the tree canopy covered across Canada in 2022.",
     "Une estimation satellitaire de la part du sol couverte par la canopée au Canada en 2022.",
     {"summary": "Profiled and staged only. No derived product is published from it.", "records": ["data/nrcan-canopy-cover-profile.json"]}),
    ("ntems-canopy-height", "canopy height", "hauteur de la canopée",
     "A satellite estimate of how tall the forest canopy was across Canada in 2022.",
     "Une estimation satellitaire de la hauteur de la canopée au Canada en 2022.",
     {"summary": "Profiled and staged only. No derived product is published from it.", "records": ["data/nrcan-canopy-height-profile.json"]}),
]:
    s = stated(row)
    put(row, "editionEffectiveDate", s["published"][:10], f"Catalogue date_published in {CATALOGUE}; the publisher declares no separate edition.")
    put(row, "transformations", transform, "Witness Tree's own processing, from the records named in the value.")
    rights(row, "ogl-canada")
    put(row, "plainLanguageExplanation", {"en": explain_en, "fr": explain_fr}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
    put(row, "nextExpectedRefresh", refresh("unknown", f"The publisher states it updates as needed ({s['frequency']}) and announces no release date."), f"Catalogue frequency in {CATALOGUE}.")
    put(row, "correctionContactRoute", contact(row, s["contact"], "publisher catalogue maintainer"), f"Catalogue maintainer email in {CATALOGUE}.")

annual = "ntems-annual-land-cover"
put(annual, "retrievalDate", {"first": min(e["retrievedAt"] for e in vlce2), "last": max(e["retrievedAt"] for e in vlce2), "archives": len(vlce2)},
    "Per-archive retrievedAt in data/vlce2-promotion-preparation.json.")
put(annual, "checksum", {"algorithm": "sha256", "archives": len(vlce2), "perArchiveRecord": "data/vlce2-promotion-preparation.json", "first": vlce2[0]["sha256"], "last": vlce2[-1]["sha256"]},
    "One SHA-256 per annual archive in data/vlce2-promotion-preparation.json.")
put(annual, "schema", {"format": "single-band GeoTIFF per year, 30 m, EPSG:3978", "classCodes": [0, 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230]},
    "Class codes as profiled in the WP2 provincial annual series (docs/FALL_DOWN_WP2_ANNUAL_SERIES_STAGING.md).")
put(annual, "modificationNotice", "Adapted by Witness Tree from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). This does not constitute an endorsement by Natural Resources Canada.",
    "The adaptation notice the site already shows (components/transparency/DataPage.tsx).")
put(annual, "datasetOriginalName", "Annual High-resolution forest land cover for Canada (1984-2022)", f"Catalogue title in {CATALOGUE}.")

# --- Current wildfire feeds ---------------------------------------------------
fires = {
    "cwfis-current": ("ogl-canada", "2026-08-14", "Canada's national record of active wildfires, as a snapshot taken for the site.", "Le registre national des feux de forêt actifs au Canada, sous forme d'instantané pris pour le site.",
                      refresh("continuous", "An operational service updated through the fire season; the publisher states no fixed cadence."), contact("cwfis-current", "cwfissa-csscifv@nrcan-rncan.gc.ca", "CWFIS program contact in the CWFIS ISO catalogue record")),
    "bc-wildfire": ("ogl-bc", "2026-08-14", "British Columbia's current wildfire perimeters, as a snapshot taken for the site.", "Les périmètres actuels des feux de forêt en Colombie-Britannique, sous forme d'instantané pris pour le site.",
                    refresh("continuous", "The publisher lists the shapefile resource as continually updated."), contact("bc-wildfire", stated("bc-wildfire")["contact"], "catalogue point of contact")),
    "ab-wildfire": ("ogl-alberta", "2026-08-14", "Alberta's current wildfire locations, as a snapshot taken for the site.", "Les emplacements actuels des feux de forêt en Alberta, sous forme d'instantané pris pour le site.",
                    refresh("continuous", "An operational service; the publisher states no fixed cadence."), contact("ab-wildfire", "wildfireinfo@gov.ab.ca", "the publisher's Wildfire maps and data page")),
    "on-fire-disturbance": ("ogl-ontario", "2026-08-14", "Ontario's in-year fire perimeters, as a snapshot taken for the site.", "Les périmètres des feux de l'année en Ontario, sous forme d'instantané pris pour le site.",
                            refresh("continuous", "The publisher states daily updates."), contact("on-fire-disturbance", stated("on-fire-disturbance")["contact"], "catalogue maintainer")),
}
for row, (licence, snapshot, en, fr, next_refresh, route) in fires.items():
    put(row, "editionEffectiveDate", snapshot, "An operational layer with no declared edition; the date is the staged snapshot's (data/staged-acquisitions.json).")
    rights(row, licence)
    put(row, "plainLanguageExplanation", {"en": en, "fr": fr}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
    put(row, "nextExpectedRefresh", next_refresh, "Publisher statement recorded in the catalogue readback or source profile.")
    put(row, "correctionContactRoute", route, "Publisher contact recorded in the catalogue readback.")
for row in ("ab-wildfire", "on-fire-disturbance"):
    put(row, "updateCadence", "continuous operational service" if row == "ab-wildfire" else stated(row)["frequency"], "Publisher statement recorded in the catalogue readback.")

# --- NBAC -----------------------------------------------------------------------
nbac = "cwfis-historical"
put(nbac, "datasetTitle", "National Burned Area Composite (NBAC) 1972-2025", "ISO catalogue title with the release's year span.")
put(nbac, "datasetOriginalName", "National Burned Area Composite (NBAC)", "ISO catalogue title.")
put(nbac, "editionEffectiveDate", "2026-05-13", "ISO catalogue publication date of the 20260513 release.")
put(nbac, "updateCadence", "annually", "ISO catalogue maintenance and update frequency.")
put(nbac, "transformations", {"summary": "Profiled only; 49 self-intersecting rings quarantined without repair. No derived product is published.", "records": ["data/phase1-nbac-profile-2026-08-27.json"]}, "From the NBAC profile.")
put(nbac, "modificationNotice", "Adapted by Witness Tree from Canadian Forest Service, National Burned Area Composite (NBAC). This does not constitute an endorsement by Natural Resources Canada.", "Required citation in data/phase1-nbac-profile-2026-08-27.json, with the adaptation notice.")
rights(nbac, "ogl-canada")
put(nbac, "plainLanguageExplanation", {"en": "Canada's national map of areas burned by wildfire each year since 1972.", "fr": "La carte nationale des superficies brûlées par les feux de forêt au Canada chaque année depuis 1972."}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
put(nbac, "nextExpectedRefresh", refresh("expected-annually", "The publisher updates the composite annually; no release date is announced."), "ISO catalogue maintenance frequency.")
put(nbac, "correctionContactRoute", contact(nbac, "cwfissa-csscifv@nrcan-rncan.gc.ca", "ISO catalogue contact"), "ISO catalogue contact in the readback.")

# --- Québec ---------------------------------------------------------------------
QC_CONTACT = stated("qc-current-ecoforest")["contact"]
for row, en, fr in [
    ("qc-current-ecoforest", "Québec's forest inventory map, kept up to date with harvests, fires and other disturbances.", "La carte écoforestière du Québec, tenue à jour avec les coupes, les feux et les autres perturbations."),
    ("qc-original-current-inventory", "Québec's original forest inventory map from its fourth inventory, before later updates.", "La carte écoforestière originale du quatrième inventaire du Québec, avant les mises à jour."),
    ("qc-fourth-inventory", "The results of Québec's fourth forest inventory, 2001 to 2018.", "Les résultats du quatrième inventaire forestier du Québec, de 2001 à 2018."),
]:
    rights(row, "cc-by")
    put(row, "plainLanguageExplanation", {"en": en, "fr": fr}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
    put(row, "nextExpectedRefresh", refresh("expected-annually", f"The publisher states annual updates; no release date is announced. Last catalogue update {stated(row)['modified'][:10]}."), f"Catalogue frequency and modification date in {CATALOGUE}.")
    put(row, "correctionContactRoute", contact(row, QC_CONTACT, "catalogue maintainer"), f"Catalogue maintainer email in {CATALOGUE}.")
for row in ("qc-original-current-inventory", "qc-fourth-inventory"):
    put(row, "updateCadence", stated(row)["frequency"], f"Catalogue frequency in {CATALOGUE}.")
cur = "qc-current-ecoforest"
put(cur, "editionEffectiveDate", stated(cur)["modified"][:10], f"Catalogue modification date in {CATALOGUE}; the map is updated annually and declares no edition.")
put(cur, "retrievalDate", "2026-08-14", "Raw acquisition directory raw/qc-current-ecoforest/2026-08-14 named by the execution approval.")
put(cur, "checksum", qc_exec["inputBinding"]["rawArchiveSha256"], "Raw archive SHA-256 bound by data/phase1-qc-current-ecoforest-execution-approval.json.")
put(cur, "archiveVersion", "undeclared", "The publisher declares no version for the archive.")
put(cur, "coverage", "Québec's managed forest territory, south of the northern limit of timber allocation, with disturbances recorded to the latest annual update", "Publisher description of the up-to-date ecoforest map.")
put(cur, "schema", {"layer": qc_exec["inputBinding"]["layer"], "featureCount": qc_exec["inputBinding"]["featureCount"], "keyFields": ["geoc_maj", "origine", "an_origine", "perturb", "an_perturb"]}, "Layer and count bound by the execution approval; key fields read from the GeoPackage.")
put(cur, "transformations", {"summary": "Stand-origin disturbances (harvest, fire, insect, windthrow) with their year are normalized into official records for Phase 4 matching. The stand-copy transformation is approved but not executed.", "records": ["data/phase4-provincial-matching-report.json", "data/phase1-qc-current-ecoforest-execution-approval.json"]}, "Witness Tree's own processing.")
put(cur, "modificationNotice", "Adapted by Witness Tree from the Ministère des Ressources naturelles et des Forêts, Carte écoforestière à jour (CC BY 4.0). Changes: stand-origin disturbances selected, reprojected and rasterized to a 30 m grid.", "CC BY 4.0 requires an indication of changes.")
put(cur, "datasetOriginalName", "Carte écoforestière à jour", f"Catalogue title in {CATALOGUE}.")
for row in ("qc-original-current-inventory", "qc-fourth-inventory"):
    put(row, "transformations", {"summary": "Profiled and archived only. The stand-copy transformation is approved but not executed; no derived product is published.", "records": ["data/qc-fourth-inventory-evidence.json"]}, "Witness Tree's own processing.")
q4 = "qc-fourth-inventory"
put(q4, "retrievalDate", "2026-08-14", "Publisher records in data/qc-fourth-inventory-evidence.json sit under raw/qc-fourth-inventory/2026-08-14.")
put(q4, "archiveVersion", qc4["dataset"]["edition"], "Edition statement in data/qc-fourth-inventory-evidence.json.")
put(q4, "modificationNotice", "Adapted by Witness Tree from the Ministère des Ressources naturelles et des Forêts, Carte écoforestière originale et résultats du quatrième inventaire (CC BY 4.0). No changes are published.", "CC BY 4.0 requires an indication of changes.")
put(q4, "datasetOriginalName", qc4["dataset"]["title"], "Title in data/qc-fourth-inventory-evidence.json.")

# --- Alberta inventories ----------------------------------------------------------
for row, en, fr in [
    ("ab-avi-crown", "Alberta's vegetation inventory of Crown forest land.", "L'inventaire de la végétation des terres forestières de la Couronne de l'Alberta."),
    ("ab-avi-post-harvest", "The harvest areas recorded after Alberta's Crown vegetation inventory was made.", "Les superficies récoltées consignées après l'inventaire de la végétation des terres de la Couronne de l'Alberta."),
    ("ab-primary-land-vegetation", "Alberta's primary land and vegetation inventory of the settled and rangeland areas.", "L'inventaire primaire des terres et de la végétation de l'Alberta pour les zones peuplées et de parcours."),
]:
    source = "ab-avi-crown" if row == "ab-avi-post-harvest" else row
    s = stated(source)
    put(row, "editionEffectiveDate", s["published"][:10], f"Catalogue date_published in {CATALOGUE}; the publisher declares no separate edition.")
    put(row, "transformations", {"summary": "Profiled and staged only. No derived product is published.", "records": ["data/staged-geospatial-profile.json"]}, "Witness Tree's own processing.")
    rights(row, "ogl-alberta")
    put(row, "plainLanguageExplanation", {"en": en, "fr": fr}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
    put(row, "nextExpectedRefresh", refresh("unknown", f"The publisher states {s['frequency'] or 'no'} update frequency and announces no release date."), f"Catalogue frequency in {CATALOGUE}.")
    put(row, "correctionContactRoute", contact(row, s["contact"], "catalogue maintainer"), f"Catalogue maintainer email in {CATALOGUE}.")
put("ab-avi-post-harvest", "datasetTitle", "Alberta Vegetation Inventory (AVI) Crown: AVI_PostInventoryHarvest layer", "Catalogue title with the layer name in data/staged-geospatial-profile.json.")
put("ab-avi-post-harvest", "updateCadence", stated("ab-avi-crown")["frequency"], "Same catalogue record as AVI Crown.")
put("ab-primary-land-vegetation", "updateCadence", "not stated by the publisher", f"The catalogue record in {CATALOGUE} states no frequency.")

# --- Provincial electoral boundaries (four components) ---------------------------
pe = "provincial-electoral-boundaries"
ab, qc = elect["alberta"], elect["quebec"]
components = {
    "BC": {"publisher": "Elections BC", "datasetTitle": "Provincial electoral districts, 2023", "sourceUrl": bc_el["source"]["catalogueUrl"], "licence": "Elections BC Open Data Licence", "licenceUrl": bc_el["source"]["licenceUrl"], "retrievalDate": bc_el["retrievedAt"], "checksum": bc_el["artifact"]["sha256"], "schema": {"featureCount": bc_el["profile"]["featureCount"], "fields": bc_el["profile"]["fields"]}, "attribution": bc_el["source"]["attribution"]},
    "AB": {"publisher": ab["source"]["publisher"], "datasetTitle": ab["source"]["datasetTitle"], "sourceUrl": ab["source"]["sourceUrl"], "licence": ab["licence"]["id"], "licenceUrl": ab["licence"]["url"], "retrievalDate": ab["source"]["retrievedAt"], "checksum": ab["source"]["artifact"]["sha256"], "schema": {"featureCount": ab["source"]["featureCount"]}, "attribution": "Contains information licensed under the Open Government Licence - Alberta."},
    "ON": {"publisher": "Elections Ontario", "datasetTitle": "Electoral district shapefiles, 2022", "sourceUrl": "https://www.elections.on.ca/en/voting-in-ontario/electoral-district-shapefiles.html", "licence": "Elections Ontario Open Use Data Product Licence", "licenceUrl": on_el["licence"]["url"], "retrievalDate": "2026-08-14", "checksum": on_el["artifact"]["sha256"], "schema": {"featureCount": on_el["profile"]["count"], "fields": on_el["profile"]["fields"]}, "attribution": "Elections Ontario"},
    "QC": {"publisher": qc["whatIsReused"]["publisher"], "datasetTitle": "Circonscriptions électorales provinciales, 2026 (sans eau)", "sourceUrl": qc["whatIsReused"]["sourceUrl"], "licence": "Élections Québec terms of use", "licenceUrl": qc["publisherTerms"]["url"], "retrievalDate": "2026-09-18", "checksum": qc["whatIsReused"]["artifact"]["sha256"], "schema": {"featureCount": qc["whatIsReused"]["featureCount"], "idField": qc["whatIsReused"]["idField"], "nameField": qc["whatIsReused"]["nameField"]}, "attribution": qc["credit"]["en"]},
}
for field in ("publisher", "datasetTitle", "sourceUrl", "licence", "licenceUrl", "retrievalDate", "checksum", "schema"):
    put(pe, field, {p: c[field] for p, c in components.items()}, "Per-province component values from the electoral profiles and data/provincial-electoral-sources-2026-09-18.json.")
put(pe, "requiredAttribution", {p: c["attribution"] for p, c in components.items()}, "Per-province attribution from the same records.")
put(pe, "editionEffectiveDate", {"BC": "2023 boundaries", "AB": "2019 boundaries (Provincial Electoral Division - Current 2019)", "ON": "2022 boundaries", "QC": qc["whatIsReused"].get("edition", "2026 electoral map")}, "Boundary editions named by each component record.")
put(pe, "archiveVersion", {"BC": "2023", "AB": "Current 2019", "ON": "2022", "QC": "2026"}, "Edition labels of the four components.")
put(pe, "coverage", "British Columbia, Alberta, Ontario and Québec provincial electoral districts, one current edition per province", "The four component records.")
put(pe, "transformations", {"summary": "Reprojected and tiled for the provincial-riding overlay and used for district comparisons. Québec's outlines, names and identifiers are reused unchanged, as its terms require.", "records": ["data/provincial-electoral-sources-2026-09-18.json", "data/boundary-overlay-release.json"]}, "Witness Tree's own processing.")
put(pe, "redistributionStatus", {"BC": "allowed-under-elections-bc-open-data-licence", "AB": LICENCE["ogl-alberta"], "ON": "allowed-under-elections-ontario-open-use-data-product-licence", "QC": "reuse-unchanged-for-non-profit-purposes-with-credit"}, "Licence terms recorded per component.")
put(pe, "bulkRedistributionAllowed", {"BC": True, "AB": True, "ON": True, "QC": False}, "Québec's terms allow reproduction without adaptation for non-profit purposes; Witness Tree does not offer its outlines for bulk download.")
put(pe, "modificationNotice", "British Columbia, Alberta and Ontario outlines are reprojected and tiled by Witness Tree. Québec's outlines are reused unchanged. No publisher endorsement is implied.", "From the component records' reuse conditions.")
put(pe, "datasetOriginalName", {"BC": "Provincial Electoral Districts", "AB": "Provincial Electoral Division - Current 2019", "ON": "Electoral District Shapefile", "QC": "Circonscriptions électorales provinciales"}, "Original-language dataset names of the components.")
put(pe, "plainLanguageExplanation", {"en": "The boundaries of provincial ridings in the four provinces, used to compare forest loss between ridings.", "fr": "Les limites des circonscriptions provinciales des quatre provinces, utilisées pour comparer les pertes forestières entre circonscriptions."}, "Authored by Witness Tree; French is a draft awaiting bilingual review.")
put(pe, "updateCadence", "when each province redraws its electoral map; no fixed calendar", "Electoral boundaries change by redistribution, not on a schedule.")
put(pe, "nextExpectedRefresh", refresh("unknown", "Each province publishes new boundaries after a redistribution; no date is announced."), "Electoral redistribution practice.")
put(pe, "correctionContactRoute", {**CORRECTIONS, "publisherListing": {"BC": bc_el["source"]["catalogueUrl"], "AB": ab["source"]["catalogueUrl"], "ON": "https://www.elections.on.ca/en/voting-in-ontario/electoral-district-shapefiles.html", "QC": qc["publisherTerms"]["url"]}}, "Each component's publisher listing.")

out = {
    "schemaVersion": "witness-tree/phase1-ledger-facts/1",
    "recordedOn": "2026-09-26",
    "notice": "Values for the Phase 1 core ledger fields the field audit reported missing on 2026-09-26. Publisher facts are copied from the catalogue readback and existing records; plain-language explanations, transformations and notices are Witness Tree's own and say so. French text is a draft awaiting bilingual review.",
    "rows": rows,
    "basis": basis,
}
(ROOT / "data/phase1-ledger-facts-2026-09-26.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print({row: len(fields) for row, fields in rows.items()})
