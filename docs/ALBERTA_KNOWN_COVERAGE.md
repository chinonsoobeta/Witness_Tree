# Alberta bounded known coverage

This record admits one **bounded known-coverage** footprint for Alberta. It is
not a provincial boundary, a forest land-base, or a claim that all Alberta
locations are covered. It is usable only with the
`national-baseline-plus-local-context` coverage grade.

## Inputs

1. **Forest Management Agreement Published Area**, an official Government of
   Alberta service snapshot retrieved on 2026-08-14. The metadata calls it the
   official polygonal representation of all FMA holders' areas in Alberta; its
   revision date is 2026-05-01. Its raw GeoJSON SHA-256 is
   `da4d3d80ddf71e6cae738077fed807cdb9ae39ba946a6a7ce5e2d3ffc69e0e0f`.
   The data is licensed under OGL–Alberta and carries the prescribed
   attribution.
2. **Alberta AVI Crown footprint v1**, a previously verified, dissolved local
   footprint from the exact staged AVI Crown ZIP. Its GPKG SHA-256 is
   `ee27adbaacbf0733e08733f51c5c8711369ee1af5b9f9ee2b8b9c2708e0eb995`.

The FMA source contains 21 features. Ten have ring self-intersections. The
builder reprojects to EPSG:3400, applies
`make_valid(method='structure', keep_collapsed=False)` only to those ten, and
rejects a repair if its relative area delta exceeds `1e-6`. The observed
largest delta was `6.856681423186425e-15`; no FMA feature was quarantined.

## Result and audit

`scripts/build-alberta-known-coverage.py` unions the repaired FMA footprint in
source-FID order, then unions it with the AVI footprint. The generated
one-feature EPSG:3400 GPKG is at:

`../Witness_Tree-data/derived/alberta-known-coverage-fma-and-avi-v1/2026-08-14/alberta-known-coverage-fma-and-avi.gpkg`

Its SHA-256 is
`39dd568c092f6c85801dd27f2eaeb42eac30887ffec124d820af7de781b5c723`.
The evidence file is beside it and has SHA-256
`41343e5ddf97600cc623309b478f29ab4fd374b32e686d5f7b077059ce07af31`.

The output is a valid MultiPolygon with no missing, empty, or invalid geometry.
Its known-footprint area is 325,741.37445817376 km². Source footprint areas
are 219,271.02989476532 km² (FMA) and 108,588.41802890084 km² (AVI), with
2,118.0734654925304 km² overlap. These areas describe only the named sources.

## Explicit exclusions

No conclusion is made about private land, non-FMA Crown land outside AVI, or
any location absent from both source footprints. The FMA service does not close
those gaps. A future Alberta land-base admission needs an authoritative,
versioned complete land-base geometry and its own scope decision.
