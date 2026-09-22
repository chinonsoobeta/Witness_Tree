"use client";

import { useEffect, useState } from "react";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";

import {
  ConfidenceBadge,
  CoverageBand,
  EvidenceChip,
  ProvenanceBlock,
} from "@/components/policy";
import { colon, formatNumber, formatPercent, formatYearRange, formatYearRangeKey, labelled, yearRange, type Locale } from "@/lib/domain";
import {
  BOUNDARY_OVERLAY_IDS,
  BOUNDARY_OVERLAYS,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_MODES,
  EXPLORE_PRODUCTION_LAYER,
  exploreHref,
  fixturesForYear,
  formatUnknownSharePercent,
  fourProvinceAnnualForYear,
  perCellArchiveSpan,
  perCellCauseForMode,
  fourProvinceSpanMeasurement,
  provinceSpanMeasurements,
  provinceSpanReach,
  serializeBoundaryOverlays,
  toggleBoundaryOverlay,
  type BoundaryOverlayId,
  type ExploreDataView,
  type ExploreEvent,
  type ExploreMode,
  type ExplorePresentation,
  type RidingBoundaryMeasurement,
} from "@/lib/explore";
import { ExploreMapClient } from "./ExploreMapClient";
import { ExploreYearControl } from "./ExploreYearControl";

