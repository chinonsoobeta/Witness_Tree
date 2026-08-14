# CWFIS NFDB polygon staging

The verified raw archive is held outside the repository at `Witness_Tree-data/staging/nfdb-poly-current/NFDB_poly_verified.zip`. It was retrieved from the official CWFIS `current_version` directory and is pinned by byte size and SHA-256 in `data/nfdb-poly-current-profile.json`.

The archive contains two 3D-polygon layers dated 2025-06-30: 41,210 features for 1972–2020 and 7,361 for 2021–2024. Read-only GDAL/GEOS profiling found 441 and 41 invalid geometries respectively; no geometry has been repaired or transformed. The archive is local staging only and may not be treated as immutable, ingested, production eligible, real-time, or complete perimeter coverage.

Reuse evidence is the official NFDB polygon metadata, which identifies the Open Government Licence – Canada while retaining provincial source notices. Any downstream use must preserve the BC, Ontario, and Québec attribution/provenance notices recorded in the profile and must not imply publisher endorsement.
