import type { LocalizedString } from "../domain/localized";

export const REPRESENTATION_ORDERS = ["2013", "2023"] as const;

/**
 * A federal representation order. Riding geometry and riding-keyed attributes are only
 * comparable within one order: the 2013 order has 338 districts, the 2023 order has 343,
 * and boundaries were renamed and reshaped in between.
 */
export type RepresentationOrder = (typeof REPRESENTATION_ORDERS)[number];

export const CURRENT_REPRESENTATION_ORDER: RepresentationOrder = "2023";

export const DISTRICT_COUNT_BY_ORDER: Readonly<Record<RepresentationOrder, number>> = Object.freeze({
  "2013": 338,
  "2023": 343,
});

export const BOUNDARY_EDITION_IDS = [
  "statcan-2021-provinces-territories-cbf",
  "statcan-2021-census-divisions-cbf",
  "statcan-2021-census-subdivisions-cbf",
  "elections-canada-fed-2023",
  "statcan-2021-fed-2013-order-cbf",
] as const;

export type BoundaryEditionId = (typeof BOUNDARY_EDITION_IDS)[number];

export const BOUNDARY_LICENCE_IDS = ["statcan-open-licence", "ogl-canada-2.0"] as const;

export type BoundaryLicenceId = (typeof BOUNDARY_LICENCE_IDS)[number];

/**
 * A licence version is either read off the published licence or explicitly Unknown with a
 * reason. There is no third state, and no default: an unversioned licence must never be
 * given a fabricated number.
 */
export type LicenceVersion =
  | Readonly<{ kind: "known"; value: string }>
  | Readonly<{ kind: "unknown"; reason: string }>;

export type BoundaryLicence = Readonly<{
  id: BoundaryLicenceId;
  name: string;
  publisher: string;
  url: string;
  version: LicenceVersion;
  /** Verbatim wording the licence requires. Two licences means two required statements. */
  requiredAttributionTemplate: string;
}>;

/**
 * Container evidence plus a header read. `ogrinfo -so` was run against these archives: the
 * header reads confirmed every recorded feature count by real OGR reads, and PROJ proved the
 * Statistics Canada and Elections Canada boundary coordinate reference systems identical to
 * each other (IsSame true, zero displacement on round-tripped test points).
 *
 * `ogrinfo -so` reads headers only, so geometry validity is still Unknown: self-intersections,
 * ring order, null or empty geometries, duplicate identifiers, and topological gaps or overlaps
 * between adjacent polygons were never checked. The full attribute schema beyond the headers is
 * Unknown. No reprojection and no intersection has been executed.
 *
 * `crsValidated` therefore stays false, and it is not stale. PROJ established that the two
 * boundary CRSs match EACH OTHER, which is a different claim from the boundary CRS having been
 * validated for use against the VLCE2 raster grid. It has not been, and it does not match the
 * raster grid CRS: the two differ by roughly 6,000 km. `geometryValidated` and
 * `attributeSchemaValidated` stay false for the same reason, that the evidence for them does not
 * exist. All three are compile-time hazard gates. Do not flip one without the read that earns it.
 */
export type BoundaryEvidence = Readonly<{
  byteLength: number;
  sha256: string;
  featureCount: number;
  featureCountMethod: "shx-index-record-count";
  unzipTest: "ok";
  geometryValidated: false;
  crsValidated: false;
  attributeSchemaValidated: false;
}>;

export type BoundaryEditionRecord = Readonly<{
  id: BoundaryEditionId;
  publisher: string;
  productName: string;
  catalogueUrl: string;
  fileUrl: string;
  edition: string;
  referenceDate: string;
  licenceId: BoundaryLicenceId;
  requiredAttribution: string;
  retrievedAt: string;
  evidence: BoundaryEvidence;
  productionEligible: false;
}>;

/**
 * Federal riding geometry, tagged with its representation order at the type level so a
 * mismatched join cannot be written.
 */
export type FederalRidingBoundaryEdition<Order extends RepresentationOrder = RepresentationOrder> =
  BoundaryEditionRecord &
    Readonly<{
      representationOrder: Order;
      districtCount: number;
      supersededBy: BoundaryEditionId | null;
    }>;

/** Census attributes keyed by riding, tagged with the order those riding keys belong to. */
export type CensusAttributeVintage<Order extends RepresentationOrder = RepresentationOrder> = Readonly<{
  vintageId: string;
  censusYear: number;
  representationOrder: Order;
  districtCount: number;
  publisher: string;
  licenceId: BoundaryLicenceId;
}>;

export type FederalRidingJoin<Order extends RepresentationOrder = RepresentationOrder> = Readonly<{
  representationOrder: Order;
  boundaryEditionId: BoundaryEditionId;
  attributeVintageId: string;
  districtCount: number;
  /** Every required attribution statement for the join, one per distinct licence. */
  requiredAttributions: readonly string[];
  limitation: LocalizedString;
  /** Always false: a staged join is never production eligible. */
  productionEligible: false;
}>;

export type VintageMismatch = Readonly<{
  boundaryOrder: RepresentationOrder;
  attributeOrder: RepresentationOrder;
  message: LocalizedString;
}>;
