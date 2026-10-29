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
 * history, or in a server log. The one exception is deliberate and coarse: a
 * measured circle writes its centre, rounded to about 100 m, and its radius
 * into the address so the result can be shared. Whatever address text found
 * that centre is never part of it; lib/shapes/circle.ts refuses it.
 *
 * The counts come back from the coarse grid, not from the map tiles being
 * looked at. The tiles are simplified for drawing and would give a plausible
 * wrong answer.
 */

import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { useEffect, useId, useRef, useState } from "react";
import { formatYearRange, type Locale } from "@/lib/domain";
import { EXPLORE_COVERAGE_SPAN } from "@/lib/explore/types";
import {
  CIRCLE_RADII_KM,
  DEFAULT_CIRCLE_RADIUS_KM,
  circlePolygon,
  circleResultHref,
  drawPagePath,
  roundCentre,
  type CircleRadiusKm,
  type InitialCircle,
} from "@/lib/shapes/circle";
import { ShapeDrawMap } from "./ShapeDrawMap";
import { CircleCentreFinder, CircleDistricts, type DistrictState, type ResolvedDistricts } from "./ShapeCircle";

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
      "Mark out an area to see how much forest it lost. Your shape is measured and then discarded.",
    shapeKind: "Shape",
    rectangle: "Rectangle",
    polygon: "Polygon",
    circle: "Circle",
    centreLatitude: "Centre latitude",
    centreLongitude: "Centre longitude",
    radius: "Radius",
    kilometres: (value: number) => `${value} km`,
    noCentre: "Choose a centre first: find a place, click the map, or type its latitude and longitude.",
    centreFound: (label: string) => `Centre set to ${label}.`,
    circleHeading: (radius: number, latitude: string, longitude: string) =>
      `Within ${radius} km of ${latitude}, ${longitude}`,
    resultLink: "Link to this result",
    resultLinkNote: "The link holds only the centre, rounded to about 100 m, and the radius.",
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
      `Your shape lines up with whole ${block} m squares of data, so these numbers are exact counts, not estimates.`,
    precisionEdge: (block: number, edge: number, share: string) =>
      `The data comes in ${block} m squares, and your shape cuts through ${edge} of them. Those squares are counted in proportion to how much of each your shape covers, which makes up about ${share} of the middle number. The range shows the answer if none, or all, of them counted.`,
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
      "Délimitez une zone pour voir la forêt qu’elle a perdue. Votre forme est mesurée, puis supprimée.",
    shapeKind: "Forme",
    rectangle: "Rectangle",
    polygon: "Polygone",
    circle: "Cercle",
    centreLatitude: "Latitude du centre",
    centreLongitude: "Longitude du centre",
    radius: "Rayon",
    kilometres: (value: number) => `${value}\u00a0km`,
    noCentre:
      "Choisissez d’abord un centre\u202F: trouvez un lieu, cliquez sur la carte ou saisissez sa latitude et sa longitude.",
    centreFound: (label: string) => `Centre placé\u202F: ${label}.`,
    circleHeading: (radius: number, latitude: string, longitude: string) =>
      `Dans un rayon de ${radius}\u00a0km autour de la latitude ${latitude.replace(".", ",")} et de la longitude ${longitude.replace(".", ",")}`,
    resultLink: "Lien vers ce résultat",
    resultLinkNote: "Le lien contient seulement le centre, arrondi à environ 100\u00a0m, et le rayon.",
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
    resultsHeading: "Ce que dit le registre",
    unionHeading: "Forêt perturbée au moins une fois",
    unionExplain: "Chaque endroit est compté une seule fois, quel que soit le nombre de perturbations.",
    sumHeading: "Perturbations additionnées",
    sumExplain:
      "Un endroit perturbé au cours de deux années différentes est compté deux fois ici\u202F: ce total est donc toujours une superficie, jamais une proportion.",
    forestHeading: "Forêt au début de la période",
    shareLabel: "Proportion de cette forêt",
    between: (low: string, high: string) => `entre ${low} et ${high}`,
    hectares: (value: string) => `${value} ha`,
    precisionHeading: "Précision de ce résultat",
    precisionExact: (block: number) =>
      `Votre forme correspond à des carrés entiers de ${block} m, ces nombres sont donc des dénombrements exacts, et non des estimations.`,
    precisionEdge: (block: number, edge: number, share: string) =>
      edge === 1
        ? `Les données sont en carrés de ${block} m, et votre forme en traverse un. Ce carré est compté selon la part que votre forme en couvre, ce qui représente environ ${share} du nombre central. La fourchette donne le résultat obtenu si ce carré n’était pas compté, ou s’il l’était en entier.`
        : `Les données sont en carrés de ${block} m, et votre forme en traverse ${edge}. Ces carrés sont comptés selon la part que votre forme en couvre, ce qui représente environ ${share} du nombre central. La fourchette donne le résultat obtenu si aucun de ces carrés n’était compté, ou si tous l’étaient.`,
    precisionMissing: (blocks: number) =>
      blocks === 1
        ? "Un des carrés couverts par cette forme n’a jamais été mesuré\u202F: rien n’est donc affirmé à son sujet. Il est exclu plutôt que compté comme sans perte."
        : `${blocks} des carrés couverts par cette forme n’ont jamais été mesurés\u202F: rien n’est donc affirmé à leur sujet. Ils sont exclus plutôt que comptés comme sans perte.`,
    outsideGrid: (hectares: string) =>
      `La partie de cette forme située hors de la zone cartographiée, soit environ ${hectares} ha, n’est pas incluse.`,
    problem: "Cette zone n’a pas pu être mesurée.",
    unconfigured: "La mesure de zone n’est pas encore offerte sur ce site.",
    tooLarge: "Cette zone dépasse ce que cet outil mesure. Dessinez-en une plus petite.",
    tooSpreadOut: "Cette forme s’étend sur une trop grande partie de la carte pour être mesurée d’un coup.",
    offGrid: "Cette zone se trouve hors de la partie du Canada couverte par ce registre.",
    noArea: "Ces coins ne délimitent aucune aire.",
    tooFew: "Une zone doit avoir au moins trois coins.",
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