const copy = {
  en: {
    title: "Explore",
    yearHeading: "Year",
    mapHeading: "Map",
    layersHeading: "Layers and overlays",
    dataViewsHeading: "Data views",
    mapHidden:
      "The map is hidden in the List presentation. Choose Map above to show it.",
    production:
      `The province figures on the map and in the list, chart, and table are for the span the year control has selected, and follow it; any span within ${provinceSpanReach("en")} can be chosen. Each place counts once however many times it was cleared, against the forest known at the start of the span. No per-cell patches are drawn for the selected year. Nothing here has been checked against conditions on the ground, and the source maps only part of each province, so every figure is a minimum.`,
    productionWithPerCell:
      `Each layer on this page carries its own period, so no single span describes the whole view. The provinces on the map and the list, chart, and table are for the span the year control has selected, and follow it; any span within ${provinceSpanReach("en")} can be chosen. Each place counts once however many times it was cleared, against the forest known at the start of the span. The per-cell patches drawn as you zoom in, traced from the 30 m grid for British Columbia, Alberta, Ontario and Québec, cover the same span: every patch lost in any year of it. The per-cell figures below are one annual interval only, the last of the span, which the heading below names; they are counted from the exact cell inventory, not from the drawn patches, which are simplified for display and cannot be added up. Nothing here has been checked against conditions on the ground, and the source maps only part of each province, so every figure is a minimum.`,
    annualHeading: "Per-cell detected loss",
    annualDetected: "Detected loss (ha)",
    annualHarvest: "Recorded harvest (ha)",
    annualFire: "Recorded fire (ha)",
    annualUnattributed: "Cause not recorded (ha)",
    annualBasis:
      `This is one annual interval, the one ending in the last year selected, for British Columbia, Alberta, Ontario and Québec together. It is not a total for a wider span, not a total for ${perCellArchiveSpan("en")}, and not the province figures for the selected span. Counted from the exact 30 m cell inventory behind the map. One cell is 0.09 ha.`,
    annualNone: "No per-cell interval covers this year and mode.",
    conditionRecoveryNone: "Condition and recovery is not mapped yet. The annual land-cover series it would read is already on file; what is missing is a recorded decision on which land-cover classes count as treed cover returning after a loss, and the admission and review of a product built on that decision.",
    spanNote: (fromYear: number, toYear: number) =>
      `The provinces are shaded for the whole span, ${fromYear} to ${toYear}, and a district boundary you point at or select on the map reads out its figures for the same span: the forest lost at least once inside it, counted once no matter how many times a place was cleared. Districts are drawn as outlines only and are not shaded. Where a district lost the same ground more than once, the yearly losses added together are shown alongside, in hectares only. That figure has no denominator and is never given as a share. The per-cell patches drawn on the map cover the same span, one patch for each year a place was lost in it.`,
    spanPending:
      "District figures for the selected years are loading. Until they arrive they are held back rather than shown under years they were not measured over.",
    fixtureList:
      "The list, chart, and table use illustrative fixtures. This view does not imply a production geographic layer.",
    empty: (mode: string, year: number, nearest: number) =>
      `No illustrative data-view record exists for ${mode} in ${year}. The nearest illustrative year is ${nearest}.`,
    year: "Year",
    presentation: "Presentation",
    map: "Map",
    list: "List",
    data: "Data",
    chart: "Chart",
    table: "Table",
    overlays: "Boundary overlays",
    show: "Show",
    hide: "Hide",
    shown: "Shown on the map",
    notAvailable: "Not available yet",
    whyNot: "Why not",
    overlaysNote:
      "Reference boundaries drawn over the map. They show where something is and who represents it. They never carry a loss figure of their own.",
    event: "Event",
    evidence: "Evidence",
    confidence: "Confidence",
    coverage: "Coverage",
    observedLoss: "Detected loss (ha)",
    observedLossPercent: "Detected loss (%)",
    fourProvinces: "The four provinces together",
    partial: "Some pixels unknown, so this is a minimum",
    unknownArea: "ha unknown",
    source: "Source attribution",
    modes: {
      "forest-change": "Forest loss",
      "recorded-harvest": "Recorded harvest",
      wildfire: "Wildfire",
      "condition-recovery": "Condition and recovery",
    },
    modeStatus: {
      "forest-change":
        "Real map intervals: 1985–2022; real province figures: any span within 1984–2022.",
      "recorded-harvest":
        "Real map intervals: 1985–2022. Illustrative data view: 2012; other data-view years have no illustrative record.",
      wildfire:
        "Real map intervals: 1985–2022. Illustrative data view: 2020; other data-view years have no illustrative record.",
      "condition-recovery":
        "No real map data. Illustrative data view: 1988; every other year has neither.",
    },
  },
  fr: {
    title: "Explorer",
    yearHeading: "Année",
    mapHeading: "Carte",
    layersHeading: "Couches et superpositions",
    dataViewsHeading: "Vues des données",
    mapHidden:
      "La carte est masquée dans la présentation en liste. Choisissez Carte ci-dessus pour l’afficher.",
    production:
      `Les chiffres provinciaux de la carte, de la liste, du graphique et du tableau portent sur la période choisie par la commande d’année et la suivent; toute période ${provinceSpanReach("fr", "from")} peut être choisie. Chaque lieu compte une seule fois, peu importe le nombre de coupes, par rapport à la forêt connue au début de la période. Aucune parcelle par cellule n’est dessinée pour l’année choisie. Rien ici n’a été vérifié sur le terrain, et la source ne cartographie qu’une partie de chaque province\u202F: chaque chiffre est donc un minimum.`,
    productionWithPerCell:
      `Chaque couche de cette page porte sa propre période\u202F; aucune période unique ne décrit donc l’ensemble de la vue. Les provinces de la carte ainsi que la liste, le graphique et le tableau portent sur la période choisie par la commande d’année et la suivent; toute période ${provinceSpanReach("fr", "from")} peut être choisie. Chaque lieu compte une seule fois, peu importe le nombre de coupes, par rapport à la forêt connue au début de la période. Les parcelles par cellule dessinées au fur et à mesure du zoom, tracées à partir de la grille de 30 m pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec, couvrent la même période\u202F: toutes les parcelles perdues au cours de n’importe laquelle de ses années. Les chiffres par cellule ci-dessous ne portent que sur un intervalle annuel, le dernier de la période, que nomme le titre ci-dessous\u202F; ils sont comptés à partir de l’inventaire exact des cellules, et non des parcelles dessinées, qui sont simplifiées pour l’affichage et ne peuvent pas être additionnées. Rien ici n’a été vérifié sur le terrain, et la source ne cartographie qu’une partie de chaque province\u202F: chaque chiffre est donc un minimum.`,
    annualHeading: "Perte détectée par cellule",
    annualDetected: "Perte détectée (ha)",
    annualHarvest: "Récoltes consignées (ha)",
    annualFire: "Incendies consignés (ha)",
    annualUnattributed: "Cause non consignée (ha)",
    annualBasis:
      `Il s’agit d’un seul intervalle annuel, celui qui se termine à la dernière année choisie, pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec ensemble. Ce n’est pas un total pour une période plus large, ni pour ${perCellArchiveSpan("fr")}, ni les chiffres provinciaux de la période choisie. Comptée à partir de l’inventaire exact des cellules de 30 m derrière la carte. Une cellule représente 0,09 ha.`,
    annualNone: "Aucun intervalle par cellule ne couvre cette année et ce mode.",
    conditionRecoveryNone: "L’état et le rétablissement ne sont pas encore cartographiés. La série annuelle de couverture terrestre qu’ils utiliseraient est déjà conservée; il manque une décision consignée sur les classes de couverture terrestre qui comptent comme un couvert arboré revenant après une perte, ainsi que l’admission et l’examen d’un produit fondé sur cette décision.",
    spanNote: (fromYear: number, toYear: number) =>
      `Les provinces sont ombrées pour toute la période, de ${fromYear} à ${toYear}, et une limite de circonscription pointée ou choisie sur la carte affiche ses chiffres pour la même période : la forêt perdue au moins une fois, comptée une seule fois peu importe le nombre de coupes. Les circonscriptions sont tracées en contour seulement et ne sont pas ombrées. Lorsqu’une circonscription a perdu le même terrain plus d’une fois, les pertes annuelles additionnées sont affichées à côté, en hectares seulement. Ce chiffre n’a pas de dénominateur et n’est jamais présenté comme une part. Les parcelles par cellule dessinées sur la carte couvrent la même période, une parcelle pour chaque année où un lieu y a été perdu.`,
    spanPending:
      "Les chiffres par circonscription pour les années choisies sont en cours de chargement. D’ici là, ils sont retenus plutôt qu’affichés sous des années qu’ils ne mesurent pas.",
    fixtureList:
      "La liste, le graphique et le tableau utilisent des exemples illustratifs. Cette vue n’implique aucune couche géographique de production.",
    empty: (mode: string, year: number, nearest: number) =>
      `Aucun dossier illustratif de vue des données n’existe pour ${mode} en ${year}. L’année illustrative la plus proche est ${nearest}.`,
    year: "Année",
    presentation: "Présentation",
    map: "Carte",
    list: "Liste",
    data: "Données",
    chart: "Graphique",
    table: "Tableau",
    overlays: "Superpositions de limites",
    show: "Afficher",
    hide: "Masquer",
    shown: "Affiché sur la carte",
    notAvailable: "Pas encore disponible",
    whyNot: "Pourquoi",
    overlaysNote:
      "Limites de référence tracées sur la carte. Elles indiquent où se trouve un lieu et qui le représente. Elles ne portent jamais de chiffre de perte.",
    event: "Événement",
    evidence: "Preuve",
    confidence: "Confiance",
    coverage: "Couverture",
    observedLoss: "Perte détectée (ha)",
    observedLossPercent: "Perte détectée (%)",
    fourProvinces: "Les quatre provinces ensemble",
    partial: "Certains pixels sont inconnus; il s’agit donc d’un minimum",
    unknownArea: "ha inconnus",
    source: "Attribution de la source",
    modes: {
      "forest-change": "Perte forestière",
      "recorded-harvest": "Récolte consignée",
      wildfire: "Incendies",
      "condition-recovery": "État et rétablissement",
    },
    modeStatus: {
      "forest-change":
        "Intervalles cartographiques réels : 1985–2022; chiffres provinciaux réels : toute période comprise dans 1984–2022.",
      "recorded-harvest":
        "Intervalles cartographiques réels : 1985–2022. Vue des données illustrative : 2012; les autres années n’ont aucun dossier illustratif.",
      wildfire:
        "Intervalles cartographiques réels : 1985–2022. Vue des données illustrative : 2020; les autres années n’ont aucun dossier illustratif.",
      "condition-recovery":
        "Aucune donnée cartographique réelle. Vue des données illustrative : 1988; toutes les autres années n’ont ni l’une ni l’autre.",
    },
  },
} as const;

