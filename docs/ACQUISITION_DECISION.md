# Acquisition decision required

**Status:** Object-storage decision required. No provider has been selected. Two compressed source archives have been downloaded to a separate local staging tree and verified. A verified lossless Québec layer copy exists in local derived storage; no immutable object-storage write, ingestion, or production-data release has occurred.

This record turns the approved architecture into an owner decision. It does not recommend a storage vendor.

## Verified priority-source compressed volumes

| Priority artifact | Compressed bytes |
| --- | ---: |
| NRCan annual forest-land-cover volume | 58,954,694,668 |
| NRCan 2022 canopy-cover ZIP | 9,954,395,939 |
| NRCan 2022 canopy-height ZIP | 10,347,564,066 |
| Québec ecoforest volume | 12,399,475,076 |
| Québec historical detailed-fire GeoPackage | 414,244,435 |
| Alberta AVI Crown FGDB ZIP | 557,041,258 |
| **Minimum one-snapshot sum** | **92,627,415,442** |

The sum is a minimum for one retained compressed snapshot of these six candidate artifacts only. It excludes all other required sources, repeat retrievals, live-fire snapshots, metadata sidecars, derived products, backups, and retained historical versions. Ontario FRI Term 2 is also excluded because only its web explorer, not a downloadable data artifact, has been verified. CA Forest Harvest was previously excluded because its official catalogue named a harvest ZIP while linking to a fire-named ZIP; that conflict is now resolved and the section below records how.

## Phase 2 endpoint resolution

This section records only endpoint resolution. Nothing below is acquired, staged, ingested, or approved for production. No payload was downloaded. Every byte length quoted here is a `Content-Length` response header observed on a `curl -sIL` HEAD request on 11 August 2026, America/Vancouver.

| Source | Outcome | Endpoint | Status and length |
| --- | --- | --- | --- |
| CA Forest Harvest (1985–2022) | Resolved | `https://opendata.nfis.org/downloads/forest_change/CA_Forest_Harvest_1985-2022.zip` | 200, `application/zip`, 247,945,479 bytes |
| CA Forest Wildfire (1985–2022) | Resolved | `https://opendata.nfis.org/downloads/forest_change/CA_Forest_Fire_1985-2022.zip` | 200, `application/zip`, 252,364,563 bytes |
| NTEMS annual land cover (1984–2022) | Resolved as a 39-file series | `https://opendata.nfis.org/downloads/forest_change/CA_forest_VLCE2_{YEAR}.zip` | 1984: 200, 1,520,973,970 bytes. 2022: 200, 1,535,510,211 bytes |
| Ontario FRI Term 2 (2018–2028) | Unresolved | none found | no data endpoint exists to test |

### 1. CA Forest Harvest catalogue conflict: resolved

The conflict was real and is confirmed. The open.canada.ca record `87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe` carries a resource named `CA_Forest_Harvest_1985-2022.zip` whose URL points at `CA_Forest_Fire_1985-2022.zip`.

Three independent lines of evidence resolve it as a publisher-side link error in the harvest record, not an artifact-identity problem:

1. The Canadian Forest Service NTEMS distribution page links "CA Forest Harvest 1985-2022" to `CA_Forest_Harvest_1985-2022.zip`, and links a separate product, "Wildfire change year 1985-2022", to `CA_Forest_Fire_1985-2022.zip`.
2. The fire-named ZIP is the declared resource of a different open.canada.ca record, CA Forest Wildfire (1985-2022), `0673c58e-f787-4ef3-90e3-eb5f991b3a72`.
3. The two ZIPs are distinct artifacts with different lengths, and the opening bytes of each name an internal member matching its own file name: `CA_Forest_Harvest_1985-2022.lyr` and `CA_Forest_Fire_1985-2022.lyr` respectively.

Both records carry Open Government Licence - Canada (`ca-ogl-lgo`), publisher Natural Resources Canada, update frequency as needed, and temporal coverage 1985 to 2022.

Still open: the publisher has not corrected the open.canada.ca resource URL, so any future automated harvest of that record will still pull the wrong file. Attribution wording, checksum, retrieval, and storage and compute approval remain open.

### 2. Ontario FRI Term 2: unresolved, and the reason is not a missing link

There is no open bulk endpoint for Term 2. This is a genuine absence, established by exhausting the plausible routes rather than by a failed guess:

- The `data.ontario.ca` record carries exactly two resources, both of format `WEB`: the English and French GeoHub explore pages. It carries no resource of any downloadable format.
- The English GeoHub resource resolves to ArcGIS Online item `ca6def13e17540deb6e91d81e9cb2c89`, whose type is **Web Map** and whose item `url` field is empty. A Web Map is a map document and has no data download endpoint. A HEAD on the explore URL returns 200 `text/html`, which is the explorer page, not a payload.
- That Web Map's only operational layers are a Forest Management Unit boundary service and a Romeo Malette Forest boundary service. Neither carries Term 2 stand polygons.
- The FRI Packaged Product Catalogue table lists 94 packaged products, but their vintages run 1995 to 2011 and the rows hold bare file names with no base URL.
- The Packaged Products Version 2 item does publish 78 direct ZIP links, but their vintages run 2007 to 2016, so every one predates the 2018 start of Term 2. A HEAD on one of them returned 200, `application/zip`, 210,935,203 bytes. The host serves data correctly, which is what makes the absence of Term 2 packages a real gap rather than a broken host.