type CircleState = Readonly<{ latitude: number; longitude: number; radiusKm: CircleRadiusKm }>;
type MeasureOutcome = Readonly<{ measurement: Measurement }> | Readonly<{ kind: string | undefined; status: number }> | null;

/** The typed centre, rounded as its link will round it, or null when there is none. */
function centreFromText(text: Readonly<{ latitude: string; longitude: string }>): Corner | null {
  if (text.latitude.trim() === "" || text.longitude.trim() === "") return null;
  const latitude = Number(text.latitude);
  const longitude = Number(text.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) >= 89 || Math.abs(longitude) > 180) return null;
  return { latitude: roundCentre(latitude), longitude: roundCentre(longitude) };
}

async function requestMeasurement(points: readonly Corner[], startYear: number, endYear: number): Promise<MeasureOutcome> {
  try {
    const response = await fetch("/api/shape/measure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points, startYear, endYear }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { kind?: string };
      return { kind: body.kind, status: response.status };
    }
    return { measurement: (await response.json()) as Measurement };
  } catch {
    return null;
  }
}

/** The district route is given the rounded centre and nothing else. */
async function requestDistricts(centre: Corner): Promise<DistrictState> {
  try {
    const response = await fetch("/api/district/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: centre.latitude, longitude: centre.longitude }),
    });
    if (response.status === 422) return { status: "outside" };
    if (response.status === 503) return { status: "unavailable" };
    if (!response.ok) return { status: "failed" };
    return { status: "ready", resolved: (await response.json()) as ResolvedDistricts };
  } catch {
    return { status: "failed" };
  }
}

