// tests/transparency-pages.test.mjs reaches this file under plain node, not
// tsx, so the specifier has to be one Node's own resolver accepts. The
// "../domain" barrel is a directory import: it resolves under the bundler and
// under tsx and nowhere else.
// @ts-expect-error Node strip-types requires explicit local extensions.
import { formatYearRangeKey } from "../domain/year-range.ts";
import type { DownloadRelease } from "./types";

/*
 * The span this published release covers. It is not the Explore map layer's
 * period: the two happen to coincide today, and they are separate artifacts
 * that will move apart the moment one of them is republished. Prose about the
 * download reads this; prose about the map reads the layer.
 */
export const PROVINCE_BULK_TIME_RANGE = "2020-2022";

const base = "https://d3g1406o0uekin.cloudfront.net/releases/phase8-bulk-download-v1/316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
const common = {
  licenceId: "ogl-canada-2.0" as const,
  additionalLicenceIds: ["statcan-open-licence" as const],
  attributions: [
    "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). This does not constitute an endorsement by Natural Resources Canada.",
    "Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. This does not constitute an endorsement by Statistics Canada of this product.",
  ],
  boundaryEdition: "statcan-2021-provinces-territories-cbf",
  timeRange: PROVINCE_BULK_TIME_RANGE,
  methodVersion: "phase8-province-bulk-download-v2",
  retrievedDate: "2026-08-28",
  note: { en: "Four-province province-level technical preview; not per-cell geometry and not formal Phase 2 completion.", fr: "Aperçu technique au niveau provincial pour quatre provinces; il ne s’agit ni d’une géométrie par cellule ni de l’achèvement formel de la phase 2." },
};

export const provinceBulkRelease: DownloadRelease = {
  id: "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f",
  readme: { en: `Deterministic CSV and valid GeoPackage for the bounded ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en")} four-province technical preview.`, fr: `CSV déterministe et GeoPackage valide pour l’aperçu technique limité de quatre provinces ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr", "from")}.` },
  artifacts: [
    { ...common, id: "phase2-province-loss-2020-2022-csv", kind: "csv-table", sha256: "a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd", contentType: "text/csv; charset=utf-8", url: `${base}/downloads/phase2-province-loss-2020-2022.csv` },
    { ...common, id: "phase2-province-loss-2020-2022-geopackage", kind: "event-record-geopackage-metadata", sha256: "d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a", contentType: "application/geopackage+sqlite3", url: `${base}/downloads/phase2-province-loss-2020-2022.gpkg` },
  ],
};

export const provinceBulkManifestUrl = `${base}/manifest.json`;
