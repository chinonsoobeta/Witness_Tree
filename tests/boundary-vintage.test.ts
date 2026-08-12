import assert from "node:assert/strict";
import test from "node:test";
import { describeVintageMismatch, joinFederalRidingAttributes }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/boundaries/join.ts";
import { formatLicenceVersion, requireLicenceVersion }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/boundaries/licence.ts";
import type { BoundaryLicence, CensusAttributeVintage, FederalRidingBoundaryEdition } from "../lib/boundaries/types";

const STATCAN_LICENCE: BoundaryLicence = {
  id: "statcan-open-licence",
  name: "Statistics Canada Open Licence",
  publisher: "Statistics Canada",
  url: "https://www.statcan.gc.ca/en/reference/licence",
  version: { kind: "unknown", reason: "The published licence text carries no version number." },
  requiredAttributionTemplate: "Adapted from Statistics Canada, name of product, reference date. This does not constitute an endorsement by Statistics Canada of this product.",
};

const OGL_LICENCE: BoundaryLicence = {
  id: "ogl-canada-2.0",
  name: "Open Government Licence – Canada",
  publisher: "Elections Canada",
  url: "https://open.canada.ca/en/open-government-licence-canada",
  version: { kind: "known", value: "2.0" },
  requiredAttributionTemplate: "Contains information licensed under the Open Government Licence – Canada.",
};

const evidence = (byteLength: number, sha256: string, featureCount: number) => ({
  byteLength,
  sha256,
  featureCount,
  featureCountMethod: "shx-index-record-count" as const,
  unzipTest: "ok" as const,
  geometryValidated: false as const,
  crsValidated: false as const,
  attributeSchemaValidated: false as const,
});

const FED_2023: FederalRidingBoundaryEdition<"2023"> = {
  id: "elections-canada-fed-2023",
  publisher: "Elections Canada",
  productName: "Federal Electoral Districts Boundaries, 2023 Representation Order",
  catalogueUrl: "https://open.canada.ca/data/en/dataset/18bf3ea7-1940-46ec-af52-9ba3f77ed708",
  fileUrl: "https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/federal_electoral_districts_boundaries_2023/FED_CA_2023_EN-SHP.zip",
  edition: "2023 Representation Order, proclaimed 2023-09-22",
  referenceDate: "2023-09-22",
  licenceId: "ogl-canada-2.0",
  requiredAttribution: OGL_LICENCE.requiredAttributionTemplate,
  retrievedAt: "2026-08-12T16:26:00Z",
  evidence: evidence(9388965, "eab55b952164ba7e8bf569f00c1fe4b6480b532411e1436de427772d9cebae59", 343),
  productionEligible: false,
  representationOrder: "2023",
  districtCount: 343,
  supersededBy: null,
};

const FED_2013: FederalRidingBoundaryEdition<"2013"> = {
  ...FED_2023,
  id: "statcan-2021-fed-2013-order-cbf",
  publisher: "Statistics Canada",
  productName: "2021 Census Federal Electoral District (2013 Representation Order) Cartographic Boundary File",
  catalogueUrl: "https://www150.statcan.gc.ca/n1/en/catalogue/92-160-X",
  fileUrl: "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lfed000b21a_e.zip",
  edition: "2021 Census CBF, 2013 Representation Order",
  referenceDate: "2021-01-01",
  licenceId: "statcan-open-licence",
  requiredAttribution: "Adapted from Statistics Canada, 2021 Census Federal Electoral District (2013 Representation Order) Cartographic Boundary File, reference date January 1, 2021. This does not constitute an endorsement by Statistics Canada of this product.",
  evidence: evidence(139449505, "0f0154fd43e3bee3f4145f32b983d9e5ec06ebb7b16cc7d6c7d94a39f2c2791b", 338),
  representationOrder: "2013",
  districtCount: 338,
  supersededBy: "elections-canada-fed-2023",
};

const CENSUS_2021_ON_2013_ORDER: CensusAttributeVintage<"2013"> = {
  vintageId: "statcan-2021-census-profile-fed-2013",
  censusYear: 2021,
  representationOrder: "2013",
  districtCount: 338,
  publisher: "Statistics Canada",
  licenceId: "statcan-open-licence",
};

