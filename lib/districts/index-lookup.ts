/**
 * Reading the 960 m district index.
 *
 * The index itself is a plain little-endian uint16 array, row-major over the
 * canonical block grid, so a block is addressable by byte offset and a point
 * costs one two-byte range request rather than a download of the country. This
 * module holds the part that has to be understood rather than fetched: what a
 * stored value means.
 *
 *     0                  no district covers this block
 *     1 .. 39999         exactly one district, by legend position
 *     40000 + k          more than one, and k indexes the mixture table
 *
 * A mixture is not a failure. Districts are burned with ALL_TOUCHED, so any
 * block a boundary crosses holds every district that reaches into it, and a
 * point in such a block is genuinely within 960 m of a boundary. Returning the
 * candidates says that; returning one of them would not.
 */

import manifest from "@/data/phase6-district-index.json";

export const MIXTURE_BASE = 40000;
export const EMPTY_BLOCK = 0;

export type DistrictName = Readonly<Record<"en" | "fr", string>>;

export type DistrictIndexLayer = Readonly<{
  id: string;
  file: string;
  bytes: number;
  sha256: string;
  districts: number;
  legend: readonly Readonly<{ position: number; districtId: string; name: DistrictName }>[];
  mixtures: readonly (readonly number[])[];
}>;

export type DistrictLookup =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "single"; districtId: string; name: DistrictName }>
  | Readonly<{ kind: "mixture"; candidates: readonly Readonly<{ districtId: string; name: DistrictName }>[] }>;

const layers = manifest.layers as readonly DistrictIndexLayer[];

export const DISTRICT_INDEX_LAYER_IDS = layers.map((layer) => layer.id);
export const DISTRICT_INDEX_GRID_WIDTH = manifest.gridWidth;
export const DISTRICT_INDEX_GRID_HEIGHT = manifest.gridHeight;
export const DISTRICT_INDEX_BLOCK_METRES = manifest.blockMetres;
export const DISTRICT_INDEX_METHOD_VERSION = manifest.methodVersion;

export const FEDERAL_LAYER_ID = "federal-2023";
export const PROVINCIAL_LAYER_IDS = ["bc-2023", "ab-2019", "on-2022", "qc-2026"] as const;

export function districtIndexLayer(id: string): DistrictIndexLayer | null {
  return layers.find((layer) => layer.id === id) ?? null;
}

/** Turn a stored uint16 into what it means, without guessing past it. */
export function readIndexValue(layer: DistrictIndexLayer, value: number): DistrictLookup {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new RangeError("A district index value must be an unsigned 16-bit integer.");
  }
  if (value === EMPTY_BLOCK) return { kind: "empty" };

  if (value >= MIXTURE_BASE) {
    const members = layer.mixtures[value - MIXTURE_BASE];
    if (!members) throw new RangeError("The district index names a mixture the table does not hold.");
    return {
      kind: "mixture",
      candidates: members.map((position) => {
        const entry = layer.legend[position - 1];
        if (!entry || entry.position !== position) {
          throw new RangeError("The district index names a position the legend does not hold.");
        }
        return { districtId: entry.districtId, name: entry.name };
      }),
    };
  }

  const entry = layer.legend[value - 1];
  if (!entry || entry.position !== value) {
    throw new RangeError("The district index names a position the legend does not hold.");
  }
  return { kind: "single", districtId: entry.districtId, name: entry.name };
}
