# Québec original/current inventory staging

`qc-original-current-inventory` records the official provincial `CARTE_ECO_ORI_PROV_GPKG.zip` resource. It is not the annual `CARTE_ECO_MAJ_PROV` current ecoforest map and not the fourth-inventory `CARTE_ECO_ORI_4_PROV` resource.

The local raw archive is checksum-bound at 11,244,667,626 bytes and SHA-256 `c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61`. A complete ZIP test passed for its one 33,243,570,176-byte GeoPackage member. The extracted member SHA-256 is `70539d99497de2773342611d73bf9e4fadf01f1fdbfe3ca536ad711d87916e7c`; SQLite integrity passed.

The GeoPackage has two EPSG:32198 spatial layers: 8,387,062 `pee_ori_prov` MultiPolygons and 8,387,062 `meta_ori_prov` Points. Exhaustive OGR validation found zero missing, empty, or invalid geometries in both layers. Every `geocode` in all four linked tables is nonblank. `essence_ori_prov` (19,113,947 rows) and `etage_ori_prov` (6,465,021 rows) are linked inventory attributes, with 6,411,086 distinct nonblank `geocode` values each.

This is source evidence only. It creates no derived data and grants no immutable archival, transformation, ingestion, release, or production eligibility.
