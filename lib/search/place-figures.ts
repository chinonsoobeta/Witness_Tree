import source from "@/data/place-whole-record-measurements.json";
import type { BoundaryMeasurementCoverage } from "@/lib/explore/boundary-readout";

/**
 * Each published place's own figure for 1984 to 2022, for search.
 *
 * Built by scripts/build-place-region-measurements.mjs from the same census-
 * subdivision run that gives the map its cities-and-towns layer, with the same
 * method as the ridings. Server-only, like the place-name index it sits beside.
 */

const CELL_HECTARES = 0.09;
const EXPECTED_PLACES = 2291;
const FIELDS = ["unionLossCells", "knownForestCells", "unknownCells", "summedLossCells", "unmappedCells"] as const;

export type PlaceFigure = Readonly<{
  coverage: BoundaryMeasurementCoverage;
  /** Set only when the whole place was mapped. */
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  /** Forest detected as lost at least once where the place was mapped. */
  knownObservedSubtotalHectares: number;
  /** Mapped forest in 1984, the denominator of the share. */
  knownForestedHectares: number;
  /** The share of the place's forest-or-unknown area that is unknown, as for ridings. */
  unknownSharePercent: number | null;
  /** True when the satellite source has no data anywhere in the place. */
  noSatelliteData: boolean;
}>;

const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;

function parse(value: unknown): ReadonlyMap<string, PlaceFigure> {
  const record = value as Record<string, unknown>;
  if (
    record?.schema !== "witness-tree/place-whole-record-measurements/1" ||
    record.cellHectares !== CELL_HECTARES ||
    JSON.stringify(record.fields) !== JSON.stringify(FIELDS) ||
    JSON.stringify(record.span) !== JSON.stringify({ fromYear: 1984, toYear: 2022 }) ||
    record.places === null || typeof record.places !== "object"
  ) {
    throw new Error("The place figures have an invalid envelope.");
  }
  const figures = new Map<string, PlaceFigure>();
  for (const [id, row] of Object.entries(record.places as Record<string, unknown>)) {
    if (
      !/^\d{7}$/.test(id) || !Array.isArray(row) || row.length !== FIELDS.length ||
      !row.every((cell) => Number.isInteger(cell) && cell >= 0)
    ) {
      throw new Error(`Place ${id} has an invalid figure.`);
    }
    const [union, known, unknown, summed, unmapped] = row as number[];
    if (union > known || union > summed) throw new Error(`Place ${id} breaks a span invariant.`);
    const coverage: BoundaryMeasurementCoverage = unknown > 0 || unmapped > 0 ? "partial-with-unknown" : known === 0 ? "none-mapped" : "complete";
    const complete = coverage === "complete";
    figures.set(id, {
      coverage,
      observedLossPercent: complete ? (union / known) * 100 : null,
      observedLossHectares: complete ? hectares(union) : null,
      knownObservedSubtotalHectares: hectares(union),
      knownForestedHectares: hectares(known),
      unknownSharePercent: known + unknown > 0 ? (unknown / (known + unknown)) * 100 : null,
      noSatelliteData: known === 0 && unknown > 0,
    });
  }
  if (figures.size !== EXPECTED_PLACES) throw new Error(`Expected ${EXPECTED_PLACES} place figures, read ${figures.size}.`);
  return figures;
}

const PLACE_FIGURES = parse(source);

export function placeFigure(id: string): PlaceFigure | undefined {
  return PLACE_FIGURES.get(id);
}