export function ShapeMeasureClient({
  locale,
  initialCircle = null,
  addressLookup = false,
  districtLookup = false,
  comparableFederalIds = [],
}: Readonly<{
  locale: Locale;
  /** A circle read from the page address, or null for the usual rectangle. */
  initialCircle?: InitialCircle | null;
  addressLookup?: boolean;
  districtLookup?: boolean;
  /** Federal ridings the Compare page can show, as `federal-<id>`. */
  comparableFederalIds?: readonly string[];
}>) {
  const words = copy[locale];
  const fieldId = useId();
  // Each control's id is a named value rather than an inline template, so a
  // reader (and the accessibility contract check) can see which label names
  // which input.
  const titleId = `${fieldId}-title`;
  const rectangleId = `${fieldId}-rectangle`;
  const polygonId = `${fieldId}-polygon`;
  const circleId = `${fieldId}-circle`;
  const kindName = `${fieldId}-kind`;
  const centreLatitudeId = `${fieldId}-centre-lat`;
  const centreLongitudeId = `${fieldId}-centre-lon`;
  const radiusName = `${fieldId}-radius`;
  const finderFormId = `${fieldId}-finder`;
  const finderInputId = `${fieldId}-finder-input`;
  const fromId = `${fieldId}-from`;
  const toId = `${fieldId}-to`;
  const [kind, setKind] = useState<"rectangle" | "polygon" | "circle">(initialCircle ? "circle" : "rectangle");
  const [edges, setEdges] = useState({ north: 45.44, south: 45.4, west: -75.72, east: -75.66 });
  const [corners, setCorners] = useState<Corner[]>(DEFAULT_CORNERS);
  const [centreText, setCentreText] = useState({
    latitude: initialCircle?.centre ? initialCircle.centre.latitude.toString() : "",
    longitude: initialCircle?.centre ? initialCircle.centre.longitude.toString() : "",
  });
  const [radiusKm, setRadiusKm] = useState<CircleRadiusKm>(initialCircle?.radiusKm ?? DEFAULT_CIRCLE_RADIUS_KM);
  const [centreNote, setCentreNote] = useState("");
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(LAST_YEAR);
  // A shared circle link is measured as soon as the page opens, so it starts busy.
  const [busy, setBusy] = useState(Boolean(initialCircle?.centre));
  const [problem, setProblem] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [measuredCircle, setMeasuredCircle] = useState<CircleState | null>(null);
  const [districts, setDistricts] = useState<DistrictState | null>(null);
  const finderRef = useRef<HTMLInputElement | null>(null);
  const centreLatitudeRef = useRef<HTMLInputElement | null>(null);
  const opened = useRef(false);

  const centre = centreFromText(centreText);
  const activeCorners =
    kind === "rectangle"
      ? cornersFromEdges(edges.north, edges.south, edges.west, edges.east)
      : kind === "circle"
        ? centre ? circlePolygon(centre, radiusKm) : []
        : corners;

  const years: number[] = [];
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) years.push(year);

  function settle(outcome: MeasureOutcome): boolean {
    if (outcome === null) {
      setProblem(words.problem);
      return false;
    }
    if ("measurement" in outcome) {
      setMeasurement(outcome.measurement);
      return true;
    }
    setProblem(problemText(words, outcome.kind, outcome.status));
    return false;
  }

  /*
   * A circle is measured from its rounded centre, the same one its link
   * carries, so opening the link reproduces this result rather than one about
   * 100 m away. The district lookup runs beside the measurement and is given
   * that centre alone.
   */
  function fetchCircle(circle: CircleState) {
    return Promise.all([
      requestMeasurement(circlePolygon(circle, circle.radiusKm), startYear, endYear),
      districtLookup ? requestDistricts(circle) : Promise.resolve<DistrictState>({ status: "unavailable" }),
    ]);
  }

  function showCircle(circle: CircleState, [outcome, found]: Awaited<ReturnType<typeof fetchCircle>>) {
    const measured = settle(outcome);
    setMeasuredCircle(measured ? circle : null);
    setDistricts(measured ? found : null);
    setBusy(false);
    if (measured) window.history.replaceState(window.history.state, "", circleResultHref(locale, circle));
  }

  async function measure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    setMeasurement(null);
    setMeasuredCircle(null);
    setDistricts(null);
    if (kind === "circle" && !centre) {
      setProblem(words.noCentre);
      return;
    }
    setBusy(true);
    try {
      if (kind === "circle" && centre) {
        const circle = { latitude: centre.latitude, longitude: centre.longitude, radiusKm };
        setCentreText({ latitude: centre.latitude.toString(), longitude: centre.longitude.toString() });
        showCircle(circle, await fetchCircle(circle));
        return;
      }
      settle(await requestMeasurement(activeCorners, startYear, endYear));
      // A rectangle or polygon never enters the address. A circle link left
      // over from before would describe a different result, so it is removed.
      if (window.location.search) window.history.replaceState(window.history.state, "", drawPagePath(locale));
    } finally {
      setBusy(false);
    }
  }

  // A shared circle link is answered on arrival. The home entry opens the page
  // with no centre yet, so it puts the reader in the address field instead, or
  // in the latitude field where there is no address service.
  useEffect(() => {
    if (opened.current || !initialCircle) return;
    opened.current = true;
    const start = initialCircle.centre;
    if (!start) {
      (finderRef.current ?? centreLatitudeRef.current)?.focus();
      return;
    }
    const circle = { latitude: start.latitude, longitude: start.longitude, radiusKm: initialCircle.radiusKm };
    void fetchCircle(circle).then((answers) => showCircle(circle, answers));
  });

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
          <label htmlFor={circleId}>
            <input
              id={circleId}
              type="radio"
              name={kindName}
              checked={kind === "circle"}
              onChange={() => setKind("circle")}
            />
            {words.circle}
          </label>
        </fieldset>

        {kind === "circle" ? (
          <fieldset className="shape-circle">
            <legend>{words.circle}</legend>
            {addressLookup ? (
              <CircleCentreFinder
                locale={locale}
                formId={finderFormId}
                inputId={finderInputId}
                inputRef={finderRef}
                onPoint={(point, label) => {
                  setCentreText({
                    latitude: roundCentre(point.latitude).toString(),
                    longitude: roundCentre(point.longitude).toString(),
                  });
                  setCentreNote(words.centreFound(label));
                }}
              />
            ) : null}
            <div className="shape-edges">
              <div className="shape-field">
                <label htmlFor={centreLatitudeId}>{words.centreLatitude}</label>
                <input
                  id={centreLatitudeId}
                  ref={centreLatitudeRef}
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={centreText.latitude}
                  onChange={(event) => {
                    const latitude = event.target.value;
                    setCentreText((previous) => ({ ...previous, latitude }));
                    setCentreNote("");
                  }}
                />
                <span className="shape-unit">{words.degrees}</span>
              </div>
              <div className="shape-field">
                <label htmlFor={centreLongitudeId}>{words.centreLongitude}</label>
                <input
                  id={centreLongitudeId}
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={centreText.longitude}
                  onChange={(event) => {
                    const longitude = event.target.value;
                    setCentreText((previous) => ({ ...previous, longitude }));
                    setCentreNote("");
                  }}
                />
                <span className="shape-unit">{words.degrees}</span>
              </div>
            </div>
            <p className="shape-note" role="status">{centreNote}</p>
            <fieldset className="shape-kind shape-radius">
              <legend>{words.radius}</legend>
              {CIRCLE_RADII_KM.map((radius) => {
                const radiusId = `${fieldId}-radius-${radius}`;
                return (
                  <label htmlFor={radiusId} key={radius}>
                    <input
                      id={radiusId}
                      type="radio"
                      name={radiusName}
                      checked={radiusKm === radius}
                      onChange={() => setRadiusKm(radius)}
                    />
                    {words.kilometres(radius)}
                  </label>
                );
              })}
            </fieldset>
          </fieldset>
        ) : kind === "rectangle" ? (
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
          corners={activeCorners}
          maxCorners={MAX_CORNERS}
          onPolygon={setCorners}
          onRectangle={setEdges}
          centre={centre}
          onCentre={(point) => {
            setCentreText(
              point
                ? { latitude: roundCentre(point.latitude).toString(), longitude: roundCentre(point.longitude).toString() }
                : { latitude: "", longitude: "" },
            );
            setCentreNote("");
          }}
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
        {measurement && measuredCircle ? (
          <h3>
            {words.circleHeading(
              measuredCircle.radiusKm,
              measuredCircle.latitude.toFixed(3),
              measuredCircle.longitude.toFixed(3),
            )}
          </h3>
        ) : null}
        {measurement ? (
          <ShapeMeasurementResult locale={locale} measurement={measurement} />
        ) : null}
        {measurement && measuredCircle && districts ? (
          <>
            <CircleDistricts locale={locale} state={districts} comparableFederalIds={comparableFederalIds} />
            <p className="shape-note">
              <a href={circleResultHref(locale, measuredCircle)}>{words.resultLink}</a> {words.resultLinkNote}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function ShapeMeasurementResult({ locale, measurement }: Readonly<{ locale: Locale; measurement: Measurement }>) {
  const words = copy[locale];
  const bracket = (value: Bracket): string =>
    words.between(formatHectares(locale, value.low), formatHectares(locale, value.high));

  return (
    <>
      <h3>{words.resultsHeading}</h3>
      <CoverageStatement locale={locale} variant="panel">
        <p>{locale === "en"
          ? "The figures below cover only the part that could be measured. Land with no data is left out, never counted as no loss."
          : "Les chiffres ci-dessous portent seulement sur la partie qui a pu être mesurée. Le territoire sans données est exclu, jamais compté comme sans perte."}</p>
        <div className="shape-coverage-states">
          <div>
            <h3>{locale === "en" ? "Blocks without data" : "Carrés sans données"}</h3>
            <p>{words.precisionMissing(measurement.coverage.blocksWithoutData)}</p>
          </div>
          <div>
            <h3>{locale === "en" ? "Outside the mapped area" : "Hors de la zone cartographiée"}</h3>
            <p>{words.outsideGrid(formatHectares(locale, measurement.coverage.outsideGridHectares))}</p>
          </div>
        </div>
      </CoverageStatement>
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
            ? `${MISSING} ${locale === "en" ? "No forest denominator is available." : "Aucun dénominateur forestier n’est disponible."}`
            : formatShare(locale, measurement.unionShareOfForest)}
        </dd>

        <dt>{words.forestHeading}</dt>
        <dd>
          {words.hectares(formatHectares(locale, measurement.forestHectares.estimate))}{" "}
          <span className="shape-range">{bracket(measurement.forestHectares)}</span>
        </dd>

        <dt>{words.sumHeading}</dt>
        <dd>
          {words.hectares(formatHectares(locale, measurement.sumHectares.estimate))}{" "}
          <span className="shape-range">{bracket(measurement.sumHectares)}</span>
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

    </>
  );
}
