"use client";

/**
 * Measuring an area someone chooses themselves.
 *
 * The corners are the state, and every way of setting them writes to the same
 * list. A rectangle is four corners derived from its edges; a polygon is the
 * corners as entered; a shape drawn on the map, when the map is present, sets
 * the same list. That keeps the keyboard path and the pointer path the same
 * feature rather than two features of unequal quality, and it is why the
 * corners are always visible and always editable as numbers.
 *
 * The shape goes out as a POST body and never into the page's own address, so
 * a shape drawn around someone's own land does not end up in a link, in
 * history, or in a server log.
 *
 * The counts come back from the coarse grid, not from the map tiles being
 * looked at. The tiles are simplified for drawing and would give a plausible
 * wrong answer.
 */

import { useId, useState } from "react";
import { formatYearRange, type Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_SPAN } from "@/lib/explore/types";
import { ShapeDrawMap } from "./ShapeDrawMap";

type Corner = Readonly<{ latitude: number; longitude: number }>;
type Bracket = Readonly<{ low: number; estimate: number; high: number }>;

type Measurement = Readonly<{
  startYear: number;
  endYear: number;
  unionHectares: Bracket;
  sumHectares: Bracket;
  forestHectares: Bracket;
  unionShareOfForest: number | null;
  coverage: Readonly<{
    blocks: number;
    interiorBlocks: number;
    edgeBlocks: number;
    blocksWithoutData: number;
    shapeHectares: number;
    outsideGridHectares: number;
    edgeShareOfEstimate: number;
  }>;
  precision: Readonly<{ blockMetres: number; exact: boolean }>;
}>;

/*
 * The measurable span is the archive's span. It was written out again here,
 * which is how this control could have gone on offering a year the archive
 * cannot answer after the archive moved.
 */
const FIRST_YEAR = EXPLORE_COVERAGE_SPAN.fromYear;
const LAST_YEAR = EXPLORE_COVERAGE_SPAN.toYear;
const MISSING = "–";
// The worker refuses a shape with more vertices than this, so the pointer path
// stops adding at the same number rather than letting a reader draw a shape the
// measurement will then reject.
const MAX_CORNERS = 250;

