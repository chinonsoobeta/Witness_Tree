import { assertGridConformance, classListFromVat } from "../grid";
import { validatePromotionManifest } from "../archive-staging";
import type { ArchivePromotionManifest } from "../archive-staging";
import type { ClassList, RasterYearHeader, VatSidecar } from "../grid";

/**
 * The only source identifier this local planning contract will admit.  It deliberately
 * has no supplied instances yet: the 39 VLCE2 archives must each be independently
 * remote-verified and compliance-retained before an input can enter the pipeline.
 */
export const VLCE2_SOURCE_ID = "nrcan-annual-land-cover-vlce2" as const;

export type VerifiedImmutableRasterInput = Readonly<{
  promotion: ArchivePromotionManifest;
  header: RasterYearHeader;
  vat: VatSidecar;
}>;

export type AdmittedRasterInput = Readonly<{
  year: number;
  payloadKey: string;
  payloadVersionId: string;
  classList: ClassList;
  productionEligible: false;
}>;

export type NationalBaselinePlan = Readonly<{
  status: "local-planning-only";
  inputs: readonly AdmittedRasterInput[];
  publicResults: readonly [];
  productionEligible: false;
  limitation: string;
}>;

function expectedFilename(year: number): string {
  return `CA_forest_VLCE2_${year}.zip`;
}

/**
 * Admits one VLCE2 raster only after the existing immutable-promotion gate has proven
 * whole-object linkage, remote byte equality, version IDs, Canadian region, and active
 * compliance retention. Grid conformance is then checked independently. This reads no
 * archive bytes and cannot produce a public result.
 */
export function admitVerifiedImmutableRaster(input: VerifiedImmutableRasterInput): AdmittedRasterInput {
  if (input.promotion.staged.sourceId !== VLCE2_SOURCE_ID) {
    throw new Error(`National-baseline admission only accepts ${VLCE2_SOURCE_ID} raster snapshots.`);
  }
  const manifest = validatePromotionManifest(input.promotion);
  if (manifest.promotion.state !== "remote-verified") {
    throw new Error("A national-baseline raster must be remote-verified before admission.");
  }
  const header = assertGridConformance(input.header);
  if (manifest.staged.originalFilename !== expectedFilename(header.year)) {
    throw new Error(`Raster year ${header.year} must use its matching immutable VLCE2 archive filename.`);
  }
  if (input.vat.year !== header.year) {
    throw new Error(`Raster attribute-table year ${input.vat.year} does not match raster year ${header.year}.`);
  }
  const payloadVersionId = manifest.remote?.payloadVersionId;
  if (!payloadVersionId) throw new Error("Remote-verified raster admission requires a payload version ID.");
  return Object.freeze({
    year: header.year,
    payloadKey: manifest.payloadKey,
    payloadVersionId,
    classList: classListFromVat(input.vat),
    productionEligible: false,
  });
}

/**
 * Builds only a local execution plan. It intentionally exposes no aggregate, geometry,
 * tile, download, or product record: those require actual pixel processing, boundaries,
 * lineage, and the Phase 2 validation work that has not happened.
 */
export function planNationalBaseline(inputs: readonly VerifiedImmutableRasterInput[]): NationalBaselinePlan {
  const admitted = inputs.map(admitVerifiedImmutableRaster);
  const years = new Set<number>();
  for (const input of admitted) {
    if (years.has(input.year)) throw new Error(`Only one immutable raster snapshot may be admitted for year ${input.year}.`);
    years.add(input.year);
  }
  return Object.freeze({
    status: "local-planning-only",
    inputs: Object.freeze(admitted),
    publicResults: Object.freeze([]) as readonly [],
    productionEligible: false,
    limitation: "Admission proves only immutable source identity and grid conformance. No raster pixels, boundaries, aggregates, tiles, downloads, or public results have been produced.",
  });
}
