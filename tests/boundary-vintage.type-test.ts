import { joinFederalRidingAttributes } from "@/lib/boundaries";
import type { BoundaryLicence, CensusAttributeVintage, FederalRidingBoundaryEdition } from "@/lib/boundaries";

/**
 * Compile-time proof that the riding-vintage hazard cannot be written down. The
 * `Order` type parameter is shared by both arguments of the join, so a 2023 boundary
 * edition and a census vintage published on the 2013 (338-riding) basis have no common
 * order and the call does not type-check.
 */

const licences: readonly BoundaryLicence[] = [];

const evidence = {
  byteLength: 9388965,
  sha256: "eab55b952164ba7e8bf569f00c1fe4b6480b532411e1436de427772d9cebae59",
  featureCount: 343,
  featureCountMethod: "shx-index-record-count",
  unzipTest: "ok",
  geometryValidated: false,
  crsValidated: false,
  attributeSchemaValidated: false,
} as const;

const fed2023: FederalRidingBoundaryEdition<"2023"> = {
  id: "elections-canada-fed-2023",
  publisher: "Elections Canada",
  productName: "Federal Electoral Districts Boundaries, 2023 Representation Order",
  catalogueUrl: "https://open.canada.ca/data/en/dataset/18bf3ea7-1940-46ec-af52-9ba3f77ed708",
  fileUrl: "https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/federal_electoral_districts_boundaries_2023/FED_CA_2023_EN-SHP.zip",
  edition: "2023 Representation Order",
  referenceDate: "2023-09-22",
  licenceId: "ogl-canada-2.0",
  requiredAttribution: "Contains information licensed under the Open Government Licence – Canada.",
  retrievedAt: "2026-08-12T16:26:00Z",
  evidence,
  productionEligible: false,
  representationOrder: "2023",
  districtCount: 343,
  supersededBy: null,
};

const census2021On2013Order: CensusAttributeVintage<"2013"> = {
  vintageId: "statcan-2021-census-profile-fed-2013",
  censusYear: 2021,
  representationOrder: "2013",
  districtCount: 338,
  publisher: "Statistics Canada",
  licenceId: "statcan-open-licence",
};

const census2021On2023Order: CensusAttributeVintage<"2023"> = {
  ...census2021On2013Order,
  vintageId: "statcan-2021-census-profile-fed-2023",
  representationOrder: "2023",
  districtCount: 343,
};

const matched = joinFederalRidingAttributes(fed2023, census2021On2023Order, licences);

// @ts-expect-error 2021 census attributes on the 338-riding 2013 basis cannot be joined to 2023 riding geometry.
const mismatched = joinFederalRidingAttributes(fed2023, census2021On2013Order, licences);

// @ts-expect-error A staged join is never production eligible.
const notProduction: { productionEligible: true } = matched;

// @ts-expect-error An unversioned licence has no version value to read.
const fabricatedVersion: string = ({ kind: "unknown", reason: "no version published" } as BoundaryLicence["version"]).value;

void matched;
void mismatched;
void notProduction;
void fabricatedVersion;