const copy = {
  en: {
    title: "Measure an area you choose",
    intro:
      "Set the corners of an area and read what the record says about it. The shape is sent to be measured and is not kept.",
    shapeKind: "Shape",
    rectangle: "Rectangle",
    polygon: "Polygon",
    north: "North edge",
    south: "South edge",
    west: "West edge",
    east: "East edge",
    corners: "Corners",
    cornerLatitude: (index: number) => `Corner ${index} latitude`,
    cornerLongitude: (index: number) => `Corner ${index} longitude`,
    addCorner: "Add a corner",
    removeCorner: (index: number) => `Remove corner ${index}`,
    from: "From",
    to: "To",
    submit: "Measure this area",
    measuring: "Measuring",
    clear: "Clear",
    degrees: "degrees",
    resultsHeading: "What the record says",
    unionHeading: "Forest disturbed at least once",
    unionExplain: "Each place is counted once, however many times it was disturbed.",
    sumHeading: "Disturbance events added together",
    sumExplain:
      "A place disturbed in two different years is counted twice here, so this is only ever an amount of land, never a share of it.",
    forestHeading: "Forest at the start of the period",
    shareLabel: "Share of that forest",
    between: (low: string, high: string) => `between ${low} and ${high}`,
    hectares: (value: string) => `${value} ha`,
    precisionHeading: "How precise this is",
    precisionExact: (block: number) =>
      `Every part of this shape fell inside whole ${block} m squares of the record, so these numbers are counts rather than estimates.`,
    precisionEdge: (block: number, edge: number, share: string) =>
      `The record answers in ${block} m squares. This shape cuts through ${edge} of them, so their contribution is scaled by how much of each square the shape covers. That scaling accounts for about ${share} of the middle number, and the range around it is what the answer would be if none, or all, of those squares counted.`,
    precisionMissing: (blocks: number) =>
      `${blocks} of the squares this shape covers were never measured, so nothing is claimed about them. They are left out rather than counted as no loss.`,
    outsideGrid: (hectares: string) =>
      `About ${hectares} ha of this shape falls outside the mapped area and is not included.`,
    problem: "That area could not be measured.",
    unconfigured: "Area measurement is not available on this site yet.",
    tooLarge: "That area is larger than this tool will measure. Draw a smaller one.",
    tooSpreadOut: "That shape reaches across too much of the map to measure at once.",
    offGrid: "That area is outside the part of Canada this record covers.",
    noArea: "Those corners do not enclose an area.",
    tooFew: "An area needs at least three corners.",
    badYears: `Choose a period inside ${formatYearRange(EXPLORE_COVERAGE_SPAN, "en", "span")}.`,
  },
  fr: {
    title: "Mesurer une zone de votre choix",
    intro:
      "Placez les coins d'une zone et lisez ce que le relevé en dit. La forme est envoyée pour être mesurée et n'est pas conservée.",
    shapeKind: "Forme",
    rectangle: "Rectangle",
    polygon: "Polygone",
    north: "Limite nord",
    south: "Limite sud",
    west: "Limite ouest",
    east: "Limite est",
    corners: "Coins",
    cornerLatitude: (index: number) => `Latitude du coin ${index}`,
    cornerLongitude: (index: number) => `Longitude du coin ${index}`,
    addCorner: "Ajouter un coin",
    removeCorner: (index: number) => `Retirer le coin ${index}`,
    from: "De",
    to: "À",
    submit: "Mesurer cette zone",
    measuring: "Mesure en cours",
    clear: "Effacer",
    degrees: "degrés",
    resultsHeading: "Ce que dit le relevé",
    unionHeading: "Forêt perturbée au moins une fois",
    unionExplain: "Chaque endroit est compté une seule fois, quel que soit le nombre de perturbations.",
    sumHeading: "Perturbations additionnées",
    sumExplain:
      "Un endroit perturbé deux années différentes est compté deux fois ici, donc il s'agit toujours d'une superficie et jamais d'une proportion.",
    forestHeading: "Forêt au début de la période",
    shareLabel: "Proportion de cette forêt",
    between: (low: string, high: string) => `entre ${low} et ${high}`,
    hectares: (value: string) => `${value} ha`,
    precisionHeading: "Précision de ce résultat",
    precisionExact: (block: number) =>
      `Chaque partie de cette forme se trouvait à l'intérieur de carrés entiers de ${block} m du relevé, donc ces nombres sont des comptes et non des estimations.`,
    precisionEdge: (block: number, edge: number, share: string) =>
      `Le relevé répond par carrés de ${block} m. Cette forme en traverse ${edge}, dont l'apport est donc réduit selon la part du carré que la forme couvre. Cet ajustement représente environ ${share} du nombre central, et la fourchette indique le résultat si aucun, ou si tous, ces carrés comptaient.`,
    precisionMissing: (blocks: number) =>
      `${blocks} des carrés couverts par cette forme n'ont jamais été mesurés, donc rien n'est affirmé à leur sujet. Ils sont exclus plutôt que comptés comme sans perte.`,
    outsideGrid: (hectares: string) =>
      `Environ ${hectares} ha de cette forme se trouvent hors de la zone cartographiée et ne sont pas inclus.`,
    problem: "Cette zone n'a pas pu être mesurée.",
    unconfigured: "La mesure de zone n'est pas encore offerte sur ce site.",
    tooLarge: "Cette zone dépasse ce que cet outil mesure. Dessinez-en une plus petite.",
    tooSpreadOut: "Cette forme s'étend sur une trop grande partie de la carte pour être mesurée d'un coup.",
    offGrid: "Cette zone se trouve hors de la partie du Canada couverte par ce relevé.",
    noArea: "Ces coins ne délimitent aucune aire.",
    tooFew: "Une zone a besoin d'au moins trois coins.",
    badYears: `Choisissez une période comprise ${formatYearRange(EXPLORE_COVERAGE_SPAN, "fr", "between")}.`,
  },
} as const;

const DEFAULT_CORNERS: Corner[] = [
  { latitude: 45.44, longitude: -75.72 },
  { latitude: 45.44, longitude: -75.66 },
  { latitude: 45.4, longitude: -75.66 },
  { latitude: 45.4, longitude: -75.72 },
];

