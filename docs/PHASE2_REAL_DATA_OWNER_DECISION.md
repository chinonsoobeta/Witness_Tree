# Phase 2 real-data owner decision

The owner decision was recorded for a real, versioned, **non-production** 1984–2022 national forest-mask and detected-change run. It does not authorize production use, release, external compute/storage, or all-eight-geography aggregates. The normalized decision is in [`data/phase2-real-data-owner-decision.json`](../data/phase2-real-data-owner-decision.json). The full-byte local source preflight is recorded in [`data/phase2-real-national-preflight.json`](../data/phase2-real-national-preflight.json); it stopped before execution because the executable method remains synthetic-only, real raster/crosswalk adapters do not exist, and local output headroom is not demonstrated.

## Evidence-backed recommendation

Use VLCE2 classes `210 coniferous`, `220 broadleaf`, and `230 mixedwood` as the conservative operational forest proxy; preserve `0 unclassified` and `255 nodata` as Unknown. The only unresolved class choice is `81 wetland_treed`: including it may capture qualifying treed wetlands, but the existing publisher metadata does not prove that every class-81 cell meets the registered NFI thresholds. Either crosswalk must be labelled as a VLCE2 proxy rather than a pixel-level measurement of the one-hectare, 10% crown-closure and five-metre mature-height definition.

Authorize the exact checksum-bound 1985–2022 NRCan harvest and wildfire rasters only as historical national corroboration and precedence inputs. Each records the year of greatest mapped disturbance per pixel, not every event. Neither supports live, complete, operational, legal-cutblock, damage, absence, or post-2022 claims.

Run one windowed year-pair worker at a time, with hard caps of 8 vCPU, 16 GiB RAM, 2 TiB local temporary-plus-derived storage, and 96 elapsed hours. The grid contains 970,700,103,360 cell-years; one-byte annual masks are 970.7 GB before compression. A cap breach must abort and return measurements for a new decision.

## Boundary decision

Every geography needs an authoritative publisher, exact edition/date and archive SHA-256, stable edition-qualified IDs, bilingual names or a documented mapping, polygon/schema/count/coverage/CRS/geometry validation, reuse terms and attribution, local readback, and vector reprojection into the exact VLCE2 WKT. VLCE2 must never be reprojected or resampled.

Three candidates are evidenced but not admitted: Statistics Canada 2021 province/territory, Statistics Canada 2021 Census Subdivision (only if the owner accepts CSD as the product municipality unit), and Elections Canada’s 2025 archive on the 2023 Representation Order. Watershed and forest-district lack evidenced national authoritative editions; provincial-riding coverage is incomplete; reserve and treaty-area authority, editions, rights and engagement remain blocked. Therefore an owner decision can unlock the national mask/change run, but not all-eight-geography aggregation.

## Copy-paste owner decision

Copy this block, replace every angle-bracket value, and do not delete a line:

```text
PHASE 2 VERSIONED NON-PRODUCTION PROCESSING DECISION
owner_name=<legal or accountable owner name>
recorded_at=<UTC YYYY-MM-DDTHH:MM:SSZ>
forest_crosswalk=<conservative-treed-upland-v1 | include-treed-wetland-v1>
approve_exact_harvest_scope=<yes | no>
approve_exact_wildfire_scope=<yes | no>
approve_compute_caps_8vcpu_16gib_2tib_96h_single_pair=<yes | no>
approve_national_1984_2022_mask_and_change_run=<yes | no>
province_boundary=<accept-statcan-2021 | defer | name another exact edition>
municipality_boundary=<accept-statcan-2021-csd | defer | provide exact type mapping/edition>
federal_riding_boundary=<accept-elections-canada-2025-2023-order | defer | name another exact edition>
acknowledge_watershed_forest_district_provincial_riding_reserve_treaty_area_blocked=<yes | no>
acknowledge_all_outputs_example_unapproved_nonproduction_productionEligible_false=<yes | no>
acknowledge_no_external_compute_storage_release_or_production_claim=<yes | no>
```

An answer containing `no`, a placeholder, an omitted line, an unlisted crosswalk, or a boundary source without an exact edition remains fail-closed. After approval is recorded, source-backed checks and a fresh dry preflight must still pass before any real transformation starts.

This package changes no Phase 2 implementation item: the fixed maturity remains **43% (+0 percentage points)**.
