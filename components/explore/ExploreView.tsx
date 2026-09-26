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
import { harvestFireHref, harvestFireSpanTotals } from "@/lib/harvest-fire";
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
      "The map is hidden in List view. Choose Map above to show it.",
    production:
      `The province figures follow the years you choose, anywhere within ${provinceSpanReach("en")}. A place cleared more than once counts once, and no loss patches are drawn for these years. Nothing here was checked on the ground, and only part of each province was mapped, so every figure is a minimum.`,
    productionWithPerCell:
      `The province figures and the loss patches on the map follow the years you choose, anywhere within ${provinceSpanReach("en")}; a place cleared more than once counts once. The per-cell figures below cover only the last year of your span, and the map patches are simplified for viewing, so they can’t be added up. Nothing here was checked on the ground, and only part of each province was mapped, so every figure is a minimum.`,
    annualHeading: "Per-cell detected loss",
    annualDetected: "Detected loss (ha)",
    annualHarvest: "Recorded harvest (ha)",
    annualFire: "Recorded fire (ha)",
    annualUnattributed: "Cause not recorded (ha)",
    annualBasis:
      `This covers only the last year you selected, for all four provinces together. It is not a total for your span or for ${perCellArchiveSpan("en")}. It is counted from the 30 m grid cells behind the map (one cell is 0.09 ha).`,
    annualNone: "No per-cell interval covers this year and mode.",
    conditionRecoveryNone: "Condition and recovery is not mapped yet. We have the yearly land-cover data it needs, but have not yet decided what counts as trees growing back, or reviewed a map built on that decision.",
    spanNote: (fromYear: number, toYear: number) =>
      `The map shows ${fromYear} to ${toYear}. Point at or select a district to see how much forest it lost in those years, with each place counted once. If the same ground was lost more than once, the yearly losses added together are also shown, in hectares only.`,
    spanPending:
      "District figures for these years are loading. They stay hidden until they arrive, so older figures are never shown under the wrong years.",
    fixtureList:
      "The list, chart and table use made-up example data, not real records.",
    harvestFireNote:
      "The province figures add up the harvest, and separately the fire, dated to the years after the first year you choose, up to the last. The national satellite record gives each 30 m square at most one harvest year and one fire year, so each square counts once. Harvest and fire are never added together. The record ends in 2022, and every figure is a minimum because part of each province is not mapped.",
    harvestFireHectares: "Harvest (ha)",
    fireHectares: "Fire (ha)",
    changeYears: "Change years",
    buildChart: "Build a chart for these years",
    harvestFireSource: "Natural Resources Canada, national harvest and wildfire change-year records, 1985–2022",
    empty: (mode: string, year: number, nearest: number) =>
      `There is no example data for ${mode} in ${year}. The nearest year with example data is ${nearest}.`,
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
      "Boundaries you can draw over the map, for reference only. They show where places are and who represents them, not how much forest they lost.",
    event: "Event",
    evidence: "Evidence",
    confidence: "Confidence",
    coverage: "Coverage",
    observedLoss: "Detected loss (ha)",
    observedLossPercent: "Detected loss (%)",
    fourProvinces: "The four provinces together",
    partial: "Partly unmapped, so this is a minimum",
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
        "Real map, 1985–2022. Real province figures for any years from 1984 to 2022.",
      "recorded-harvest":
        "Real map, 1985–2022. Real province figures for harvest and fire, 1985–2022.",
      wildfire:
        "Real map, 1985–2022. Real province figures for harvest and fire, 1985–2022.",
      "condition-recovery":
        "No real map yet. The data view uses example data for 1988 only.",
    },
  },
  fr: {
    title: "Explorer",
    yearHeading: "Année",
    mapHeading: "Carte",
    layersHeading: "Couches et superpositions",
    dataViewsHeading: "Vues des données",
    mapHidden:
      "La carte est masquée en vue Liste. Choisissez Carte ci-dessus pour l’afficher.",
    production:
      `Les chiffres provinciaux suivent les années que vous choisissez, n’importe où ${provinceSpanReach("fr", "from")}. Un lieu coupé plus d’une fois compte une seule fois, et aucune parcelle de perte n’est dessinée pour ces années. Rien ici n’a été vérifié sur le terrain, et seule une partie de chaque province a été cartographiée\u202F: chaque chiffre est donc un minimum.`,
    productionWithPerCell:
      `Les chiffres provinciaux et les parcelles de perte de la carte suivent les années que vous choisissez, n’importe où ${provinceSpanReach("fr", "from")}; un lieu coupé plus d’une fois compte une seule fois. Les chiffres par cellule ci-dessous ne portent que sur la dernière année de votre période, et les parcelles de la carte sont simplifiées pour l’affichage\u202F: elles ne peuvent pas être additionnées. Rien ici n’a été vérifié sur le terrain, et seule une partie de chaque province a été cartographiée\u202F: chaque chiffre est donc un minimum.`,
    annualHeading: "Perte détectée par cellule",
    annualDetected: "Perte détectée (ha)",
    annualHarvest: "Récoltes consignées (ha)",
    annualFire: "Incendies consignés (ha)",
    annualUnattributed: "Cause non consignée (ha)",
    annualBasis:
      `Ce chiffre ne porte que sur la dernière année choisie, pour les quatre provinces ensemble. Ce n’est pas un total pour votre période ni pour ${perCellArchiveSpan("fr")}. Il est compté à partir des cellules de 30 m derrière la carte (une cellule représente 0,09 ha).`,
    annualNone: "Aucun intervalle par cellule ne couvre cette année et ce mode.",
    conditionRecoveryNone: "L’état et le rétablissement ne sont pas encore cartographiés. Nous avons la série annuelle de couverture terrestre nécessaire, mais nous n’avons pas encore décidé ce qui compte comme des arbres qui repoussent, ni examiné une carte fondée sur cette décision.",
    spanNote: (fromYear: number, toYear: number) =>
      `La carte montre la période de ${fromYear} à ${toYear}. Pointez ou choisissez une circonscription pour voir la forêt qu’elle a perdue pendant ces années, chaque lieu étant compté une seule fois. Si le même terrain a été perdu plus d’une fois, les pertes annuelles additionnées sont aussi affichées, en hectares seulement.`,
    spanPending:
      "Les chiffres par circonscription pour ces années sont en cours de chargement. Ils restent masqués d’ici là, pour ne jamais afficher d’anciens chiffres sous les mauvaises années.",
    fixtureList:
      "La liste, le graphique et le tableau utilisent des données d’exemple inventées, et non de vrais registres.",
    harvestFireNote:
      "Les chiffres provinciaux additionnent la récolte, et séparément le feu, datés des années qui suivent la première année choisie, jusqu’à la dernière. Le registre satellitaire national donne à chaque carré de 30 m au plus une année de récolte et une année de feu\u202F: chaque carré compte donc une seule fois. La récolte et le feu ne sont jamais additionnés. La série se termine en 2022, et chaque chiffre est un minimum, car une partie de chaque province n’est pas cartographiée.",
    harvestFireHectares: "Récolte (ha)",
    fireHectares: "Feu (ha)",
    changeYears: "Années de changement",
    buildChart: "Créer un graphique pour ces années",
    harvestFireSource: "Ressources naturelles Canada, registres nationaux des années de récolte et de feu, 1985–2022",
    empty: (mode: string, year: number, nearest: number) =>
      `Il n’y a pas de données d’exemple pour ${mode} en ${year}. L’année la plus proche avec des données d’exemple est ${nearest}.`,
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
      "Des limites à superposer à la carte, à titre de référence seulement. Elles montrent où se trouvent les lieux et qui les représente, et non la forêt qu’ils ont perdue.",
    event: "Événement",
    evidence: "Preuve",
    confidence: "Confiance",
    coverage: "Couverture",
    observedLoss: "Perte détectée (ha)",
    observedLossPercent: "Perte détectée (%)",
    fourProvinces: "Les quatre provinces ensemble",
    partial: "En partie non cartographié; il s’agit donc d’un minimum",
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
        "Carte réelle, 1985–2022. Chiffres provinciaux réels pour toutes les années de 1984 à 2022.",
      "recorded-harvest":
        "Carte réelle, 1985–2022. Chiffres provinciaux réels pour la récolte et le feu, 1985–2022.",
      wildfire:
        "Carte réelle, 1985–2022. Chiffres provinciaux réels pour la récolte et le feu, 1985–2022.",
      "condition-recovery":
        "Pas encore de carte réelle. La vue des données utilise des données d’exemple pour 1988 seulement.",
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
  // Harvest and fire modes read the national harvest and fire series, where the
  // owner decision lets years be added: docs/HARVEST_FIRE_SERIES_DECISION.md.
  const harvestFireRows =
    mode === "recorded-harvest" || mode === "wildfire" ? harvestFireSpanTotals(activeFrom, activeYear) : null;
  const changeYears = formatYearRange(yearRange(activeFrom + 1, activeYear), locale);
  const buildChartHref = harvestFireHref(locale, { firstYear: activeFrom + 1, lastYear: activeYear });
  const spanPeriod = formatYearRange(yearRange(activeFrom, activeYear), locale);
  const perCellShown =
    perCellCauseForMode(mode) !== null && fourProvinceAnnualForYear(activeYear) !== null;
  const note = harvestFireRows
    ? text.harvestFireNote
    : !productionAvailable
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
  const hasData = productionAvailable || harvestFireRows !== null || selected.length > 0;

  return (
    <section className="explore" aria-label={text.title}>
      <CoverageStatement locale={locale}>
        <p className="explore-caveat">{locale === "en"
          ? "A blank area on the map doesn’t mean no forest was lost there. Check what years and areas each layer covers before comparing figures."
          : "Une zone vide sur la carte ne veut pas dire qu’aucune forêt n’y a été perdue. Vérifiez les années et les zones couvertes par chaque couche avant de comparer les chiffres."}</p>
        <details className="explore-coverage-details">
          <summary>{locale === "en" ? "What each layer covers" : "Ce que couvre chaque couche"}</summary>
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

        {harvestFireRows ? (
          <>
            {presentation === "list" ? (
              <ul className="explore-list" aria-label={text.list}>
                {harvestFireRows.map((row) => (
                  <li className="card card--lift" key={row.province.id}>
                    <h3>{row.province.name[locale]}</h3>
                    <p>{text.changeYears}{colon(locale)} {changeYears}</p>
                    <p>
                      {text.harvestFireHectares}
                      {colon(locale)} {formatNumber(row.harvestHectares, locale)} ·{" "}
                      {text.fireHectares}
                      {colon(locale)} {formatNumber(row.fireHectares, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {data === "chart" ? (() => {
              const scale = Math.max(1, ...harvestFireRows.flatMap((row) => [row.harvestHectares, row.fireHectares]));
              return (
                <ul className="explore-chart" aria-label={text.chart}>
                  {harvestFireRows.flatMap((row) => ([
                    ["harvest", text.harvestFireHectares, row.harvestHectares],
                    ["fire", text.fireHectares, row.fireHectares],
                  ] as const).map(([kind, label, value]) => (
                    <li key={`${row.province.id}-${kind}`}>
                      <span className="explore-bar-name">{`${row.province.name[locale]}, ${label}`}</span>
                      <span className="explore-bar-label">{formatNumber(value, locale, 0)}</span>
                      <span className="explore-bar-track" aria-hidden="true">
                        <span className={`explore-bar explore-bar--${kind}`} style={{ width: `${(value / scale) * 100}%` }} />
                      </span>
                    </li>
                  )))}
                </ul>
              );
            })() : (
              <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="explore-hf-table-caption">
                <table className="explore-table">
                  <caption id="explore-hf-table-caption">{`${text.table}${colon(locale)} ${changeYears}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{text.event}</th>
                      <th scope="col">{text.changeYears}</th>
                      <th scope="col">{text.harvestFireHectares}</th>
                      <th scope="col">{text.fireHectares}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {harvestFireRows.map((row) => (
                      <tr key={row.province.id}>
                        <th scope="row">{row.province.name[locale]}</th>
                        <td>{changeYears}</td>
                        <td>{formatNumber(row.harvestHectares, locale)}</td>
                        <td>{formatNumber(row.fireHectares, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="explore-note">
              {text.source}
              {colon(locale)} <a href={`${buildChartHref.split("?")[0]}#sources`}>{text.harvestFireSource}</a>
            </p>
            <p><a className="btn btn--outline" href={buildChartHref}>{text.buildChart}</a></p>
          </>
        ) : null}

        {!harvestFireRows && presentation === "list" && hasData ? (
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

        {!harvestFireRows && hasData && data === "chart" ? (
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

        {!harvestFireRows && hasData && data === "table" ? (
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

        {!productionAvailable && !harvestFireRows ? (
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
