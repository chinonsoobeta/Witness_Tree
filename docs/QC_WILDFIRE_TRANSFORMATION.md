# Québec historical-wildfire transformation

`qc-historic-wildfire-v1` is the first reproducible transformation of a verified Witness Tree staging source. It copies the `feux_prov` and `meta_feux_prov` layers from the extracted Québec `FEUX_PROV.gpkg` into a new GeoPackage outside Git.

It is intentionally lossless: it applies no field normalization, semantic change, coordinate change, or geometry operation. The raw archive is bound to SHA-256 `cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815`. The transformation specification is [qc-historic-wildfire-v1.json](../data/transformation-specs/qc-historic-wildfire-v1.json).

Run it with the isolated geospatial environment:

```sh
/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/tools/geospatial-venv/bin/python scripts/transform-quebec-wildfire.py \
  --raw-archive /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/raw/qc-historic-wildfire-detailed/2026-08-11/FEUX_PROV_GPKG.zip \
  --source /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/work/qc-historic-wildfire-detailed/FEUX_PROV.gpkg \
  --output /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/qc-historic-wildfire-v1/2026-08-12/FEUX_PROV_lossless-verified.gpkg \
  --evidence /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/qc-historic-wildfire-v1/2026-08-12/transformation-evidence-verified.json
```

The script requires the raw archive path and hashes it before doing any work; it fails unless that exact archive has the verified staged checksum. It refuses to overwrite either output. It records Python, GDAL, and pyogrio versions; raw and working-copy checksums; exact input and output feature counts; a per-layer fingerprint containing source-order attributes and WKB; output byte size and checksum; and missing, empty, and invalid geometry counts. It fails unless fields, geometry type, CRS, feature count, and content fingerprint match exactly, and unless every output geometry is present, non-empty, and valid.

The verified run is summarized in [qc-historic-wildfire-v1-2026-08-12.json](../data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json). Its external GeoPackage is 1,017,495,552 bytes with SHA-256 `7b0749f5a237f1abb3cf110c5748ed5cbdc8afa738beb021bba68a19927a24a8`; both 94,572-feature layers retain matching source/output content fingerprints and zero missing, empty, or invalid geometries.

`--verify-existing` may be used only with an existing derived output and a new evidence path. It does not write data; it performs the same raw-archive and lossless validation and emits fresh evidence.

Attribution is retained with the output evidence: “Source: Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers and Direction de la protection des forêts, Feux de forêt. Licensed under CC BY 4.0.” The licence reference is <https://www.donneesquebec.ca/licence/#cc-by>.

This is local derived-validation evidence only. The result is not immutable object storage, is not ingested, and is not production eligible. A later storage decision and a separately tested ingestion decision remain required.