const CENSUS_2021_ON_2023_ORDER: CensusAttributeVintage<"2023"> = {
  ...CENSUS_2021_ON_2013_ORDER,
  vintageId: "statcan-2021-census-profile-fed-2023",
  representationOrder: "2023",
  districtCount: 343,
};

test("a matching representation order joins, and stays staging-only", () => {
  const join = joinFederalRidingAttributes(FED_2023, CENSUS_2021_ON_2023_ORDER, [OGL_LICENCE, STATCAN_LICENCE]);
  assert.equal(join.representationOrder, "2023");
  assert.equal(join.districtCount, 343);
  assert.equal(join.productionEligible, false);
  assert.deepEqual([...join.requiredAttributions].sort(), [
    OGL_LICENCE.requiredAttributionTemplate,
    STATCAN_LICENCE.requiredAttributionTemplate,
  ].sort());
  assert.match(join.limitation.en, /Unknown/);
  assert.match(join.limitation.fr, /inconnus/);
});

test("2021 census attributes on the 338-riding basis are rejected against 2023 riding geometry", () => {
  const mismatched = CENSUS_2021_ON_2013_ORDER as unknown as CensusAttributeVintage<"2023">;
  assert.throws(
    () => joinFederalRidingAttributes(FED_2023, mismatched, [OGL_LICENCE, STATCAN_LICENCE]),
    /cannot be joined/,
  );
  const conflict = describeVintageMismatch(FED_2023, CENSUS_2021_ON_2013_ORDER);
  assert.notEqual(conflict, null);
  assert.match(conflict!.message.en, /338 districts/);
  assert.match(conflict!.message.en, /343 districts/);
  assert.match(conflict!.message.fr, /ne peuvent pas être joints/);
  assert.equal(conflict!.boundaryOrder, "2023");
  assert.equal(conflict!.attributeOrder, "2013");
});

test("a district count that contradicts its own declared order is rejected", () => {
  assert.throws(
    () => joinFederalRidingAttributes(FED_2023, { ...CENSUS_2021_ON_2023_ORDER, districtCount: 338 }, [OGL_LICENCE, STATCAN_LICENCE]),
    /cannot be joined/,
  );
  assert.notEqual(describeVintageMismatch({ representationOrder: "2023", districtCount: 338 }, CENSUS_2021_ON_2023_ORDER), null);
});

test("a superseded riding edition cannot be joined at all", () => {
  assert.throws(
    () => joinFederalRidingAttributes(FED_2013, CENSUS_2021_ON_2013_ORDER, [STATCAN_LICENCE]),
    /superseded by elections-canada-fed-2023/,
  );
});

test("one publisher's licence does not cover the other's", () => {
  assert.throws(
    () => joinFederalRidingAttributes(FED_2023, CENSUS_2021_ON_2023_ORDER, [OGL_LICENCE]),
    /one licence does not cover another publisher/,
  );
  assert.throws(
    () => joinFederalRidingAttributes(FED_2023, CENSUS_2021_ON_2023_ORDER, [STATCAN_LICENCE]),
    /one licence does not cover another publisher/,
  );
});

test("a missing licence version renders as Unknown and refuses to be fabricated", () => {
  const rendered = formatLicenceVersion(STATCAN_LICENCE.version);
  assert.equal(rendered.en, "Unknown — The published licence text carries no version number.");
  assert.match(rendered.fr, /^Inconnu — /);
  assert.equal(/\b0\b|\b1\.0\b|\b2\.0\b/.test(rendered.en), false);
  assert.deepEqual(formatLicenceVersion(OGL_LICENCE.version), { en: "2.0", fr: "2.0" });

  assert.throws(() => requireLicenceVersion(STATCAN_LICENCE.version), /carries no version number/);
  assert.equal(requireLicenceVersion(OGL_LICENCE.version), "2.0");
  assert.throws(() => formatLicenceVersion({ kind: "unknown", reason: "  " }), /requires a reason/);
});
