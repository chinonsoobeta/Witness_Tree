import { localized } from "../domain/localized";
import { requiredAttributions } from "./licence";
import { DISTRICT_COUNT_BY_ORDER } from "./types";
import type {
  BoundaryLicence,
  CensusAttributeVintage,
  FederalRidingBoundaryEdition,
  FederalRidingJoin,
  RepresentationOrder,
  VintageMismatch,
} from "./types";

function mismatch(boundaryOrder: RepresentationOrder, attributeOrder: RepresentationOrder): VintageMismatch {
  return Object.freeze({
    boundaryOrder,
    attributeOrder,
    message: localized(
      `Riding geometry is on the ${boundaryOrder} Representation Order (${DISTRICT_COUNT_BY_ORDER[boundaryOrder]} districts) and the census attributes are on the ${attributeOrder} Representation Order (${DISTRICT_COUNT_BY_ORDER[attributeOrder]} districts). These are different riding sets and cannot be joined.`,
      `La géométrie des circonscriptions relève du décret de représentation de ${boundaryOrder} (${DISTRICT_COUNT_BY_ORDER[boundaryOrder]} circonscriptions) et les attributs du recensement relèvent du décret de ${attributeOrder} (${DISTRICT_COUNT_BY_ORDER[attributeOrder]} circonscriptions). Ce sont des ensembles différents et ils ne peuvent pas être joints.`,
    ),
  });
}

/**
 * Reports a vintage mismatch without throwing. Returns `null` only when both sides carry
 * the same representation order and both district counts match that order.
 */
export function describeVintageMismatch(
  boundary: Pick<FederalRidingBoundaryEdition, "representationOrder" | "districtCount">,
  attributes: Pick<CensusAttributeVintage, "representationOrder" | "districtCount">,
): VintageMismatch | null {
  if (boundary.representationOrder !== attributes.representationOrder) {
    return mismatch(boundary.representationOrder, attributes.representationOrder);
  }
  const expected = DISTRICT_COUNT_BY_ORDER[boundary.representationOrder];
  if (boundary.districtCount !== expected || attributes.districtCount !== expected) {
    return mismatch(boundary.representationOrder, attributes.representationOrder);
  }
  return null;
}

/**
 * Joins riding geometry to riding-keyed census attributes.
 *
 * The representation order is inferred from the geometry argument alone, and the census
 * argument is then pinned to that same order. A 2023 boundary edition and a 2021 census
 * vintage published on the 2013 (338-riding) order therefore do not type-check at all.
 * The runtime guard below is the second line of defence for callers crossing an untyped
 * boundary such as parsed JSON. A mismatch is rejected by throwing; it is never
 * downgraded to a warning and never returns a partial or zero-filled result.
 *
 * The returned join is staging metadata. It performs no geometry work, no ingestion, and
 * no storage, and it is never production eligible.
 */
export function joinFederalRidingAttributes<Boundary extends FederalRidingBoundaryEdition<RepresentationOrder>>(
  boundary: Boundary,
  attributes: CensusAttributeVintage<NoInfer<Boundary["representationOrder"]>>,
  licences: readonly BoundaryLicence[],
): FederalRidingJoin<Boundary["representationOrder"]> {
  const conflict = describeVintageMismatch(boundary, attributes);
  if (conflict) throw new Error(conflict.message.en);
  if (boundary.supersededBy) {
    throw new Error(`Boundary edition ${boundary.id} is superseded by ${boundary.supersededBy} and cannot be joined.`);
  }
  if (boundary.productionEligible !== false) {
    throw new Error("A staged boundary edition cannot claim production eligibility.");
  }

  const used = licences.filter((licence) => licence.id === boundary.licenceId || licence.id === attributes.licenceId);
  if (!used.some((licence) => licence.id === boundary.licenceId) || !used.some((licence) => licence.id === attributes.licenceId)) {
    throw new Error("Every licence covering the joined inputs must be supplied; one licence does not cover another publisher.");
  }

  return Object.freeze({
    representationOrder: boundary.representationOrder,
    boundaryEditionId: boundary.id,
    attributeVintageId: attributes.vintageId,
    districtCount: DISTRICT_COUNT_BY_ORDER[boundary.representationOrder],
    requiredAttributions: requiredAttributions(used),
    limitation: localized(
      "Container-level evidence only. Geometry, coordinate reference system, and attribute schema are Unknown — no vector content has been opened.",
      "Preuve au niveau du conteneur seulement. La géométrie, le système de référence des coordonnées et le schéma des attributs sont inconnus — aucun contenu vectoriel n'a été ouvert.",
    ),
    productionEligible: false,
  });
}
