#!/usr/bin/env python3
"""Phase 1 ledger: read each core source's publisher catalogue record.

Reads the CKAN package record of every Phase 1 core source that has one, four at
a time, and keeps the facts the publisher states: licence, update frequency,
contact, publication and modification dates, and version where declared. Each
entry binds the SHA-256 of the full response so the extract can be checked
against what the catalogue returned. Nothing is inferred: a field the catalogue
does not state is recorded as null.
"""
import concurrent.futures as cf, datetime, hashlib, json, sys, urllib.parse, urllib.request

CATALOGUES = {
    "open.canada.ca": "https://open.canada.ca/data/api/3/action/package_show?id=",
    "catalogue.data.gov.bc.ca": "https://catalogue.data.gov.bc.ca/api/3/action/package_show?id=",
    "open.alberta.ca": "https://open.alberta.ca/api/3/action/package_show?id=",
    "data.ontario.ca": "https://data.ontario.ca/api/3/action/package_show?id=",
    "donneesquebec.ca": "https://www.donneesquebec.ca/recherche/api/3/action/package_show?id=",
}
SEARCH = {
    "open.canada.ca": "https://open.canada.ca/data/api/3/action/package_search?rows=5&q=",
    "donneesquebec.ca": "https://www.donneesquebec.ca/recherche/api/3/action/package_search?rows=5&q=",
    "open.alberta.ca": "https://open.alberta.ca/api/3/action/package_search?rows=5&q=",
}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "WitnessTree-ledger-readback/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def first(value, *keys):
    for key in keys:
        if isinstance(value, dict) and value.get(key) not in (None, "", []):
            return value[key]
    return None


def extract(result):
    contact = first(result, "maintainer_email", "author_email", "contact_email", "contact-email")
    if not contact and isinstance(result.get("contact_point"), (list, dict)):
        contact = result["contact_point"]
    return {
        "title": first(result, "title_translated", "title"),
        "organization": (result.get("organization") or {}).get("title"),
        "licence": {"id": result.get("license_id"), "title": result.get("license_title"), "url": result.get("license_url")},
        "frequency": first(result, "frequency", "update_frequency", "publish_frequency", "record_publish_frequency"),
        "contact": contact,
        "published": first(result, "date_published", "record_create_date", "metadata_created", "date_issued"),
        "modified": first(result, "date_modified", "record_last_modified", "metadata_modified"),
        "version": first(result, "version", "edition"),
        "resourceUrls": [r.get("url") for r in result.get("resources", [])][:12],
    }


def read(entry):
    row, host, ident = entry["row"], entry["host"], entry.get("id")
    if not ident:
        hits = json.loads(get(SEARCH[host] + urllib.parse.quote(entry["search"])))["result"]["results"]
        chosen = [h for h in hits if entry["titleMustContain"].lower() in json.dumps(h.get("title_translated") or h.get("title")).lower()]
        if not chosen:
            return {"row": row, "host": host, "error": f"no catalogue match for {entry['search']!r}"}
        ident = chosen[0]["name"]
    raw = get(CATALOGUES[host] + urllib.parse.quote(ident))
    document = json.loads(raw)
    return {"row": row, "host": host, "id": ident, "apiUrl": CATALOGUES[host] + ident,
            "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "responseSha256": hashlib.sha256(raw).hexdigest(), "responseBytes": len(raw), "stated": extract(document["result"])}


ENTRIES = [
    {"row": "ntems-annual-land-cover", "host": "open.canada.ca", "id": "2785c103-9c2d-429b-9f3d-89f5cd9ea94d"},
    {"row": "ntems-forest-harvest", "host": "open.canada.ca", "id": "87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe"},
    {"row": "ntems-canopy-cover", "host": "open.canada.ca", "id": "5b905ab8-44dc-42b4-ad5b-3b1dde8423ab"},
    {"row": "ntems-canopy-height", "host": "open.canada.ca", "id": "016d2624-30b4-45f3-87d7-30b06c6a30ca"},
    {"row": "cwfis-current", "host": "open.canada.ca", "search": "\"Active Wildfires in Canada\"", "titleMustContain": "active wildfires"},
    {"row": "bc-wildfire", "host": "catalogue.data.gov.bc.ca", "id": "bc-wildfire-fire-perimeters-current"},
    {"row": "on-fire-disturbance", "host": "data.ontario.ca", "id": "in-year-fire-perimeters"},
    {"row": "qc-current-ecoforest", "host": "donneesquebec.ca", "search": "carte écoforestière à jour", "titleMustContain": "jour"},
    {"row": "qc-original-current-inventory", "host": "donneesquebec.ca", "search": "carte écoforestière originale", "titleMustContain": "originale"},
    {"row": "qc-fourth-inventory", "host": "donneesquebec.ca", "id": "resultats-d-inventaire-et-carte-ecoforestiere_4eme"},
    {"row": "ab-avi-crown", "host": "open.canada.ca", "id": "64b0e73a-da5f-4f7f-bca1-b656b6e86c94"},
    {"row": "ab-primary-land-vegetation", "host": "open.alberta.ca", "id": "gda-f640cd9d-c232-481d-9cff-7a7b66e51e49"},
]

if __name__ == "__main__":
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        results = []
        for entry, future in [(e, pool.submit(read, e)) for e in ENTRIES]:
            try:
                results.append(future.result())
            except Exception as error:  # recorded, never silently dropped
                results.append({"row": entry["row"], "host": entry["host"], "error": str(error)})
    json.dump({"schemaVersion": "witness-tree/phase1-catalogue-readback/1", "readAt": datetime.date.today().isoformat(),
               "entries": results}, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
    for r in results:
        print(r["row"], r.get("error") or (r["stated"]["frequency"], r["stated"]["contact"] if isinstance(r["stated"]["contact"], str) else "…", r["stated"]["modified"]))
