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
`scripts/derive-qc-current-ecoforest-coverage.py` extracts its one GeoPackage
and applies `ST_Union` to every geometry in published `PEE_MAJ_PROV`. A
read-only source profile must first prove that the published layer is valid;
the script checksum-binds that profile to its output evidence. It writes a
one-feature checksum-bound GeoPackage and JSON evidence. It does not use
sheet-index geometry, clip by latitude, repair, simplify, filter, or map source
polygons. Evidence preserves raw/derived SHA-256 values, member/layer, tool
version, and source/output profiles.

The derivative describes where MRNF publishes current ecoforest stand polygons.
It does not claim a forest-land denominator, northern Québec coverage, full
Québec, or a boundary dataset. The east-of-09551 exception remains documented.

## Admission condition

The Québec entry may be added to coverage admission only after source and
derivative profiling, CC BY attribution, and the scope decision are recorded.
The four-province gate remains incomplete until BC, Alberta and Ontario meet the
same evidence standard.
