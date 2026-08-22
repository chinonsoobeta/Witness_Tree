# Phase 2 real-data owner decision

The owner decision was recorded and executed for a real, versioned, **non-production** 1984–2022 national forest-mask and detected-change raster run. It does not authorize production use, release, external compute/storage, or boundary aggregates. The exact decision, source-backed preflight, storage bound, method change and checksum readback evidence are recorded under `data/phase2-*`; 39 masks, 38 annual loss rasters and two historical disturbance rasters passed readback. Boundary aggregation and patch-vector event normalization remain separate, unexecuted gates.

## Evidence-backed recommendation

Use VLCE2 classes `210 coniferous`, `220 broadleaf`, and `230 mixedwood` as the conservative operational forest proxy; preserve `0 unclassified` and `255 nodata` as Unknown. The only unresolved class choice is `81 wetland_treed`: including it may capture qualifying treed wetlands, but the existing publisher metadata does not prove that every class-81 cell meets the registered NFI thresholds. Either crosswalk must be labelled as a VLCE2 proxy rather than a pixel-level measurement of the one-hectare, 10% crown-closure and five-metre mature-height definition.

Authorize the exact checksum-bound 1985–2022 NRCan harvest and wildfire rasters only as historical national corroboration and precedence inputs. Each records the year of greatest mapped disturbance per pixel, not every event. Neither supports live, complete, operational, legal-cutblock, damage, absence, or post-2022 claims.

Run one windowed year-pair worker at a time, with approved configuration limits of 8 vCPU, 16 GiB RAM, 2 TiB local temporary-plus-derived storage, and 96 elapsed hours. The completed run measured 10,355 seconds for the raster-transform interval and 23,141,889,028 retained output bytes. It did not instrument whole-operation elapsed time, CPU utilization, peak RSS, actual concurrent-process peak, or scratch-disk peak, so the approved CPU, RAM and storage values must not be described as observed hard limits. The prospective runner starts its 96-hour deadline before source hashing, uses one synchronous child and 2048 × 2048 windows, and aborts when its enforceable deadline is reached. The grid contains 970,700,103,360 cell-years; one-byte annual masks are 970.7 GB before compression.

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

The owner decision alone changed no implementation item. The later real, versioned non-production raster execution and source/output readback independently passed technical audit at **51% (+8 percentage points from 43%)** under the fixed rubric: dependencies 4/20, core methods 20/35, required outputs 14/20, validation 12/15 and publication/exit 1/10. This accepted technical score is not a release, production claim, or completion of the missing event, boundary, aggregation, tile, sample or statistics work.
