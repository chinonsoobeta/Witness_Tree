"use client";

import { useState } from "react";
import {
  ConfidenceBadge,
  CoverageBand,
  EvidenceChip,
  ProvenanceBlock,
} from "@/components/policy";
import { colon, formatNumber, formatPercent, labelled, type Locale } from "@/lib/domain";
import {
  BOUNDARY_OVERLAY_IDS,
  BOUNDARY_OVERLAYS,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_MODES,
  EXPLORE_PRODUCTION_LAYER,
  exploreHref,
  fixturesForYear,
  formatUnknownSharePercent,
  perCellAnnualForYear,
  perCellArchiveForYear,
  perCellCauseForMode,
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
      "Each layer on this page carries its own period, and this view is showing only one of them. The list, chart, and table use the same provisional 2020–2022 province aggregate, which is the only period that release covers. No per-cell patches are drawn for the selected year.",
    productionWithPerCell:
      "Each layer on this page carries its own period, so no single span describes the whole view. The map draws per-cell detected loss patches for 1984–2022, traced from the 30 m grid, and the heading below names the one annual interval the year control has selected. The list, chart, and table use the same provisional 2020–2022 province aggregate, which covers those years alone and does not move with the year control. The annual figures below are counted from the exact cell inventory, not from the drawn patches, which are simplified for display and cannot be added up. Nothing here has been checked against conditions on the ground, and the source maps only part of the country, so every figure is a minimum.",
    annualHeading: "Per-cell detected loss",
    annualDetected: "Detected loss (ha)",
    annualHarvest: "Recorded harvest (ha)",
    annualFire: "Recorded fire (ha)",
    annualUnattributed: "Cause not recorded (ha)",
    annualBasis:
      "This is the single annual interval the year control has selected, not a total for 1984–2022 and not the 2020–2022 province aggregate. Counted from the exact 30 m cell inventory behind the map. One cell is 0.09 ha.",
    annualNone: "No per-cell interval covers this year and mode.",
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
        "Real map intervals: 1985–2022; real province aggregate: 2022. Illustrative data view: 2004; other data-view years have no illustrative record.",
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
      "Chaque couche de cette page porte sa propre période, et cette vue n’en affiche qu’une seule. La liste, le graphique et le tableau utilisent le même agrégat provincial provisoire de 2020 à 2022, seule période couverte par cette version. Aucune parcelle par cellule n’est dessinée pour l’année choisie.",
    productionWithPerCell:
      "Chaque couche de cette page porte sa propre période ; aucune période unique ne décrit donc l’ensemble de la vue. La carte dessine les parcelles de perte détectée par cellule de 1984 à 2022, tracées à partir de la grille de 30 m, et le titre ci-dessous nomme le seul intervalle annuel choisi par la commande d’année. La liste, le graphique et le tableau utilisent le même agrégat provincial provisoire de 2020 à 2022, qui ne couvre que ces années et ne suit pas la commande d’année. Les chiffres annuels ci-dessous sont comptés à partir de l’inventaire exact des cellules, et non des parcelles dessinées, qui sont simplifiées pour l’affichage et ne peuvent pas être additionnées. Rien ici n’a été vérifié sur le terrain, et la source ne cartographie qu’une partie du pays : chaque chiffre est donc un minimum.",
    annualHeading: "Perte détectée par cellule",
    annualDetected: "Perte détectée (ha)",
    annualHarvest: "Récoltes consignées (ha)",
    annualFire: "Incendies consignés (ha)",
    annualUnattributed: "Cause non consignée (ha)",
    annualBasis:
      "Il s’agit du seul intervalle annuel choisi par la commande d’année, et non d’un total pour 1984–2022 ni de l’agrégat provincial de 2020–2022. Comptée à partir de l’inventaire exact des cellules de 30 m derrière la carte. Une cellule représente 0,09 ha.",
    annualNone: "Aucun intervalle par cellule ne couvre cette année et ce mode.",
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
        "Intervalles cartographiques réels : 1985–2022; agrégat provincial réel : 2022. Vue des données illustrative : 2004; les autres années n’ont aucun dossier illustratif.",
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
) {
  return exploreHref({ mode, presentation, data, year, overlays });
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
  overlays = [],
  ridingMeasurements = [],
}: {
  events: readonly ExploreEvent[];
  locale: Locale;
  mode?: ExploreMode;
  presentation?: ExplorePresentation;
  data?: ExploreDataView;
  year?: number;
  overlays?: readonly BoundaryOverlayId[];
  ridingMeasurements?: readonly RidingBoundaryMeasurement[];
}) {
  const text = copy[locale];
  const [activeYear, setActiveYear] = useState(year);
  const [lastRouteYear, setLastRouteYear] = useState(year);
  if (lastRouteYear !== year) {
    setLastRouteYear(year);
    setActiveYear(year);
  }

  const modeEvents = events.filter((event) => event.mode === mode);
  const selected = fixturesForYear(modeEvents, activeYear);
  const productionAvailable = mode === "forest-change" && activeYear === 2022;
  const perCellShown =
    perCellCauseForMode(mode) !== null && perCellArchiveForYear(activeYear) !== null;
  const note = !productionAvailable
    ? text.fixtureList
    : perCellShown
      ? text.productionWithPerCell
      : text.production;
  const annual = perCellShown ? perCellAnnualForYear(activeYear) : null;
  const provinceCoverageLabel = (row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) =>
    `${text.partial} (${formatUnknownSharePercent(row.unknownSharePercent, locale)}; ${formatNumber(row.unknownRequiredInputHectares, locale)} ${text.unknownArea})`;
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
      <p className="explore-note">{note}</p>

      <nav className="explore-modes" aria-label={text.title}>
        {EXPLORE_MODES.map((item) => (
          <div className="explore-mode" key={item}>
            <a
              className="segment-option"
              href={href(item, presentation, data, activeYear, overlays)}
              aria-current={item === mode ? "page" : undefined}
            >
              {text.modes[item]}
            </a>
            <p className="explore-mode-status">{text.modeStatus[item]}</p>
          </div>
        ))}
      </nav>

      <section className="explore-section" aria-labelledby="explore-year-heading">
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
            state={{ mode, presentation, data, year: activeYear, overlays }}
            onYearChange={setActiveYear}
          />
        </form>
      </section>

      <section className="explore-section" aria-labelledby="explore-map-heading">
        <h2 id="explore-map-heading">{text.mapHeading}</h2>
        <fieldset className="segment-set">
          <legend>{text.presentation}</legend>
          <a
            className="segment-option"
            href={href(mode, "map", data, activeYear, overlays)}
            aria-current={presentation === "map" ? "page" : undefined}
          >
            {text.map}
          </a>{" "}
          <a
            className="segment-option"
            href={href(mode, "list", data, activeYear, overlays)}
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
            overlays={overlays}
            ridingMeasurements={ridingMeasurements}
          />
        ) : (
          <p className="explore-note">{text.mapHidden}</p>
        )}
        <div className="explore-annual">
          <h3>{`${text.annualHeading}, ${annual ? annual.interval : `${activeYear - 1}–${activeYear}`}`}</h3>
          {annual ? (
            <>
              <dl>
                <div>
                  <dt>{text.annualDetected}</dt>
                  <dd>{`${formatNumber(annual.hectares, locale)} (${text.partial})`}</dd>
                </div>
                <div>
                  <dt>{text.annualHarvest}</dt>
                  <dd>{formatNumber(annual.harvestHectares, locale)}</dd>
                </div>
                <div>
                  <dt>{text.annualFire}</dt>
                  <dd>{formatNumber(annual.fireHectares, locale)}</dd>
                </div>
                <div>
                  <dt>{text.annualUnattributed}</dt>
                  <dd>{formatNumber(annual.unattributedHectares, locale)}</dd>
                </div>
              </dl>
              <p className="explore-annual-basis">{text.annualBasis}</p>
            </>
          ) : (
            <p className="explore-annual-basis">{text.annualNone}</p>
          )}
        </div>
      </section>

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

      <section className="explore-section explore-data" aria-labelledby="explore-data-heading">
        <h2 id="explore-data-heading">{text.dataViewsHeading}</h2>
        <fieldset className="segment-set">
          <legend>{text.data}</legend>
          <a
            className="segment-option"
            href={href(mode, presentation, "chart", activeYear, overlays)}
            aria-current={data === "chart" ? "page" : undefined}
          >
            {text.chart}
          </a>{" "}
          <a
            className="segment-option"
            href={href(mode, presentation, "table", activeYear, overlays)}
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
                ? EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                    <li className="card card--lift" key={row.id}>
                      <h3>{row.name[locale]}</h3>
                      <p>{EXPLORE_PRODUCTION_LAYER.period}</p>
                      <p>
                        {text.observedLoss}
                        {colon(locale)} {formatNumber(row.observedLossHectares, locale)} ·{" "}
                        {text.observedLossPercent}
                        {colon(locale)} {formatNumber(row.observedLossPercent, locale)} ·{" "}
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
              const rows = productionAvailable ? EXPLORE_PRODUCTION_LAYER.rows : selected;
              const values = rows.map((item) =>
                "observedLossPercent" in item ? item.observedLossPercent : 1,
              );
              const scale = Math.max(...values, 1);
              const rowHeight = 34;
              const barX = 150;
              const barMax = 300;
              return (
                <svg
                  className="explore-chart"
                  role="img"
                  aria-label={text.chart}
                  viewBox={`0 0 500 ${rows.length * rowHeight + 12}`}
                >
                  <title>{text.chart}</title>
                  {rows.map((item, index) => {
                    const isProduction = "observedLossPercent" in item;
                    const value = isProduction ? item.observedLossPercent : 1;
                    const label = item.name[locale];
                    const detail = isProduction ? formatPercent(value, locale) : String(item.year);
                    const y = index * rowHeight + 8;
                    return (
                      <g key={item.id}>
                        <title>{labelled(locale, label, detail)}</title>
                        <text className="explore-bar-name" x="0" y={y + 15}>{label}</text>
                        <rect
                          className="explore-bar"
                          x={barX}
                          y={y}
                          width={Math.max((value / scale) * barMax, 2)}
                          height="20"
                          rx="6"
                        />
                        <text
                          className="explore-bar-label"
                          x={barX + Math.max((value / scale) * barMax, 2) + 8}
                          y={y + 15}
                        >
                          {detail}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
          })()
        ) : null}

        {hasData && data === "table" ? (
          <div className="table-scroll">
            <table className="explore-table">
              <caption>
                {text.table}
                {productionAvailable ? `${colon(locale)} ${EXPLORE_PRODUCTION_LAYER.period}` : ""}
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
                  ? EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{row.name[locale]}</th>
                        <td>{EXPLORE_PRODUCTION_LAYER.period}</td>
                        <td>{formatNumber(row.observedLossHectares, locale)}</td>
                        <td>{formatNumber(row.observedLossPercent, locale)}</td>
                        <td>{provinceCoverageLabel(row)}</td>
                        <td>
                          <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                            {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                          </a>
                        </td>
                      </tr>
                    ))
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
