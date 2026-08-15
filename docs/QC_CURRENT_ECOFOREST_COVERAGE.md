# Québec current-ecoforest coverage geometry

## Source decision

The source is the provincial GeoPackage distribution of MRNF's *Carte
écoforestière à jour* (current ecoforest map), not the 1:250,000 download
index. MRNF's June 2024 product documentation says the mapping covers territory
below the territorial boundary of attributable forests, except part east of
management unit 09551, and covers public and private forest. The documentation
identifies `PEE_MAJ_PROV` as the current ecoforest stand polygons.

The publisher is the Ministère des Ressources naturelles et des Forêts, Secteur
des forêts, Direction des inventaires forestiers. Données Québec publishes the
product under CC BY 4.0. This scope statement is the authority for the
south-of-52 decision; it avoids treating a literal 52° latitude clip as the
coverage boundary.

## Deterministic footprint

After the provincial archive passes byte-length and ZIP-integrity checks,
`scripts/derive-qc-current-ecoforest-coverage.py` verifies that the staged sole
GeoPackage member matches its archive CRC and applies `ST_Union` to every
geometry in published `PEE_MAJ_PROV`. A
read-only source profile must first prove that the published layer is valid;
the script checksum-binds that profile to its output evidence. Source validity
is evaluated with GDAL's native `ST_IsValid` and `ST_IsEmpty` predicates over
every published feature. When a single query cannot finish within the local
command window, `scripts/summarize-native-validity-ranges.py` accepts only
contiguous, non-overlapping FID-range results that cover the reported feature
count exactly. The union is resumable and checksum-binds fixed ascending FID
partitions and hierarchical results. MultiPolygon inputs are losslessly
exploded to polygon parts before cascaded union, avoiding topology work on
province-wide packed collections without changing their geometry. It writes a
one-feature checksum-bound GeoPackage and JSON evidence. It does not use
sheet-index geometry, clip by latitude, repair, simplify, filter, or map source
polygons. Evidence preserves raw/derived SHA-256 values, member/layer, tool
version, and source/output profiles.

## Verified result (2026-08-14)

- Official archive: 12,399,475,076 bytes; SHA-256
  `c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1`;
  ZIP integrity passed.
- Published `pee_maj_prov`: 9,827,536 MultiPolygon features, EPSG:32198,
  zero missing, empty, or invalid geometries. Its exhaustive native profile is
  SHA-256 `fc16cb1abfb94f6bf5a6414f9f90a150a9c548688a719ce636f495561b7295d7`.
- Derived footprint: 974,848 bytes; SHA-256
  `03209000faefff5715cec570050de2ea0716cedc900a1b4154cc431da7e96383`;
  one non-null, non-empty, valid MultiPolygon in EPSG:32198; extent
  `[-830340.25, 117964.1499999985, 543807.6400000006, 942382.6700000018]`;
  area 627,871.397328488 km²; 54,954 vertices in three polygons.
- Derivative evidence: SHA-256
  `922c7b51c265d69646ba7104ec3ada6ad33c14c5b5455e783ca41f0f4f04e75c`.

Earlier monolithic or packed-collection attempts were fail-closed: interrupted
or incomplete outputs have no evidence record and are excluded. One early
attempt produced a null geometry because it addressed a non-existent `geom`
column in an intermediate layer; that output was rejected. Only the derivative
checksum above is admissible.

The derivative describes where MRNF publishes current ecoforest stand polygons.
It does not claim a forest-land denominator, northern Québec coverage, full
Québec, or a boundary dataset. The east-of-09551 exception remains documented.

## Admission condition

The Québec entry is admitted because source and derivative profiling, CC BY
attribution, and the scope decision are recorded. Together with the four
national baselines and Ontario's separate scope decision, it completes the
six-part Phase 1 coverage-geometry exit. This does not promote the raw archive
or derivative to immutable storage or production use.
