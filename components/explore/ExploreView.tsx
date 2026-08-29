import {
  ConfidenceBadge,
  CoverageBand,
  EvidenceChip,
  ProvenanceBlock,
} from "@/components/policy";
import {
  EXPLORE_BOUNDARY_OVERLAYS,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_PRODUCTION_LAYER,
  EXPLORE_MODES,
  EXPLORE_YEAR_MAX,
  EXPLORE_YEAR_MIN,
  type ExploreDataView,
  type ExploreEvent,
  type ExploreMode,
  type ExplorePresentation,
} from "@/lib/explore";
import type { Locale } from "@/lib/domain";

const copy = {
  en: {
    title: "Explore",
    yearControl: "Show illustrative fixtures through year",
    update: "Update",
    production:
      "The map, list, chart, and table use the same verified 2020–2022 province aggregate. This technical preview is not per-cell geometry.",
    fixtureList:
      "This list, chart, and table use illustrative fixtures. No verified geographic layer is implied by this view.",
    year: "Year",
    presentation: "Presentation",
    map: "Map",
    list: "List",
    data: "Data",
    chart: "Chart",
    table: "Table",
    overlays: "Boundary overlays",
    unavailable: "Illustrative fixture: geometry unavailable",
    event: "Event",
    evidence: "Evidence",
    confidence: "Confidence",
    coverage: "Coverage",
    observedLoss: "Observed loss (ha)",
    observedLossPercent: "Observed loss (%)",
    complete: "Complete required-input coverage",
    source: "Source attribution",
    modes: {
      "forest-change": "Forest change",
      "recorded-harvest": "Recorded harvest",
      wildfire: "Wildfire",
      "condition-recovery": "Condition and recovery",
    },
    boundaries: {
      watersheds: "Watersheds",
      "federal-ridings": "Federal ridings",
      "provincial-ridings": "Provincial ridings",
      reserves: "Reserves",
      "treaty-areas": "Treaty areas",
    },
  },
  fr: {
    title: "Explorer",
    yearControl: "Afficher les exemples illustratifs jusqu’à l’année",
    update: "Mettre à jour",
    production:
      "La carte, la liste, le graphique et le tableau utilisent le même agrégat provincial vérifié de 2020 à 2022. Cet aperçu technique n’est pas une géométrie par cellule.",
    fixtureList:
      "Cette liste, ce graphique et ce tableau utilisent des exemples illustratifs. Cette vue n’implique aucune couche géographique vérifiée.",
    year: "Année",
    presentation: "Présentation",
    map: "Carte",
    list: "Liste",
    data: "Données",
    chart: "Graphique",
    table: "Tableau",
    overlays: "Superpositions de limites",
    unavailable: "Exemple illustratif : géométrie non disponible",
    event: "Événement",
    evidence: "Preuve",
    confidence: "Confiance",
    coverage: "Couverture",
    observedLoss: "Perte observée (ha)",
    observedLossPercent: "Perte observée (%)",
    complete: "Couverture complète des entrées requises",
    source: "Attribution de la source",
    modes: {
      "forest-change": "Changement forestier",
      "recorded-harvest": "Récolte consignée",
      wildfire: "Incendies",
      "condition-recovery": "État et rétablissement",
    },
    boundaries: {
      watersheds: "Bassins versants",
      "federal-ridings": "Circonscriptions fédérales",
      "provincial-ridings": "Circonscriptions provinciales",
      reserves: "Réserves",
      "treaty-areas": "Zones visées par un traité",
    },
  },
} as const;
function symbol(mode: ExploreMode, x: number) {
  if (mode === "recorded-harvest")
    return (
      <circle cx={x} cy="55" r="24" fill="url(#dots)" stroke="currentColor" />
    );
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
) {
  return `?mode=${mode}&presentation=${presentation}&data=${data}&year=${year}`;
}
function Details({ event, locale }: { event: ExploreEvent; locale: Locale }) {
  const text = copy[locale];
  return (
    <>
      <EvidenceChip evidence={event.evidence} locale={locale} /> ·{" "}
      {text.confidence}:{" "}
      <ConfidenceBadge confidence={event.confidence} locale={locale} /> ·{" "}
      {text.coverage}:{" "}
      <CoverageBand coverageGrade={event.coverageGrade} locale={locale} />
      <span>{event.unknownReason ? `: ${event.unknownReason}` : ""}</span>
      <p>
        {text.source}:{" "}
        <ProvenanceBlock provenance={event.provenance} locale={locale} />
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
}: {
  events: readonly ExploreEvent[];
  locale: Locale;
  mode?: ExploreMode;
  presentation?: ExplorePresentation;
  data?: ExploreDataView;
  year?: number;
}) {
  const text = copy[locale];
  const selected = events.filter((event) => event.mode === mode);
  const productionAvailable = mode === "forest-change" && year >= 2022;
  const number = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  });
  return (
    <section className="explore" aria-label={text.title}>
      <p className="explore-note">
        {productionAvailable ? text.production : text.fixtureList}
      </p>
      <form className="explore-year" method="get">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="presentation" value={presentation} />
        <input type="hidden" name="data" value={data} />
        <label className="explore-year-label">
          {text.yearControl}
          <input
            type="range"
            name="year"
            min={EXPLORE_YEAR_MIN}
            max={EXPLORE_YEAR_MAX}
            defaultValue={year}
            className="explore-slider"
            step="1"
            aria-label={text.yearControl}
          />
        </label>
        <button className="btn btn--primary" type="submit">
          {text.update}
        </button>
      </form>
      <nav className="segment" aria-label={text.title}>
        {EXPLORE_MODES.map((item) => (
          <a
            key={item}
            className="segment-option"
            href={href(item, presentation, data, year)}
            aria-current={item === mode ? "page" : undefined}
          >
            {text.modes[item]}
          </a>
        ))}
      </nav>
      <fieldset className="segment-set">
        <legend>{text.presentation}</legend>
        <a
          className="segment-option"
          href={href(mode, "map", data, year)}
          aria-current={presentation === "map" ? "page" : undefined}
        >
          {text.map}
        </a>{" "}
        <a
          className="segment-option"
          href={href(mode, "list", data, year)}
          aria-current={presentation === "list" ? "page" : undefined}
        >
          {text.list}
        </a>
      </fieldset>
      <fieldset className="segment-set">
        <legend>{text.data}</legend>
        <a
          className="segment-option"
          href={href(mode, presentation, "chart", year)}
          aria-current={data === "chart" ? "page" : undefined}
        >
          {text.chart}
        </a>{" "}
        <a
          className="segment-option"
          href={href(mode, presentation, "table", year)}
          aria-current={data === "table" ? "page" : undefined}
        >
          {text.table}
        </a>
      </fieldset>
      <section className="explore-overlays" aria-label={text.overlays}>
        <h2>{text.overlays}</h2>
        <ul className="overlay-grid">
          {EXPLORE_BOUNDARY_OVERLAYS.map((boundary) => (
            <li className="card card--sand overlay-card" key={boundary}>
              <span className="overlay-name">{text.boundaries[boundary]}</span>
              <span className="overlay-state">{text.unavailable}</span>
            </li>
          ))}
        </ul>
      </section>
      {presentation === "list" ? (
        <ul className="explore-list" aria-label={text.list}>
          {productionAvailable
            ? EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                <li className="card card--lift" key={row.id}>
                  <h2>{row.name[locale]}</h2>
                  <p>{EXPLORE_PRODUCTION_LAYER.period}</p>
                  <p>
                    {text.observedLoss}:{" "}
                    {number.format(row.observedLossHectares)} ·{" "}
                    {text.observedLossPercent}:{" "}
                    {number.format(row.observedLossPercent)} · {text.coverage}:{" "}
                    {text.complete}
                  </p>
                  <p>
                    {text.source}:{" "}
                    <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                      {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                    </a>
                  </p>
                </li>
              ))
            : selected.map((event) => (
                <li className="card card--lift" key={event.id}>
                  <h2>{event.name[locale]}</h2>
                  <p>
                    {text.year}: {event.year}
                  </p>
                  <Details event={event} locale={locale} />
                </li>
              ))}
        </ul>
      ) : null}
      {data === "chart" ? (
        <svg
          className="explore-chart"
          role="img"
          aria-label={text.chart}
          viewBox="0 0 300 120"
        >
          <title>{text.chart}</title>
          {(productionAvailable ? EXPLORE_PRODUCTION_LAYER.rows : selected).map(
            (item, index) => {
              const isProduction = "observedLossPercent" in item;
              const value = isProduction ? item.observedLossPercent : 3;
              const label = item.name[locale];
              const detail = isProduction
                ? `${number.format(value)}%`
                : String(item.year);
              return (
                <g key={item.id}>
                  <title>{`${label}: ${detail}`}</title>
                  <rect
                    className="explore-bar"
                    x={35 + index * 65}
                    y={95 - value * 20}
                    width="36"
                    height={value * 20}
                    rx="4"
                    fill="url(#hatch)"
                    stroke="currentColor"
                  />
                  <text
                    className="explore-bar-label"
                    x={35 + index * 65}
                    y={110}
                  >
                    {isProduction ? item.id : item.year}
                  </text>
                </g>
              );
            },
          )}
        </svg>
      ) : productionAvailable ? (
        <div className="table-scroll">
          <table className="explore-table">
            <caption>
              {text.table}: {EXPLORE_PRODUCTION_LAYER.period}
            </caption>
            <thead>
              <tr>
                <th scope="col">{text.event}</th>
                <th scope="col">{text.year}</th>
                <th scope="col">{text.observedLoss}</th>
                <th scope="col">{text.observedLossPercent}</th>
                <th scope="col">{text.coverage}</th>
                <th scope="col">{text.source}</th>
              </tr>
            </thead>
            <tbody>
              {EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name[locale]}</th>
                  <td>{EXPLORE_PRODUCTION_LAYER.period}</td>
                  <td>{number.format(row.observedLossHectares)}</td>
                  <td>{number.format(row.observedLossPercent)}</td>
                  <td>{text.complete}</td>
                  <td>
                    <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
                      {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="explore-table">
            <caption>{text.table}</caption>
            <thead>
              <tr>
                <th scope="col">{text.event}</th>
                <th scope="col">{text.year}</th>
                <th scope="col">{text.coverage}</th>
                <th scope="col">{text.evidence}</th>
                <th scope="col">{text.confidence}</th>
                <th scope="col">{text.source}</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((event) => (
                <tr key={event.id}>
                  <th scope="row">{event.name[locale]}</th>
                  <td>{event.year}</td>
                  <td>
                    <CoverageBand
                      coverageGrade={event.coverageGrade}
                      locale={locale}
                    />
                  </td>
                  <td>
                    <EvidenceChip evidence={event.evidence} locale={locale} />
                  </td>
                  <td>
                    <ConfidenceBadge
                      confidence={event.confidence}
                      locale={locale}
                    />
                  </td>
                  <td>
                    <ProvenanceBlock
                      provenance={event.provenance}
                      locale={locale}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!productionAvailable ? (
        <ul
          className="explore-legend"
          aria-label={locale === "en" ? "Legend" : "Légende"}
        >
          {EXPLORE_MODES.map((item) => (
            <li key={item}>
              <svg
                aria-hidden="true"
                width="28"
                height="22"
                viewBox="0 0 100 110"
              >
                <title>{text.modes[item]}</title>
                {symbol(item, 50)}
              </svg>
              {text.modes[item]}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