The actual access route is a request, not a download: the Forest Cover request form at `https://forms.office.com/Pages/ResponsePage.aspx?id=KRLczSqsl0u3ig5crLWGXNa0411DWIhEm5hXfTKiiaZUOFEyUVBaRzdLU1ZTTEZYMzFXQzIzNEhHRCQlQCN0PWcu`, and the contact `info.mnrfscience@ontario.ca` published on `https://www.ontario.ca/page/forest-resources-inventory`.

Two terms findings that matter before anyone requests the data. The catalogue states the Term 2 packaged products are **draft** data supplied for consultation and product development, that attributes and formats will change, and that they are not a final version. And the Forest Cover item attaches an Electronic Intellectual Property notice from the ministry rather than the Open Government Licence that the dataset record advertises, so the licence governing a released Term 2 package is not settled.

### 3. NTEMS annual forest change: resolved, but not as one artifact

There is no single NTEMS artifact covering annual forest change from 1984 to the present. Enumerating every NRCan resource under `opendata.nfis.org/downloads/forest_change/` returned 119 resources and no such file. The correct reading of the NTEMS distribution is that annual change is carried by three resolved products:

- the annual land cover data cube, `CA_forest_VLCE2_{YEAR}.zip`, 39 files, 1984 to 2022 inclusive;
- harvest change year, `CA_Forest_Harvest_1985-2022.zip`; and
- wildfire change year, `CA_Forest_Fire_1985-2022.zip`.

Two limits are worth recording plainly. First, "to present" is not available: the NTEMS temporal endpoint is 2022, not 2026, and a separate 2023 fire-only file exists but does not extend the annual series. Second, the legacy C2C change-year series stops at 2015 and is partly dead: a HEAD on `C2C_Change_Year_1985_2011.zip` follows a redirect to `http://nfis.org/notfound_bi.html` and returns a 621-byte `text/html` not-found page rather than a payload. It should not be treated as an available endpoint. `C2C_change_year_2012_2015.zip` does return 200 `application/zip`.

Only 2 of the 39 annual land-cover files were HEAD-observed, so the series total is not established here and the number carried in the priority-volume table above is unchanged by this work.

Unconfirmed until selected resources are retrieved and profiled:

- uncompressed working space;
- transform, intermediate, analytics, tile, and release volumes;
- CDN and user-download egress; and
- compute time, memory, scratch storage, and transfer costs.

## Required design constraints

The approved plan requires immutable object storage: one source/retrieval prefix with checksum and metadata sidecar, without overwriting a prior source or published result. Raw snapshots must remain reproducible with their recorded method version. See [the plan’s architecture and controls](../../work/witness-tree-plan.md#7-architecture) and [raw-archive contract](RAW_ARCHIVE.md).

Provisioning must distinguish **development**, **data review**, **staging**, and **production**. Data review is a required human-review boundary before staging; it is not a production environment. See [plan section 7.2](../../work/witness-tree-plan.md#72-environments-and-non-negotiable-controls).

## Decisions needed from owners

Before any multi-gigabyte acquisition, record approval for:

1. Storage provider, Canadian region/data-residency requirements, budget ceiling, retention period, immutability/versioning controls, backup/recovery, and egress policy.
2. Processing compute: owner, region, approved spend limit, scratch capacity, and operational access/secret handling.
3. Checksum and archive procedure: SHA-256 capture, metadata sidecar fields, key naming, prior-snapshot links, and verification responsibility.
4. Legal and attribution approval for every selected resource, including redistribution and any required publisher wording.
5. The exact selected artifacts and versions—including whether each priority source is approved for the first acquisition.

The owner authorized large dataset acquisition on 11 August 2026. That authorization permits staged downloads, but it does not resolve object-storage, compute, attribution, retention, or production-release decisions. [Source verification](SOURCE_VERIFICATION.md) records the current source/rights distinctions, and [external gates](EXTERNAL_GATES.md) remain open.

## Simplest staged option

The first two real transfers validated the 414,244,435-byte Québec historical-fire ZIP and 557,041,258-byte Alberta AVI ZIP: exact lengths, ZIP integrity, and SHA-256 passed. Their evidence is in [`data/staged-acquisitions.json`](../data/staged-acquisitions.json), while the 971,285,693 bytes remain outside Git in the separate staging tree. Québec attribution is metadata-verified. Alberta attribution and its geometry repair-or-quarantine policy remain open. Continue staged, resumable downloads only within available local capacity. Promotion to immutable object storage still requires the decisions above.

## Claude Code continuation

From the repository root:

```sh
cd /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree
sed -n '1,140p' docs/IMPLEMENTATION_STATUS.md
sed -n '1,220p' docs/SOURCE_VERIFICATION.md
sed -n '1,220p' docs/ACQUISITION_DECISION.md
git diff --check
git status --short
```

**Next step:** complete and verify the authorized staging transfers, obtain the remaining owner decisions, then copy verified bytes and sidecars into approved immutable object storage. Do not claim production readiness until that evidence exists.
