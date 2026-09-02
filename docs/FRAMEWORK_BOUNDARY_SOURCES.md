# Framework boundary sources

## Economic regions

The source-admitted economic-region geometry is Statistics Canada's 2021
Economic Region Digital Boundary File, catalogue 92-160-X, geographic reference
date 2021-01-01. The exact English REST snapshot is 28,023,613 bytes with
SHA-256 `b1bcb1305a04c6ddf9b74bdee545616a85ef6ff2e5622de343c34b122bdb08f7`.
It contains 76 features and 76 distinct DGUIDs. The four initial provinces
contain 44 regions: Québec 17, Ontario 11, Alberta 8 and British Columbia 8.

Source admission is recorded in
[`data/economic-region-source-admission-2026-08-29.json`](../data/economic-region-source-admission-2026-08-29.json).
The exact French REST snapshot is separately admitted: 28,023,689 bytes with
SHA-256 `02449dd7bccfd6338b554821fd6fab8430cd1720d2b53b1ad8499746ae538c1b`.
Its 76 IDUGDs exactly match the 76 English DGUIDs, with no missing names. The
overlay joins those official names by DGUID/IDUGD. The immutable v3 boundary
archive contains the 44 selected regions, clipped to the four official province
boundaries, and has passed exact S3 and CloudFront readback. No regional
forest-loss aggregate is claimed.

Primary references:

- [2021 Census Boundary Files](https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X2021001)
- [2021 Boundary Files Reference Guide](https://www150.statcan.gc.ca/n1/pub/92-160-g/92-160-g2021001-eng.htm)
- [English economic-region REST layer](https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/2)
- [French economic-region REST layer](https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Fichiers_des_limites_numeriques/MapServer/2)
- [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence)

## Watersheds

The source-admitted comparison level is the Water Survey of Canada
sub-drainage area. The admitted archive is NRCan's national Water Survey of Canada
sub-drainage-area rollup, version 6.0, at 1:1,000,000 scale:
`canadwscsda_1m_v6-0_shp.zip`. It is a 50.9 MB federal archive that covers the
whole country, includes stable WSCSDA codes, and carries English and French
names in the same schema. It therefore covers Québec, Ontario, Alberta and
British Columbia without stitching four provincial products together.

The exact outer archive is 50,896,154 bytes with SHA-256
`9afc4f505cc7d86e20c1296b7695b6ccae94fd085ed94f7be3178811583d8213`.
Its polygon payload is 23,489,341 bytes with SHA-256
`0108bb97466e4fe43f59bbda27744e19d8a969bc8a40e9a20880d3ff9ca50fad`.
The payload contains 184 geometries and 184 distinct WSCSDA codes, with no
missing English name, French name, identifier, or geometry. Fifteen codes
begin with `U` and are explicitly named as USA-only source records. The
Canadian overlay selection excludes those 15 records and therefore contains
169 coded areas. This filter is recorded in the tile manifest as
`WSCSDA NOT LIKE 'U%'`; the source archive itself remains unchanged.
Intersecting that Canadian selection with the four official province boundaries
produces 105 coded areas in the immutable v3 overlay. Cross-border watersheds
are intentionally truncated at those boundaries.

This archive is preferable to two live-service alternatives. NRCan's current
Atlas service returns 169 geometries, including two unnamed records, and does
not expose stable WSCSDA codes. The Esri Canada Water Survey-derived feature
service returns 168 coded, bilingually named records but is a secondary
publisher. The version 6.0 federal archive is the simplest authoritative,
reproducible source. Its measured 184-feature count is bound to the admission
record and must not be replaced by the older 164-area SDAC 2003 narrative.
Statistics Canada continues to use version 5.0 for SDAC dissemination and did
not adopt version 6.0. The released reference overlay is therefore described
as NRCan's version 6.0 Water Survey rollup, not as the current Statistics
Canada SDAC.

The 51-feature AAFC sub-basin archive was rejected because it does not cover
the four provinces or Canada. Hydrometric-station basin polygons were also
rejected because overlapping station catchments are not a national comparison
framework.

References:

- [NRCan Atlas of Canada drainage-area record](https://open.canada.ca/data/en/dataset/74eb52a9-c088-401c-bfb3-f08a18899e7b)
- [NRCan English sub-drainage layer](https://geoappext.nrcan.gc.ca/arcgis/rest/services/NRCAN/AtlasWatershedsEN/MapServer/2)
- [NRCan French watershed service](https://geoappext.nrcan.gc.ca/arcgis/rest/services/NRCAN/AtlasWatershedsFR/MapServer)
- [NRCan archived drainage-area directory](https://ftp.maps.canada.ca/pub/nrcan_rncan/archive/vector/framework_cadre/drainage_areas/wsc_rollup/)
- [NRCan version 6.0 sub-drainage archive](https://ftp.maps.canada.ca/pub/nrcan_rncan/archive/vector/framework_cadre/drainage_areas/wsc_rollup/canadwscsda_1m_v6-0_shp.zip)
- [Water Survey of Canada-derived bilingual feature service](https://www.arcgis.com/home/item.html?id=12b6e33d5a754c92b97ae5d0fed6940a)
- [Statistics Canada SDAC 2003](https://www.statcan.gc.ca/en/subjects/standard/sdac/sdacinfo4)
- [Statistics Canada note on version 6.0](https://www.statcan.gc.ca/en/subjects/standard/sdac/sdacinfo3)

The watershed geometry is source-admitted, and its exact governed bytes,
Canadian selection, and immutable v3 boundary archive of 105 clipped areas
passed exact S3 and CloudFront readback. This does not claim a watershed
forest-loss aggregate or production eligibility.

## Province identity marks

The landing page and Explore map share one province bar with compact inline SVG
renditions of all four flags. The public-domain source files are recorded in
[`docs/THIRD_PARTY.md`](THIRD_PARTY.md), and no flag image is hotlinked at
runtime. The owner directed this use on 2 September 2026 without a separate
authorization gate.
