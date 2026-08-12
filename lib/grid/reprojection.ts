import { localized } from "../domain/localized";
import { CANONICAL_GRID, describeGridDeviation } from "./conformance";
import { BOUNDARY_CRS_ID, BOUNDARY_CRS_PROJ4, RASTER_GRID_CRS_ID, RASTER_GRID_CRS_PROJ4 } from "./types";
import type {
  BoundaryCrsVectorLayer,
  ConformantRasterYear,
  GridAlignedVectorLayer,
  RasterVectorIntersection,
  ReprojectionDirection,
} from "./types";

/**
 * The single admitted reprojection direction. Boundary vectors move onto the raster grid.
 *
 * The raster is never warped the other way: its cells are categorical class codes, and any
 * resampling of class codes invents classes that are not in the source. `ReprojectionDirection`
 * pins `from` to the boundary CRS and `to` to the raster grid CRS, so the reverse direction
 * has no representable value.
 */
export const VECTOR_TO_GRID: ReprojectionDirection = Object.freeze({
  from: BOUNDARY_CRS_ID,
  to: RASTER_GRID_CRS_ID,
});

/**
 * Declares that a boundary layer has been reprojected onto the raster grid CRS.
 *
 * This function does not transform coordinates. It records the declaration that makes an
 * intersection expressible, and refuses to make it for a layer that is not in the boundary
 * CRS or that reports no features.
 */
export function declareReprojectedToGrid(layer: BoundaryCrsVectorLayer): GridAlignedVectorLayer {
  if (layer.crsId !== BOUNDARY_CRS_ID || layer.crsProj4 !== BOUNDARY_CRS_PROJ4) {
    throw new Error(
      `Layer ${layer.layerId} is not in the recorded boundary coordinate reference system, so reprojecting it onto the VLCE2 grid is not defined.`,
    );
  }
  if (layer.reprojectedFrom !== null) {
    throw new Error(`Layer ${layer.layerId} already declares a reprojection; it cannot be reprojected twice.`);
  }
  if (!Number.isSafeInteger(layer.featureCount) || layer.featureCount <= 0) {
    throw new Error(`Layer ${layer.layerId} must report a known positive feature count before it can be reprojected.`);
  }
  return Object.freeze({
    layerId: layer.layerId,
    featureCount: layer.featureCount,
    crsId: RASTER_GRID_CRS_ID,
    crsProj4: RASTER_GRID_CRS_PROJ4,
    reprojectedFrom: BOUNDARY_CRS_ID,
    reprojection: VECTOR_TO_GRID,
  });
}

/**
 * Plans a raster-to-vector intersection.
 *
 * The vector argument is typed `GridAlignedVectorLayer`, so a layer still carrying the
 * boundary CRS does not type-check at all: the two coordinate systems are offset by roughly
 * 6,000 km, and an unreprojected overlay is disjoint rather than subtly wrong. The raster
 * argument is typed `ConformantRasterYear` and carries `resampled: false`, so a warped
 * categorical raster cannot be supplied either. The runtime guards below are the second
 * line of defence for callers crossing an untyped boundary such as parsed JSON.
 *
 * No geometry is intersected here, nothing is ingested or stored, and the result is never
 * production eligible.
 */
export function planRasterVectorIntersection(
  raster: ConformantRasterYear,
  vector: GridAlignedVectorLayer,
): RasterVectorIntersection {
  const conflict = describeGridDeviation(raster);
  if (conflict) throw new Error(conflict.message.en);
  if (raster.resampled !== false) {
    throw new Error("The VLCE2 raster is categorical and is never resampled; reproject the vector side instead.");
  }
  if (vector.crsId !== RASTER_GRID_CRS_ID || vector.crsProj4 !== CANONICAL_GRID.crsProj4) {
    throw new Error(
      `Layer ${vector.layerId} has not been reprojected to the VLCE2 grid coordinate reference system and cannot be intersected with the raster.`,
    );
  }
  if (vector.reprojectedFrom !== BOUNDARY_CRS_ID) {
    throw new Error(`Layer ${vector.layerId} does not record what it was reprojected from.`);
  }
  if (vector.reprojection.from !== BOUNDARY_CRS_ID || vector.reprojection.to !== RASTER_GRID_CRS_ID) {
    throw new Error("The only admitted reprojection is boundary vectors onto the VLCE2 grid.");
  }

  return Object.freeze({
    year: raster.year,
    layerId: vector.layerId,
    crsId: RASTER_GRID_CRS_ID,
    featureCount: vector.featureCount,
    rasterResampled: false,
    vectorReprojectedFrom: BOUNDARY_CRS_ID,
    intersectionComputed: false,
    limitation: localized(
      "Intersection plan only. No reprojection and no intersection has been executed, and whether these boundaries fall inside the raster footprint is Unknown.",
      "Plan d'intersection seulement. Aucune reprojection ni intersection n'a été exécutée, et il est inconnu si ces limites se trouvent à l'intérieur de l'emprise du raster.",
    ),
    productionEligible: false,
  });
}