function symbol(mode: ExploreMode, x: number) {
  if (mode === "recorded-harvest")
    return <circle cx={x} cy="55" r="24" fill="url(#dots)" stroke="currentColor" />;
  if (mode === "wildfire")
    return (
      <polygon
        points={`${x},25 ${x + 28},55 ${x},85 ${x - 28},55`}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    );
  if (mode === "condition-recovery")
    return (
      <path
        d={`M${x - 25} 30 L${x + 25} 80 M${x + 25} 30 L${x - 25} 80`}
        stroke="currentColor"
        strokeWidth="5"
      />
    );
  return (
    <rect
      x={x - 25}
      y="30"
      width="50"
      height="50"
      fill="url(#hatch)"
      stroke="currentColor"
    />
  );
}

function href(
  mode: ExploreMode,
  presentation: ExplorePresentation,
  data: ExploreDataView,
  year: number,
  overlays: readonly BoundaryOverlayId[] = [],
  fromYear?: number,
) {
  return exploreHref({ mode, presentation, data, year, overlays, fromYear });
}

function Details({ event, locale }: { event: ExploreEvent; locale: Locale }) {
  const text = copy[locale];
  return (
    <>
      <EvidenceChip evidence={event.evidence} locale={locale} /> · {text.confidence}
      {colon(locale)} <ConfidenceBadge confidence={event.confidence} locale={locale} /> ·{" "}
      {text.coverage}
      {colon(locale)} <CoverageBand coverageGrade={event.coverageGrade} locale={locale} />
      <span>{event.unknownReason ? `${colon(locale)} ${event.unknownReason}` : ""}</span>
      <p>
        {text.source}
        {colon(locale)} <ProvenanceBlock provenance={event.provenance} locale={locale} />
      </p>
    </>
  );
}

