import {
  ConfidenceBadge,
  CoverageBand,
  EvidenceChip,
  ProvenanceBlock,
} from "@/components/policy";
import {
  BOUNDARY_OVERLAY_IDS,
  BOUNDARY_OVERLAYS,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_PRODUCTION_LAYER,
  EXPLORE_MODES,
  exploreHref,
  type ExploreDataView,
  type ExploreEvent,
  type ExploreMode,
  type ExplorePresentation,
  serializeBoundaryOverlays,
  toggleBoundaryOverlay,
  type BoundaryOverlayId,
} from "@/lib/explore";
import { colon, labelled, type Locale } from "@/lib/domain";
import { ExploreYearControl } from "./ExploreYearControl";

const copy = {
  en: {
    title: "Explore",
    yearControl: "Show illustrative fixtures through year",
    update: "Update",
    production:
      "The list, chart, and table use the same verified 2020–2022 province aggregate. The map adds per-cell detected loss patches for 1984–2022: they are traced from the 30 m grid, they have not been expert-reviewed, and no figure on this site is counted from them.",
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
    observedLoss: "Observed loss (ha)",
    observedLossPercent: "Observed loss (%)",
    complete: "Every input pixel present",
    partial: "Some pixels unknown, so this is a minimum",
    source: "Source attribution",
    modes: {
      "forest-change": "Forest change",
      "recorded-harvest": "Recorded harvest",
      wildfire: "Wildfire",
      "condition-recovery": "Condition and recovery",
    },
  },
  fr: {
    title: "Explorer",
    yearControl: "Afficher les exemples illustratifs jusqu’à l’année",
    update: "Mettre à jour",
    production:
      "La liste, le graphique et le tableau utilisent le même agrégat provincial vérifié de 2020 à 2022. La carte y ajoute les parcelles de perte détectée par cellule de 1984 à 2022 : elles sont tracées à partir de la grille de 30 m, elles n’ont pas fait l’objet d’un examen par des experts, et aucun chiffre de ce site n’en est tiré.",
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
    observedLoss: "Perte observée (ha)",
    observedLossPercent: "Perte observée (%)",
    complete: "Tous les pixels d’entrée sont présents",
    partial: "Certains pixels sont inconnus; il s’agit donc d’un minimum",
    source: "Attribution de la source",
    modes: {
      "forest-change": "Changement forestier",
      "recorded-harvest": "Récolte consignée",
      wildfire: "Incendies",
      "condition-recovery": "État et rétablissement",
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
  overlays: readonly BoundaryOverlayId[] = [],
) {
  return exploreHref({ mode, presentation, data, year, overlays });
}
function Details({ event, locale }: { event: ExploreEvent; locale: Locale }) {
  const text = copy[locale];
  return (
    <>
      <EvidenceChip evidence={event.evidence} locale={locale} /> ·{" "}
      {text.confidence}
      {colon(locale)}{" "}
      <ConfidenceBadge confidence={event.confidence} locale={locale} /> ·{" "}
      {text.coverage}
      {colon(locale)}{" "}
      <CoverageBand coverageGrade={event.coverageGrade} locale={locale} />
      <span>
        {event.unknownReason ? `${colon(locale)} ${event.unknownReason}` : ""}
      </span>
      <p>
        {text.source}
        {colon(locale)}{" "}
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
  overlays = [],
}: {
  events: readonly ExploreEvent[];
  locale: Locale;
  mode?: ExploreMode;
  presentation?: ExplorePresentation;
  data?: ExploreDataView;
  year?: number;
  overlays?: readonly BoundaryOverlayId[];
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
        {overlays.length > 0 ? (
          <input
            type="hidden"
            name="overlays"
            value={serializeBoundaryOverlays(overlays)}
          />
        ) : null}
        <ExploreYearControl
          locale={locale}
          state={{ mode, presentation, data, year, overlays }}
        />
      </form>
      <nav className="segment" aria-label={text.title}>
        {EXPLORE_MODES.map((item) => (
          <a
            key={item}
            className="segment-option"
            href={href(item, presentation, data, year, overlays)}
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
          href={href(mode, "map", data, year, overlays)}
          aria-current={presentation === "map" ? "page" : undefined}
        >
          {text.map}
        </a>{" "}
        <a
          className="segment-option"
          href={href(mode, "list", data, year, overlays)}
          aria-current={presentation === "list" ? "page" : undefined}
        >
          {text.list}
        </a>
      </fieldset>
      <fieldset className="segment-set">
        <legend>{text.data}</legend>
        <a
          className="segment-option"
          href={href(mode, presentation, "chart", year, overlays)}
          aria-current={data === "chart" ? "page" : undefined}
        >
          {text.chart}
        </a>{" "}
        <a
          className="segment-option"
          href={href(mode, presentation, "table", year, overlays)}
          aria-current={data === "table" ? "page" : undefined}
        >
          {text.table}
        </a>
      </fieldset>
      <section className="explore-overlays" aria-label={text.overlays}>
        <h2>{text.overlays}</h2>
        <p className="explore-note">{text.overlaysNote}</p>
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
                      year,
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
                {active ? (
                  <span className="overlay-state">{text.shown}</span>
                ) : null}
                <p className="overlay-note">{overlay.note[locale]}</p>
                {overlay.reason ? (
                  <p className="overlay-note">
                    {text.whyNot}
                    {colon(locale)} {overlay.reason[locale]}
                  </p>
                ) : null}
                {overlay.attribution ? (
                  <p className="overlay-attribution">
                    {overlay.attribution[locale]}
                  </p>
                ) : null}
              </li>
            );
          })}
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
                    {text.observedLoss}
                    {colon(locale)}{" "}
                    {number.format(row.observedLossHectares)} ·{" "}
                    {text.observedLossPercent}
                    {colon(locale)}{" "}
                    {number.format(row.observedLossPercent)} · {text.coverage}
                    {colon(locale)}{" "}
                    {row.coverageGrade === "complete" ? text.complete : text.partial}
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
                  <h2>{event.name[locale]}</h2>
                  <p>
                    {text.year}
                    {colon(locale)} {event.year}
                  </p>
                  <Details event={event} locale={locale} />
                </li>
              ))}
        </ul>
      ) : null}
      {data === "chart" ? (
        (() => {
          const rows = productionAvailable
            ? EXPLORE_PRODUCTION_LAYER.rows
            : selected;
          // A horizontal bar reads the province names without truncating them,
          // and the scale is taken from the largest value present so a 1% bar
          // is not a sliver in an empty box.
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
              viewBox={`0 0 500 ${Math.max(rows.length, 1) * rowHeight + 12}`}
            >
              <title>{text.chart}</title>
              {rows.map((item, index) => {
                const isProduction = "observedLossPercent" in item;
                const value = isProduction ? item.observedLossPercent : 1;
                const label = item.name[locale];
                const detail = isProduction
                  ? `${number.format(value)}%`
                  : String(item.year);
                const y = index * rowHeight + 8;
                return (
                  <g key={item.id}>
                    <title>{labelled(locale, label, detail)}</title>
                    <text className="explore-bar-name" x="0" y={y + 15}>
                      {label}
                    </text>
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
      ) : productionAvailable ? (
        <div className="table-scroll">
          <table className="explore-table">
            <caption>
              {text.table}
              {colon(locale)} {EXPLORE_PRODUCTION_LAYER.period}
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
                  <td>
                    {row.coverageGrade === "complete"
                      ? text.complete
                      : text.partial}
                  </td>
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
