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
  formatUnknownSharePercent,
  perCellAnnualForYear,
  perCellArchiveForYear,
  perCellCauseForMode,
  type ExploreDataView,
  type ExploreEvent,
  type ExploreMode,
  type ExplorePresentation,
  serializeBoundaryOverlays,
  toggleBoundaryOverlay,
  type BoundaryOverlayId,
} from "@/lib/explore";
import { colon, labelled, type Locale } from "@/lib/domain";
import { PlaceFinder } from "@/components/search";
import { ExploreYearControl } from "./ExploreYearControl";

const copy = {
  en: {
    title: "Explore",
    yearControl: "Show illustrative fixtures through year",
    update: "Update",
    /*
     * Two captions, because the map on screen is not always the same map.
     *
     * The per-cell release is empty until its tiles are published, and while it
     * is empty no patch layer is drawn at any year. One caption that always
     * promised patches described a layer the reader could not see, which is the
     * single thing this record must never do. The longer caption is used only
     * where an archive actually exists for the year being shown.
     */
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
    annualNone: "No per-cell interval covers this year.",
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
    unknownArea: "ha unknown",
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
    annualNone: "Aucun intervalle par cellule ne couvre cette année.",
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
    unknownArea: "ha inconnus",
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
  query = "",
}: {
  events: readonly ExploreEvent[];
  locale: Locale;
  mode?: ExploreMode;
  presentation?: ExplorePresentation;
  data?: ExploreDataView;
  year?: number;
  overlays?: readonly BoundaryOverlayId[];
  query?: string;
}) {
  const text = copy[locale];
  const selected = events.filter((event) => event.mode === mode);
  const productionAvailable = mode === "forest-change" && year >= 2022;
  /*
   * Whether the map really draws per-cell patches right now, asked exactly the
   * way the map itself asks it, so the caption cannot drift from what is on
   * screen. Both halves matter: a mode with no per-cell cause draws nothing,
   * and neither does a year the published release does not cover.
   */
  const perCellShown =
    perCellCauseForMode(mode) !== null && perCellArchiveForYear(year) !== null;
  const note = !productionAvailable
    ? text.fixtureList
    : perCellShown
      ? text.productionWithPerCell
      : text.production;
  const number = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  });
  /*
   * The annual figure is shown only where the patches it describes are shown.
   * The series covers every interval whether or not the tiles are published, so
   * gating on the same condition as the drawing keeps a number from appearing
   * beside an empty map and reading as a total of nothing.
   */
  const annual = perCellShown ? perCellAnnualForYear(year) : null;
  const provinceCoverageLabel = (row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number]) =>
    `${text.partial} (${formatUnknownSharePercent(row.unknownSharePercent, locale)}; ${number.format(row.unknownRequiredInputHectares)} ${text.unknownArea})`;
  return (
    <section className="explore" aria-label={text.title}>
      <p className="explore-note">
        {note}
      </p>
      {perCellShown ? (
        <div className="explore-annual">
          <h3>{`${text.annualHeading}, ${annual ? annual.interval : year}`}</h3>
          {annual ? (
            <>
              <dl>
                <div>
                  <dt>{text.annualDetected}</dt>
                  <dd>{`${number.format(annual.hectares)} (${text.partial})`}</dd>
                </div>
                <div>
                  <dt>{text.annualHarvest}</dt>
                  <dd>{number.format(annual.harvestHectares)}</dd>
                </div>
                <div>
                  <dt>{text.annualFire}</dt>
                  <dd>{number.format(annual.fireHectares)}</dd>
                </div>
                <div>
                  <dt>{text.annualUnattributed}</dt>
                  <dd>{number.format(annual.unattributedHectares)}</dd>
                </div>
              </dl>
              <p className="explore-annual-basis">{text.annualBasis}</p>
            </>
          ) : (
            <p className="explore-annual-basis">{text.annualNone}</p>
          )}
        </div>
      ) : null}
      <PlaceFinder
        locale={locale}
        query={query}
        context="explore"
        parameters={[
          { name: "mode", value: mode },
          { name: "presentation", value: presentation },
          { name: "data", value: data },
          { name: "year", value: String(year) },
          ...(overlays.length > 0
            ? [{ name: "overlays", value: serializeBoundaryOverlays(overlays) }]
            : []),
        ]}
      />
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
                    {provinceCoverageLabel(row)}
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
                    {provinceCoverageLabel(row)}
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