export function ExploreView({
  events,
  locale,
  mode = "forest-change",
  presentation = "map",
  data = "chart",
  year = EXPLORE_DEFAULT_YEAR,
  fromYear,
  overlays = [],
  ridingMeasurements = [],
}: {
  events: readonly ExploreEvent[];
  locale: Locale;
  mode?: ExploreMode;
  presentation?: ExplorePresentation;
  data?: ExploreDataView;
  year?: number;
  /**
   * The opening year of the span the route asked for.
   *
   * Absent means the annual interval ending at `year`, which is what a link
   * carrying only a year has always meant. It cannot default to a fixed year:
   * a caller that names 1995 and no opening year means 1994, not 2021.
   */
  fromYear?: number;
  overlays?: readonly BoundaryOverlayId[];
  /**
   * District numbers for the route's span, resolved on the server.
   *
   * The full table holds every one of the 741 spans for all 774 districts,
   * which is far more than a browser should carry to answer one question, so
   * the route picks the span and sends only its answer.
   */
  ridingMeasurements?: readonly RidingBoundaryMeasurement[];
}) {
  const text = copy[locale];
  const routeFrom = fromYear ?? year - 1;
  const [activeYear, setActiveYear] = useState(year);
  const [activeFrom, setActiveFrom] = useState(routeFrom);
  const [lastRouteYear, setLastRouteYear] = useState(year);
  const [lastRouteFrom, setLastRouteFrom] = useState(routeFrom);
  if (lastRouteYear !== year) {
    setLastRouteYear(year);
    setActiveYear(year);
  }
  if (lastRouteFrom !== routeFrom) {
    setLastRouteFrom(routeFrom);
    setActiveFrom(routeFrom);
  }
  /*
   * The district numbers the server rendered belong to the span in the address.
   * The control moves the span without a navigation, so once it has moved the
   * page asks the district-span route for the span it now shows, and uses the
   * answer only if it names that same span. Until then the numbers are
   * withheld: attaching the old span's numbers to the new span's heading would
   * put a real measurement under the wrong years.
   */
  const spanIsServed = activeYear === year && activeFrom === routeFrom;
  const spanKey = `${activeFrom}-${activeYear}`;
  const [liveSpan, setLiveSpan] = useState<{ key: string; measurements: readonly RidingBoundaryMeasurement[] } | null>(null);
  useEffect(() => {
    if (spanIsServed) return;
    const controller = new AbortController();
    // Playback steps faster than a reader needs each answer, so wait for the
    // span to settle before asking.
    const timer = setTimeout(() => {
      fetch(`/api/explore/district-spans?from=${activeFrom}&to=${activeYear}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<{ fromYear?: unknown; toYear?: unknown; measurements?: unknown }>) : null))
        .then((body) => {
          if (!body || body.fromYear !== activeFrom || body.toYear !== activeYear || !Array.isArray(body.measurements)) return;
          setLiveSpan({ key: `${activeFrom}-${activeYear}`, measurements: body.measurements as RidingBoundaryMeasurement[] });
        })
        .catch(() => {
          // A failed request leaves the figures withheld, which the page already says.
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [spanIsServed, activeFrom, activeYear]);
  const liveIsCurrent = liveSpan?.key === spanKey;
  const districtsCurrent = spanIsServed || liveIsCurrent;
  const servedMeasurements = spanIsServed
    ? ridingMeasurements
    : liveIsCurrent
      ? liveSpan.measurements
      : [];

  const modeEvents = events.filter((event) => event.mode === mode);
  const selected = fixturesForYear(modeEvents, activeYear);
  const activeSpan = { fromYear: activeFrom, toYear: activeYear };
  const provinceRows = mode === "forest-change" ? provinceSpanMeasurements(activeSpan) : [];
  const fourProvinces = provinceRows.length === 4 ? fourProvinceSpanMeasurement(activeSpan) : null;
  const productionAvailable = provinceRows.length === 4;
  const spanPeriod = formatYearRange(yearRange(activeFrom, activeYear), locale);
  const perCellShown =
    perCellCauseForMode(mode) !== null && fourProvinceAnnualForYear(activeYear) !== null;
  const note = !productionAvailable
    ? text.fixtureList
    : perCellShown
      ? text.productionWithPerCell
      : text.production;
  const annual = perCellShown ? fourProvinceAnnualForYear(activeYear) : null;
  const provinceCoverageLabel = (row: (typeof provinceRows)[number]) =>
    `${text.partial} (${formatUnknownSharePercent(row.unknownSharePercent, locale)}; ${formatNumber(row.unknownHectares ?? 0, locale)} ${text.unknownArea})${row.unmappedCharacter ? `; ${row.unmappedCharacter[locale]}` : ""}`;
  const hectaresOrDash = (value: number | null) => (value === null ? "–" : formatNumber(value, locale));
  const percentOrDash = (value: number | null) => (value === null ? "–" : formatNumber(value, locale));
  const nearestYear = modeEvents.reduce(
    (nearest, event) =>
      Math.abs(event.year - activeYear) < Math.abs(nearest - activeYear)
        ? event.year
        : nearest,
    modeEvents[0]?.year ?? activeYear,
  );
  const emptyMessage = text.empty(text.modes[mode], activeYear, nearestYear);
  const hasData = productionAvailable || selected.length > 0;

  return (
    <section className="explore" aria-label={text.title}>
      <CoverageStatement locale={locale}>
        <p className="explore-caveat">{locale === "en"
          ? "A blank area on the map does not establish that no loss occurred. Read each layer’s coverage and period before comparing its figures."
          : "Une zone vide sur la carte ne permet pas de conclure qu’aucune perte n’a eu lieu. Consultez la couverture et la période de chaque couche avant de comparer ses chiffres."}</p>
        <details className="explore-coverage-details">
          <summary>{locale === "en" ? "Layer periods and limits" : "Périodes et limites des couches"}</summary>
          <p className="explore-note">{note}</p>
        </details>
      </CoverageStatement>
      <EvidenceLegend locale={locale} />

      <div className="explore-workspace">
      <nav className="explore-modes" aria-label={text.title}>
        {EXPLORE_MODES.map((item) => (
          <div className="explore-mode" key={item}>
            <a
              className="segment-option"
              href={href(item, presentation, data, activeYear, overlays, activeFrom)}
              aria-current={item === mode ? "page" : undefined}
            >
              {text.modes[item]}
            </a>
            <p className="explore-mode-status">{text.modeStatus[item]}</p>
          </div>
        ))}
      </nav>

      <section className="explore-section explore-window" aria-labelledby="explore-year-heading">
        <h2 id="explore-year-heading">{text.yearHeading}</h2>
        <form className="explore-year" method="get">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="presentation" value={presentation} />
          <input type="hidden" name="data" value={data} />
          {overlays.length > 0 ? (
            <input
              type="hidden"
              name="overlays"
              value={serializeBoundaryOverlays(overlays)}
            />
          ) : null}
          <ExploreYearControl
            locale={locale}
            state={{ mode, presentation, data, year: activeYear, fromYear: activeFrom, overlays }}
            onYearChange={setActiveYear}
            onIntervalChange={(span) => {
              setActiveFrom(span.fromYear);
              setActiveYear(span.toYear);
            }}
          />
        </form>
      </section>

      <section className="explore-section explore-canvas" aria-labelledby="explore-map-heading">
        <h2 id="explore-map-heading">{text.mapHeading}</h2>
        <fieldset className="segment-set">
          <legend>{text.presentation}</legend>
          <a
            className="segment-option"
            href={href(mode, "map", data, activeYear, overlays, activeFrom)}
            aria-current={presentation === "map" ? "page" : undefined}
          >
            {text.map}
          </a>{" "}
          <a
            className="segment-option"
            href={href(mode, "list", data, activeYear, overlays, activeFrom)}
            aria-current={presentation === "list" ? "page" : undefined}
          >
            {text.list}
          </a>
        </fieldset>
        {presentation === "map" ? (
          <ExploreMapClient
            locale={locale}
            mode={mode}
            year={activeYear}
            fromYear={activeFrom}
            overlays={overlays}
            ridingMeasurements={servedMeasurements}
          />
        ) : (
          <p className="explore-note">{text.mapHidden}</p>
        )}
        {activeYear > activeFrom + 1 ? (
          <p className="explore-note">{text.spanNote(activeFrom, activeYear)}</p>
        ) : null}
        {!districtsCurrent ? (
          <p className="explore-note" role="status">{text.spanPending}</p>
        ) : null}
      </section>

      {/*
        The reading panel: what the map currently says, beside the map rather
        than under it. It is a sibling of the map section and not a child of it
        so the grid can place it in the right column, and it stays here in the
        source, ahead of the layers, because the figures explain the view the
        reader is looking at before the controls that would change it.
      */}
      <aside className="explore-annual explore-reading" aria-labelledby="explore-annual-heading">
          <h3 id="explore-annual-heading">{`${text.annualHeading}, ${annual ? formatYearRangeKey(annual.interval, locale) : formatYearRange(yearRange(activeYear - 1, activeYear), locale)}`}</h3>
          {annual ? (
            <>
              {/*
                A composition bar, not a magnitude bar. Recorded harvest and
                recorded fire are exclusive on a cell and the rest is
                unattributed, so the three segments are exactly the interval's
                loss and the widths are taken from cell counts, which are whole
                numbers, rather than from hectares rounded for display. Hue is
                the record type: the unattributed segment is neutral because no
                record names a cause for it, not because the cause is minor.
              */}
              <span className="explore-annual-bar" aria-hidden="true">
                <span
                  className="explore-annual-part explore-annual-part--harvest"
                  style={{ width: `${(annual.harvestCells / annual.cellCount) * 100}%` }}
                />
                <span
                  className="explore-annual-part explore-annual-part--fire"
                  style={{ width: `${(annual.fireCells / annual.cellCount) * 100}%` }}
                />
                <span
                  className="explore-annual-part explore-annual-part--neither"
                  style={{ width: `${(annual.unattributedCells / annual.cellCount) * 100}%` }}
                />
              </span>
              <dl>
                <div>
                  <dt>{text.annualDetected}</dt>
                  <dd>{`${formatNumber(annual.hectares, locale)} (${text.partial})`}</dd>
                </div>
                <div>
                  <dt><span className="explore-annual-mark explore-annual-mark--harvest" aria-hidden="true" />{text.annualHarvest}</dt>
                  <dd>{formatNumber(annual.harvestHectares, locale)}</dd>
                </div>
                <div>
                  <dt><span className="explore-annual-mark explore-annual-mark--fire" aria-hidden="true" />{text.annualFire}</dt>
                  <dd>{formatNumber(annual.fireHectares, locale)}</dd>
                </div>
                <div>
                  <dt><span className="explore-annual-mark explore-annual-mark--neither" aria-hidden="true" />{text.annualUnattributed}</dt>
                  <dd>{formatNumber(annual.unattributedHectares, locale)}</dd>
                </div>
              </dl>
              <p className="explore-annual-basis">{text.annualBasis}</p>
            </>
          ) : (
            <p className="explore-annual-basis">{mode === "condition-recovery" ? text.conditionRecoveryNone : text.annualNone}</p>
          )}
      </aside>

      <section
        className="explore-section explore-overlays"
        aria-labelledby="explore-layers-heading"
      >
        <h2 id="explore-layers-heading">{text.layersHeading}</h2>
        <p className="explore-note">{text.overlaysNote}</p>
        <h3>{text.overlays}</h3>
        <ul className="overlay-grid">
          {BOUNDARY_OVERLAY_IDS.map((id) => {
            const overlay = BOUNDARY_OVERLAYS[id];
            const active = overlays.includes(id);
            return (
              <li className="card card--sand overlay-card" key={id}>
                <span className="overlay-name">{overlay.label[locale]}</span>
                {overlay.available ? (
                  <a
                    className="segment-option overlay-toggle"
                    href={href(
                      mode,
                      presentation,
                      data,
                      activeYear,
                      toggleBoundaryOverlay(overlays, id),
                      activeFrom,
                    )}
                    aria-label={labelled(
                      locale,
                      active ? text.hide : text.show,
                      overlay.label[locale],
                    )}
                  >
                    {active ? text.hide : text.show}
                  </a>
                ) : (
                  <span className="overlay-state">{text.notAvailable}</span>
                )}
                {active ? <span className="overlay-state">{text.shown}</span> : null}
                <p className="overlay-note">{overlay.note[locale]}</p>
                {overlay.reason ? (
                  <p className="overlay-note">
                    {text.whyNot}
                    {colon(locale)} {overlay.reason[locale]}
                  </p>
                ) : null}
                {overlay.attribution ? (
                  <p className="overlay-attribution">{overlay.attribution[locale]}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      </div>

      <section className="explore-section explore-data" aria-labelledby="explore-data-heading">
        <h2 id="explore-data-heading">{text.dataViewsHeading}</h2>
        <fieldset className="segment-set">
          <legend>{text.data}</legend>
          <a
            className="segment-option"
            href={href(mode, presentation, "chart", activeYear, overlays, activeFrom)}
            aria-current={data === "chart" ? "page" : undefined}
          >
            {text.chart}
          </a>{" "}
          <a
            className="segment-option"
            href={href(mode, presentation, "table", activeYear, overlays, activeFrom)}
            aria-current={data === "table" ? "page" : undefined}
          >
            {text.table}
          </a>
        </fieldset>

        {!hasData ? (
          <p className="explore-empty" role="status">{emptyMessage}</p>
        ) : null}

        {presentation === "list" && hasData ? (
          <ul className="explore-list" aria-label={text.list}>
              {productionAvailable
                ? provinceRows.map((row) => (
                    <li className="card card--lift" key={row.id}>
                      <h3>{row.name[locale]}</h3>
                      <p>{spanPeriod}</p>
                      <p>
                        {text.observedLoss}
                        {colon(locale)} {hectaresOrDash(row.unionLossHectares)} ·{" "}
                        {text.observedLossPercent}
                        {colon(locale)} {percentOrDash(row.unionLossPercent)} ·{" "}
                        {text.coverage}
                        {colon(locale)} {provinceCoverageLabel(row)}
                      </p>
                      <p>
                        {text.source}
                        {colon(locale)}{" "}
                        <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                          {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                        </a>
                      </p>
                    </li>
                  ))
                : selected.map((event) => (
                    <li className="card card--lift" key={event.id}>
                      <h3>{event.name[locale]}</h3>
                      <p>
                        {text.year}
                        {colon(locale)} {event.year}
                      </p>
                      <Details event={event} locale={locale} />
                    </li>
                  ))}
          </ul>
        ) : null}

        {hasData && data === "chart" ? (
          (() => {
              const rows = productionAvailable ? provinceRows : selected;
              const values = rows.map((item) =>
                "unionLossPercent" in item ? item.unionLossPercent ?? 0 : 1,
              );
              const scale = Math.max(...values, 1);
              return (
                <>
                <ul className="explore-chart" aria-label={text.chart}>
                  {rows.map((item) => {
                    const isProduction = "unionLossPercent" in item;
                    const value = isProduction ? item.unionLossPercent ?? 0 : 1;
                    const detail = isProduction
                      ? item.unionLossPercent === null ? "–" : formatPercent(item.unionLossPercent, locale)
                      : String(item.year);
                    return (
                      <li key={item.id}>
                        <span className="explore-bar-name">{item.name[locale]}</span>
                        <span className="explore-bar-label">{detail}</span>
                        <span className="explore-bar-track" aria-hidden="true">
                          <span className="explore-bar" style={{ width: `${(value / scale) * 100}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {/* A bar states what was detected inside the mapped area. The
                    unmapped share is not a smaller bar, so it is written out
                    beneath the chart rather than drawn into it. */}
                {productionAvailable ? provinceRows.map((item) => item.unmappedCharacter ? (
                  <p key={item.id}>{item.name[locale]}{colon(locale)} {item.unmappedCharacter[locale]}</p>
                ) : null) : null}
                </>
              );
          })()
        ) : null}

        {hasData && data === "table" ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="explore-data-table-caption">
            <table className="explore-table">
              <caption id="explore-data-table-caption">
                {text.table}
                {productionAvailable ? `${colon(locale)} ${spanPeriod}` : ""}
              </caption>
              <thead>
                {productionAvailable ? (
                  <tr>
                    <th scope="col">{text.event}</th>
                    <th scope="col">{text.year}</th>
                    <th scope="col">{text.observedLoss}</th>
                    <th scope="col">{text.observedLossPercent}</th>
                    <th scope="col">{text.coverage}</th>
                    <th scope="col">{text.source}</th>
                  </tr>
                ) : (
                  <tr>
                    <th scope="col">{text.event}</th>
                    <th scope="col">{text.year}</th>
                    <th scope="col">{text.coverage}</th>
                    <th scope="col">{text.evidence}</th>
                    <th scope="col">{text.confidence}</th>
                    <th scope="col">{text.source}</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {productionAvailable
                  ? [
                      ...provinceRows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row">{row.name[locale]}</th>
                          <td>{spanPeriod}</td>
                          <td>{hectaresOrDash(row.unionLossHectares)}</td>
                          <td>{percentOrDash(row.unionLossPercent)}</td>
                          <td>{provinceCoverageLabel(row)}</td>
                          <td>
                            <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                              {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                            </a>
                          </td>
                        </tr>
                      )),
                      fourProvinces ? (
                        <tr key="four-provinces">
                          <th scope="row">{text.fourProvinces}</th>
                          <td>{spanPeriod}</td>
                          <td>{hectaresOrDash(fourProvinces.unionLossHectares)}</td>
                          <td>{percentOrDash(fourProvinces.unionLossPercent)}</td>
                          <td>{`${text.partial} (${formatNumber(fourProvinces.unknownHectares ?? 0, locale)} ${text.unknownArea})`}</td>
                          <td>
                            <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                              {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                            </a>
                          </td>
                        </tr>
                      ) : null,
                    ]
                  : selected.map((event) => (
                      <tr key={event.id}>
                        <th scope="row">{event.name[locale]}</th>
                        <td>{event.year}</td>
                        <td><CoverageBand coverageGrade={event.coverageGrade} locale={locale} /></td>
                        <td><EvidenceChip evidence={event.evidence} locale={locale} /></td>
                        <td><ConfidenceBadge confidence={event.confidence} locale={locale} /></td>
                        <td><ProvenanceBlock provenance={event.provenance} locale={locale} /></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!productionAvailable ? (
          <ul className="explore-legend" aria-label={locale === "en" ? "Legend" : "Légende"}>
            {EXPLORE_MODES.map((item) => (
              <li key={item}>
                <svg aria-hidden="true" width="28" height="22" viewBox="0 0 100 110">
                  <title>{text.modes[item]}</title>
                  {symbol(item, 50)}
                </svg>
                {text.modes[item]}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
