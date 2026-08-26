# Québec fourth-inventory evidence

## Exact product

The canonical `qc-fourth-inventory` row is the Données Québec product
**Carte écoforestière originale et résultats du quatrième inventaire**, catalogue
UUID `77ec9009-b733-4f09-ade3-99d7b2156ad4`. It is published by Québec's
Ministère des Ressources naturelles et des Forêts, Direction des inventaires
forestiers.

This is a fixed historical inventory product, not either of the two similarly
named current products:

- It is not **Carte écoforestière à jour**, whose mapped stands are updated for
  disturbances.
- It is not **Carte écoforestière originale et résultats d'inventaire
  courants**, whose provincial mapping is replaced incrementally as later
  inventories become available.

The publisher says the fourth-inventory map covers work from 2001 through 2018,
has been complete since 2018, and receives no new mapping. Some areas that did
not receive new fourth-inventory mapping remain absent. The product combines
the original ecoforest stand polygons with merchantable-volume compilations,
ecological classification, and forest-station characterization. Temporary
sample plots are not included.

## Official source and terms

- Catalogue: <https://www.donneesquebec.ca/recherche/dataset/resultats-d-inventaire-et-carte-ecoforestiere_4eme>
- Official download index: <https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Historique_des_inventaires/4e_IEQM/03-Telechargement/URL_4e.csv>
- Publisher documentation: <https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Historique_des_inventaires/4e_IEQM/01-Documentation/LISEZ-MOI_carteco-ori-res-4_DQ.pdf>
- Licence: [Creative Commons Attribution 4.0](https://www.donneesquebec.ca/licence/#cc-by)
- Attribution: Source : Ministère des Ressources naturelles et des Forêts du
  Québec, Secteur des forêts, Direction des inventaires forestiers. Sous
  licence CC BY 4.0.

The catalogue and resources were updated 2026-06-19. The publisher documents
Québec Lambert, EPSG:32198, for the GeoPackage data.

## Acquisition and publisher-index defect

The catalogue's provincial GeoPackage contains the original map layers only;
it does not contain all inventory-result tables. It therefore cannot satisfy
this product row by itself. The complete local evidence set uses the 56
publisher-defined 1:250,000 sheet products.

The 56 GeoPackage links written in the official CSV returned HTTP 404 during
the 2026-08-14 acquisition because their filenames omitted the publisher's
`PRODUITS_IEQM_4_` prefix and `_GPKG` suffix. The same official MRNF sheet
directories exposed the corrected pattern
`PRODUITS_IEQM_4_{sheet}_GPKG.zip`. Every corrected URL was HEAD-verified, and
all 56 archives were acquired from those official directories. This is a
documented publisher-index defect, not a substitute or third-party mirror.

## Local verification boundary

The checksum-bound evidence record in
`data/qc-fourth-inventory-evidence.json` records:

- the exact aggregate byte length and SHA-256 for every one of the 56 ZIP
  archives;
- full ZIP CRC verification and the sole GeoPackage member for every archive;
- every layer name, feature count, geometry type, field list, CRS and extent;
- exhaustive null, empty and validity checks for `perimetre_no_terri`,
  `pee_ori_4` and `meta_ori_4`; and
- deterministic SQL-view lineage showing that spatial result views obtain
  their geometry from `pee_ori_4`.

The large per-sheet profile remains external to Git because it binds more than
16 GB of raw local evidence. The repository record binds that profile by
SHA-256 and preserves the official refetch recipe.

This evidence is local and read-only. It is not immutable object storage, a
transformation, ingestion, production admission, or production eligibility.
Those decisions remain separate blockers. The row therefore receives only the
ledger's fixed `local-verified-profiled` raw-evidence credit.