function cornersFromEdges(north: number, south: number, west: number, east: number): Corner[] {
  return [
    { latitude: north, longitude: west },
    { latitude: north, longitude: east },
    { latitude: south, longitude: east },
    { latitude: south, longitude: west },
  ];
}

function formatHectares(locale: Locale, value: number): string {
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  const digits = value > 0 && value < 10 ? 1 : 0;
  return new Intl.NumberFormat(tag, { maximumFractionDigits: digits }).format(value);
}

function formatShare(locale: Locale, value: number): string {
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

/** Turns a refusal from the route into the sentence that explains it. */
function problemText(words: (typeof copy)[Locale], kind: string | undefined, status: number): string {
  if (status === 503) return words.unconfigured;
  switch (kind) {
    case "too-large":
      return words.tooLarge;
    case "too-spread-out":
      return words.tooSpreadOut;
    case "off-grid":
      return words.offGrid;
    case "no-area":
      return words.noArea;
    case "too-few-vertices":
      return words.tooFew;
    case "window":
      return words.badYears;
    default:
      return words.problem;
  }
}

export function ShapeMeasureClient({ locale }: { locale: Locale }) {
  const words = copy[locale];
  const fieldId = useId();
  // Each control's id is a named value rather than an inline template, so a
  // reader (and the accessibility contract check) can see which label names
  // which input.
  const titleId = `${fieldId}-title`;
  const rectangleId = `${fieldId}-rectangle`;
  const polygonId = `${fieldId}-polygon`;
  const kindName = `${fieldId}-kind`;
  const fromId = `${fieldId}-from`;
  const toId = `${fieldId}-to`;
  const [kind, setKind] = useState<"rectangle" | "polygon">("rectangle");
  const [edges, setEdges] = useState({ north: 45.44, south: 45.4, west: -75.72, east: -75.66 });
  const [corners, setCorners] = useState<Corner[]>(DEFAULT_CORNERS);
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(LAST_YEAR);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  const activeCorners =
    kind === "rectangle" ? cornersFromEdges(edges.north, edges.south, edges.west, edges.east) : corners;

  const years: number[] = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) years.push(year);

  async function measure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setMeasurement(null);
    try {
      const response = await fetch("/api/shape/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: activeCorners, startYear, endYear }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { kind?: string };
        setProblem(problemText(words, body.kind, response.status));
        return;
      }
      setMeasurement((await response.json()) as Measurement);
    } catch {
      setProblem(words.problem);
    } finally {
      setBusy(false);
    }
  }

  const bracket = (value: Bracket): string =>
    words.between(formatHectares(locale, value.low), formatHectares(locale, value.high));

  return (
    <section className="shape-measure" aria-labelledby={titleId}>
      <h2 id={titleId}>{words.title}</h2>
      <p className="shape-measure-intro">{words.intro}</p>

      <form onSubmit={measure}>
        <fieldset className="shape-kind">
          <legend>{words.shapeKind}</legend>
          <label htmlFor={rectangleId}>
            <input
              id={rectangleId}
              type="radio"
              name={kindName}
              checked={kind === "rectangle"}
              onChange={() => setKind("rectangle")}
            />
            {words.rectangle}
          </label>
          <label htmlFor={polygonId}>
            <input
              id={polygonId}
              type="radio"
              name={kindName}
              checked={kind === "polygon"}
              onChange={() => setKind("polygon")}
            />
            {words.polygon}
          </label>
        </fieldset>

        {kind === "rectangle" ? (
          <fieldset className="shape-edges">
            <legend>{words.rectangle}</legend>
            {(["north", "south", "west", "east"] as const).map((edge) => {
              const edgeId = `${fieldId}-${edge}`;
              return (
              <div className="shape-field" key={edge}>
                <label htmlFor={edgeId}>{words[edge]}</label>
                <input
                  id={edgeId}
                  type="number"
                  step="0.0001"
                  inputMode="decimal"
                  value={edges[edge]}
                  onChange={(event) =>
                    setEdges((previous) => ({ ...previous, [edge]: Number(event.target.value) }))
                  }
                />
                <span className="shape-unit">{words.degrees}</span>
              </div>
              );
            })}
          </fieldset>
        ) : (
          <fieldset className="shape-corners">
            <legend>{words.corners}</legend>
            {corners.map((corner, index) => {
              const latitudeId = `${fieldId}-lat-${index}`;
              const longitudeId = `${fieldId}-lon-${index}`;
              return (
              <div className="shape-corner" key={latitudeId}>
                <div className="shape-field">
                  <label htmlFor={latitudeId}>{words.cornerLatitude(index + 1)}</label>
                  <input
                    id={latitudeId}
                    type="number"
                    step="0.0001"
                    inputMode="decimal"
                    value={corner.latitude}
                    onChange={(event) =>
                      setCorners((previous) =>
                        previous.map((entry, position) =>
                          position === index ? { ...entry, latitude: Number(event.target.value) } : entry,
                        ),
                      )
                    }
                  />
                </div>
                <div className="shape-field">
                  <label htmlFor={longitudeId}>{words.cornerLongitude(index + 1)}</label>
                  <input
                    id={longitudeId}
                    type="number"
                    step="0.0001"
                    inputMode="decimal"
                    value={corner.longitude}
                    onChange={(event) =>
                      setCorners((previous) =>
                        previous.map((entry, position) =>
                          position === index ? { ...entry, longitude: Number(event.target.value) } : entry,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={corners.length <= 3}
                  onClick={() => setCorners((previous) => previous.filter((_, position) => position !== index))}
                >
                  {words.removeCorner(index + 1)}
                </button>
              </div>
              );
            })}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() =>
                setCorners((previous) => [...previous, previous[previous.length - 1] ?? DEFAULT_CORNERS[0]])
              }
            >
              {words.addCorner}
            </button>
          </fieldset>
        )}

        <ShapeDrawMap
          locale={locale}
          kind={kind}
          corners={kind === "rectangle" ? activeCorners : corners}
          maxCorners={MAX_CORNERS}
          onPolygon={setCorners}
          onRectangle={setEdges}
        />

        <div className="shape-period">
          <div className="shape-field">
            <label htmlFor={fromId}>{words.from}</label>
            <select
              id={fromId}
              value={startYear}
              onChange={(event) => setStartYear(Number(event.target.value))}
            >
              {years.slice(0, -1).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="shape-field">
            <label htmlFor={toId}>{words.to}</label>
            <select id={toId} value={endYear} onChange={(event) => setEndYear(Number(event.target.value))}>
              {years.slice(1).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? words.measuring : words.submit}
        </button>
      </form>

      <div className="shape-results" aria-live="polite">
        {problem ? <p className="shape-problem">{problem}</p> : null}
        {measurement ? (
          <>
            <h3>{words.resultsHeading}</h3>
            <dl className="shape-readout">
              <dt>{words.unionHeading}</dt>
              <dd>
                <strong>{words.hectares(formatHectares(locale, measurement.unionHectares.estimate))}</strong>{" "}
                <span className="shape-range">{bracket(measurement.unionHectares)}</span>
                <span className="shape-note">{words.unionExplain}</span>
              </dd>

              <dt>{words.shareLabel}</dt>
              <dd>
                {measurement.unionShareOfForest === null
                  ? MISSING
                  : formatShare(locale, measurement.unionShareOfForest)}
              </dd>

              <dt>{words.forestHeading}</dt>
              <dd>{words.hectares(formatHectares(locale, measurement.forestHectares.estimate))}</dd>

              <dt>{words.sumHeading}</dt>
              <dd>
                {words.hectares(formatHectares(locale, measurement.sumHectares.estimate))}
                <span className="shape-note">{words.sumExplain}</span>
              </dd>
            </dl>

            <h3>{words.precisionHeading}</h3>
            <p className="shape-precision">
              {measurement.precision.exact
                ? words.precisionExact(measurement.precision.blockMetres)
                : words.precisionEdge(
                    measurement.precision.blockMetres,
                    measurement.coverage.edgeBlocks,
                    formatShare(locale, measurement.coverage.edgeShareOfEstimate),
                  )}
            </p>
            {measurement.coverage.blocksWithoutData > 0 ? (
              <p className="shape-precision">{words.precisionMissing(measurement.coverage.blocksWithoutData)}</p>
            ) : null}
            {measurement.coverage.outsideGridHectares > 0 ? (
              <p className="shape-precision">
                {words.outsideGrid(formatHectares(locale, measurement.coverage.outsideGridHectares))}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
