import type { DownloadRelease } from "./types";

const base = "https://d3g1406o0uekin.cloudfront.net/releases/phase8-bulk-download-v1/316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
const common = {
  licenceId: "ogl-canada-2.0" as const,
  additionalLicenceIds: ["statcan-open-licence" as const],
  attributions: [
    "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). This does not constitute an endorsement by Natural Resources Canada.",
    "Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. This does not constitute an endorsement by Statistics Canada of this product.",
  ],
  boundaryEdition: "statcan-2021-provinces-territories-cbf",
  timeRange: "2020-2022",
  methodVersion: "phase8-province-bulk-download-v2",
  retrievedDate: "2026-08-28",
  note: { en: "Four-province province-level technical preview; not per-cell geometry and not formal Phase 2 completion.", fr: "Aperçu technique au niveau provincial pour quatre provinces; il ne s’agit ni d’une géométrie par cellule ni de l’achèvement formel de la phase 2." },
};

export const provinceBulkRelease: DownloadRelease = {
  id: "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f",
  readme: { en: "Deterministic CSV and valid GeoPackage for the bounded 2020-2022 four-province technical preview.", fr: "CSV déterministe et GeoPackage valide pour l’aperçu technique limité de quatre provinces de 2020 à 2022." },
  artifacts: [
    { ...common, id: "phase2-province-loss-2020-2022-csv", kind: "csv-table", sha256: "a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd", contentType: "text/csv; charset=utf-8", url: `${base}/downloads/phase2-province-loss-2020-2022.csv` },
    { ...common, id: "phase2-province-loss-2020-2022-geopackage", kind: "event-record-geopackage-metadata", sha256: "d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a", contentType: "application/geopackage+sqlite3", url: `${base}/downloads/phase2-province-loss-2020-2022.gpkg` },
  ],
};

export const provinceBulkManifestUrl = `${base}/manifest.json`;
