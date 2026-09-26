import { ProvinceFlag } from "@/components/site/ProvinceBar";
import { colon, formatNumber, formatYearRange, PRODUCT_NAME, yearRange, type Locale } from "@/lib/domain";
import {
  binLabel,
  cellsToHectares,
  HARVEST_FIRE_PROVINCE_IDS,
  HARVEST_FIRE_SERIES,
  HARVEST_FIRE_STEPS,
  harvestFireCharts,
  harvestFireCsv,
  type HarvestFireChartModel,
  type HarvestFireProvinceId,
  type HarvestFireQuery,
  type HarvestFireSeries,
  type HarvestFireStep,
} from "@/lib/harvest-fire";
import { chartGeometry, SVG_SIZE } from "@/lib/harvest-fire/chart";
import type { PngText } from "@/lib/harvest-fire/png";
import { UNMAPPED_REASONS } from "@/lib/explore/unmapped-reasons";
import { HarvestFireCsvButton, HarvestFirePngButton } from "./HarvestFireDownloads";

const FLAG_KEYS = { "59": "bc", "48": "ab", "35": "on", "24": "qc" } as const satisfies Record<HarvestFireProvinceId, string>;
const RECORD_URL = "https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/harvest-fire-province-annual-series.json";
const DECISION_URL = "https://github.com/chinonsoobeta/Witness_Tree/blob/main/docs/HARVEST_FIRE_SERIES_DECISION.md";

const COPY = {
  en: {
    eyebrow: "Harvest and fire",
    title: "Harvest and fire by province",
    lead: "How much forest was cleared by harvest and how much by fire in British Columbia, Alberta, Ontario and Québec, each year from 1985 to 2022. Choose the provinces, years and grouping, then download the chart or its numbers.",
    unavailable: "These figures are not available right now.",
    measureTitle: "What the bars show",
    sumTitle: "Why years can be added here",
    sumBody: "Elsewhere on this site, yearly losses are never added up, because a place lost in two years would be counted twice. These figures are different: the national record gives each 30 m square at most one harvest year and one fire year. Adding harvest years counts each square once, and so does adding fire years.",
    sumNever: "Harvest and fire are never added to each other, because one square can carry both.",
    builderTitle: "Build a chart",
    provinces: "Provinces",
    firstYear: "First year",
    lastYear: "Last year",
    step: "Group the years",
    steps: { 1: "Each year", 5: "Five years", 10: "Ten years", span: "Whole span" } as Record<string, string>,
    scale: "Vertical scale",
    shared: "Same scale in every chart",
    own: "Each chart fits its own bars",
    view: "Show as",
    chart: "Charts",
    table: "Table",
    submit: "Show",
    chartTitle: (name: string, range: string) => `${name}: forest cleared by harvest and by fire, ${range}`,
    subtitle: { 1: "Hectares each year", 5: "Hectares per five-year interval", 10: "Hectares per ten-year interval", span: "Hectares over the whole span" } as Record<string, string>,
    sharedNote: "same scale in every chart",
    harvest: "Harvest",
    fire: "Fire",
    xAxis: { 1: "Year", 5: "Five-year interval", 10: "Ten-year interval", span: "Years" } as Record<string, string>,
    yAxis: "Hectares",
    tooltip: (name: string, label: string, kind: string, value: string) => `${name}, ${label}, ${kind}: ${value} ha`,
    short: (label: string, years: number) => `* ${label} covers ${years} ${years === 1 ? "year" : "years"} only; the record ends in 2022.`,
    png: (name: string) => `Download ${name} chart (PNG)`,
    csv: "Download these numbers (CSV)",
    record: "Open the full yearly record (JSON)",
    decision: "Read the publication decision",
    caption: "Harvest and fire by province and interval, in hectares",
    province: "Province",
    years: "Years",
    harvestHa: "Harvest (ha)",
    fireHa: "Fire (ha)",
    unknownHa: "Not mapped, Unknown (ha)",
    coverageTitle: "What the record cannot see",
    coverage: (name: string, hectares: string, reason: string) => `${name}: ${hectares} ha of land is not mapped, ${reason}. No harvest or fire is dated there, and it is Unknown, never zero.`,
    baseline: "1984 is the first image, so nothing can be dated to it. Charts start in 1985.",
    limitsTitle: "Read these before comparing",
    notesHeading: "Notes",
    sourceTitle: "Sources",
    tabulation: `Tabulation: ${PRODUCT_NAME.en}, technical preview, not expert reviewed.`,
    explore: "See harvest and fire on the map",
  },
  fr: {
    eyebrow: "Récolte et feu",
    title: "Récolte et feu par province",
    lead: "La superficie de forêt dégagée par la récolte et celle dégagée par le feu en Colombie-Britannique, en Alberta, en Ontario et au Québec, chaque année de 1985 à 2022. Choisissez les provinces, les années et le regroupement, puis téléchargez le graphique ou ses chiffres.",
    unavailable: "Ces chiffres ne sont pas disponibles pour le moment.",
    measureTitle: "Ce que montrent les barres",
    sumTitle: "Pourquoi les années peuvent être additionnées ici",
    sumBody: "Ailleurs sur ce site, les pertes annuelles ne sont jamais additionnées, car un lieu perdu deux années serait compté deux fois. Ces chiffres sont différents : le registre national donne à chaque carré de 30 m au plus une année de récolte et une année de feu. Additionner les années de récolte compte chaque carré une seule fois, tout comme additionner les années de feu.",
    sumNever: "La récolte et le feu ne sont jamais additionnés, car un même carré peut porter les deux.",
    builderTitle: "Créer un graphique",
    provinces: "Provinces",
    firstYear: "Première année",
    lastYear: "Dernière année",
    step: "Regrouper les années",
    steps: { 1: "Chaque année", 5: "Cinq ans", 10: "Dix ans", span: "Toute la période" } as Record<string, string>,
    scale: "Échelle verticale",
    shared: "Même échelle pour chaque graphique",
    own: "Chaque graphique s’ajuste à ses barres",
    view: "Afficher en",
    chart: "Graphiques",
    table: "Tableau",
    submit: "Afficher",
    chartTitle: (name: string, range: string) => `${name} : forêt dégagée par la récolte et par le feu, ${range}`,
    subtitle: { 1: "Hectares par année", 5: "Hectares par période de cinq ans", 10: "Hectares par période de dix ans", span: "Hectares sur toute la période" } as Record<string, string>,
    sharedNote: "même échelle pour chaque graphique",
    harvest: "Récolte",
    fire: "Feu",
    xAxis: { 1: "Année", 5: "Période de cinq ans", 10: "Période de dix ans", span: "Années" } as Record<string, string>,
    yAxis: "Hectares",
    tooltip: (name: string, label: string, kind: string, value: string) => `${name}, ${label}, ${kind.toLowerCase()} : ${value} ha`,
    short: (label: string, years: number) => `* ${label} ne couvre que ${years} ${years === 1 ? "année" : "années"}; la série se termine en 2022.`,
    png: (name: string) => `Télécharger le graphique ${name} (PNG)`,
    csv: "Télécharger ces chiffres (CSV)",
    record: "Ouvrir la série annuelle complète (JSON)",
    decision: "Lire la décision de publication",
    caption: "Récolte et feu par province et par période, en hectares",
    province: "Province",
    years: "Années",
    harvestHa: "Récolte (ha)",
    fireHa: "Feu (ha)",
    unknownHa: "Non cartographié, inconnu (ha)",
    coverageTitle: "Ce que la série ne voit pas",
    coverage: (name: string, hectares: string, reason: string) => `${name} : ${hectares} ha de terres ne sont pas cartographiés, ${reason}. Aucune récolte ni aucun feu n’y est daté; ce territoire est inconnu, jamais zéro.`,
    baseline: "1984 est la première image; rien ne peut donc y être daté. Les graphiques commencent en 1985.",
    limitsTitle: "À lire avant de comparer",
    notesHeading: "Notes",
    sourceTitle: "Sources",
    tabulation: `Compilation : ${PRODUCT_NAME.fr}, aperçu technique, non examiné par des spécialistes.`,
    explore: "Voir la récolte et le feu sur la carte",
  },
} as const;

type Copy = (typeof COPY)[Locale];
const stepKey = (step: HarvestFireStep) => String(step);

function sourceLines(series: HarvestFireSeries, locale: Locale, text: Copy) {
  const { sources } = series;
  return [
    sources.attribution[locale],
    `${sources.harvest.title}${colon(locale)} ${sources.harvest.url}. ${sources.fire.title}${colon(locale)} ${sources.fire.url}.`,
    sources.citation,
    text.tabulation,
  ];
}

function pngText(chart: HarvestFireChartModel, series: HarvestFireSeries, query: HarvestFireQuery, locale: Locale, text: Copy): PngText {
  const name = chart.province.name[locale];
  const range = formatYearRange(yearRange(query.firstYear, query.lastYear), locale, "compact");
  const shared = query.scale === "shared" && query.provinces.length > 1;
  const short = chart.bins.find((bin) => bin.short);
  const reason = UNMAPPED_REASONS[chart.province.id][locale];
  return {
    title: text.chartTitle(name, range),
    subtitle: `${text.subtitle[stepKey(query.step)]}${shared ? ` · ${text.sharedNote}` : ""}`,
    harvest: text.harvest,
    fire: text.fire,
    xAxis: text.xAxis[stepKey(query.step)],
    yAxis: text.yAxis,
    notesHeading: text.notesHeading,
    sourcesHeading: text.sourceTitle,
    notes: [
      series.measure[locale],
      ...series.limits.map((limit) => limit[locale]),
      text.coverage(name, formatNumber(cellsToHectares(chart.province.unknownCells), locale, 0), reason),
      ...(short ? [text.short(binLabel(short, locale), short.lastYear - short.firstYear + 1)] : []),
    ],
    sources: sourceLines(series, locale, text),
  };
}

function Chart({ chart, locale, text, query }: Readonly<{ chart: HarvestFireChartModel; locale: Locale; text: Copy; query: HarvestFireQuery }>) {
  const geometry = chartGeometry(chart, locale, SVG_SIZE);
  const name = chart.province.name[locale];
  const { plot } = geometry;
  const label = text.chartTitle(name, formatYearRange(yearRange(query.firstYear, query.lastYear), locale, "compact"));
  return (
    <div className="hf-chart-scroll">
      <svg className="hf-chart-svg" role="img" aria-label={label} viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%">
        <title>{label}</title>
        {geometry.ticks.map((tick) => (
          <g key={tick.value}>
            <line className={tick.value === 0 ? "hf-axis" : "hf-grid"} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} />
            <text className="hf-tick" x={plot.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">{tick.label}</text>
          </g>
        ))}
        {geometry.bins.map((bin) => (
          <g key={bin.label}>
            {([["harvest", bin.harvest, text.harvest], ["fire", bin.fire, text.fire]] as const).map(([kind, bar, kindLabel]) => (
              <g key={kind}>
                <rect className={`hf-bar hf-bar--${kind}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={Math.min(4, bar.width / 2)}>
                  <title>{text.tooltip(name, bin.label, kindLabel, formatNumber(bar.value, locale, 0))}</title>
                </rect>
                {geometry.showValues ? (
                  <text className="hf-value" x={bar.x + bar.width / 2} y={bar.y - 5} textAnchor="middle">{bar.text}</text>
                ) : null}
              </g>
            ))}
            {bin.showLabel ? <text className="hf-label" x={bin.centre} y={plot.bottom + 20} textAnchor="middle">{bin.label}</text> : null}
          </g>
        ))}
        <text className="hf-axis-title" x={(plot.left + plot.right) / 2} y={geometry.height - 6} textAnchor="middle">{text.xAxis[stepKey(query.step)]}</text>
        <text className="hf-axis-title" transform={`translate(14 ${(plot.top + plot.bottom) / 2}) rotate(-90)`} textAnchor="middle">{text.yAxis}</text>
      </svg>
    </div>
  );
}

function Builder({ query, locale, text }: Readonly<{ query: HarvestFireQuery; locale: Locale; text: Copy }>) {
  const series = HARVEST_FIRE_SERIES as HarvestFireSeries;
  const years = Array.from({ length: series.lastYear - series.firstYear + 1 }, (_, i) => series.firstYear + i);
  const radio = (name: string, value: string, checked: boolean, label: string) => {
    const controlId = `hf-${name}-${value}`;
    return (
      <label className="hf-option" key={value} htmlFor={controlId}>
        <input id={controlId} type="radio" name={name} value={value} defaultChecked={checked} /> {label}
      </label>
    );
  };
  return (
    <form className="hf-builder card" method="get" aria-labelledby="hf-builder-heading">
      <h2 id="hf-builder-heading">{text.builderTitle}</h2>
      <fieldset className="hf-fieldset">
        <legend>{text.provinces}</legend>
        {HARVEST_FIRE_PROVINCE_IDS.map((id) => {
          const province = series.provinces.find((p) => p.id === id);
          const controlId = `hf-province-${id}`;
          return (
            <label className="hf-option" key={id} htmlFor={controlId}>
              <input id={controlId} type="checkbox" name="provinces" value={id} defaultChecked={query.provinces.includes(id)} />{" "}
              <ProvinceFlag province={FLAG_KEYS[id]} locale={locale} /> {province?.name[locale]}
            </label>
          );
        })}
      </fieldset>
      <div className="hf-years">
        <div className="field">
          <label htmlFor="hf-from">{text.firstYear}</label>
          <select id="hf-from" name="from" className="explore-year-select" defaultValue={query.firstYear}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hf-to">{text.lastYear}</label>
          <select id="hf-to" name="to" className="explore-year-select" defaultValue={query.lastYear}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="hf-fieldset">
        <legend>{text.step}</legend>
        {HARVEST_FIRE_STEPS.map((step) => radio("step", stepKey(step), query.step === step, text.steps[stepKey(step)]))}
      </fieldset>
      <fieldset className="hf-fieldset">
        <legend>{text.scale}</legend>
        {radio("scale", "shared", query.scale === "shared", text.shared)}
        {radio("scale", "own", query.scale === "own", text.own)}
      </fieldset>
      <fieldset className="hf-fieldset">
        <legend>{text.view}</legend>
        {radio("view", "chart", query.view === "chart", text.chart)}
        {radio("view", "table", query.view === "table", text.table)}
      </fieldset>
      <button className="btn btn--primary" type="submit">{text.submit}</button>
    </form>
  );
}

export function HarvestFirePage({ locale, query }: Readonly<{ locale: Locale; query: HarvestFireQuery }>) {
  const text = COPY[locale];
  const series = HARVEST_FIRE_SERIES;
  const header = (
    <header className="masthead prose-measure">
      <p className="eyebrow">{text.eyebrow}</p>
      <h1>{text.title}</h1>
      <p className="dek">{text.lead}</p>
    </header>
  );
  if (!series) return <>{header}<p className="unknown-value" role="status">{text.unavailable}</p></>;

  const charts = harvestFireCharts(series, query);
  const csv = harvestFireCsv(charts);
  const range = `${query.firstYear}-${query.lastYear}`;
  const shortBins = charts[0].bins.filter((bin) => bin.short);
  const legend = (
    <ul className="hf-legend" aria-label={locale === "en" ? "Legend" : "Légende"}>
      <li><span className="hf-swatch hf-swatch--harvest" aria-hidden="true" />{text.harvest}</li>
      <li><span className="hf-swatch hf-swatch--fire" aria-hidden="true" />{text.fire}</li>
    </ul>
  );

  return (
    <>
      {header}
      <section className="content-section prose-measure">
        <h2>{text.measureTitle}</h2>
        <p>{series.measure[locale]}</p>
        <h3>{text.sumTitle}</h3>
        <p>{text.sumBody}</p>
        <p>{text.sumNever} <a href={DECISION_URL}>{text.decision}</a></p>
      </section>

      <section className="content-section hf-workspace">
        <Builder query={query} locale={locale} text={text} />
        <div className="hf-output" aria-live="polite">
          {query.view === "chart" ? charts.map((chart) => {
            const flagId = `hf-flag-${chart.province.code.toLowerCase()}`;
            const png = pngText(chart, series, query, locale, text);
            return (
              <figure className="hf-figure" key={chart.province.id} aria-labelledby={`hf-title-${chart.province.id}`}>
                <div className="hf-figure-head">
                  <ProvinceFlag province={FLAG_KEYS[chart.province.id]} locale={locale} id={flagId} />
                  <h2 id={`hf-title-${chart.province.id}`}>{png.title}</h2>
                </div>
                <p className="hf-subtitle">{png.subtitle}</p>
                {legend}
                <Chart chart={chart} locale={locale} text={text} query={query} />
                <figcaption className="hf-caption">
                  {text.coverage(chart.province.name[locale], formatNumber(cellsToHectares(chart.province.unknownCells), locale, 0), UNMAPPED_REASONS[chart.province.id][locale])}
                </figcaption>
                <HarvestFirePngButton
                  chart={chart}
                  locale={locale}
                  text={png}
                  flagId={flagId}
                  filename={`${chart.province.key}-harvest-fire-${range}.png`}
                  label={text.png(chart.province.name[locale])}
                />
              </figure>
            );
          }) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="hf-table-caption">
              <table>
                <caption id="hf-table-caption">{text.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{text.province}</th>
                    <th scope="col">{text.years}</th>
                    <th scope="col">{text.harvestHa}</th>
                    <th scope="col">{text.fireHa}</th>
                    <th scope="col">{text.unknownHa}</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.flatMap(({ province, bins }) => bins.map((bin) => (
                    <tr key={`${province.id}-${bin.firstYear}`}>
                      <th scope="row">{province.name[locale]}</th>
                      <td>{`${binLabel(bin, locale)}${bin.short ? "*" : ""}`}</td>
                      <td>{formatNumber(bin.harvestHectares, locale)}</td>
                      <td>{formatNumber(bin.fireHectares, locale)}</td>
                      <td>{formatNumber(cellsToHectares(province.unknownCells), locale)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
          {shortBins.map((bin) => <p className="hf-note" key={bin.firstYear}>{text.short(binLabel(bin, locale), bin.lastYear - bin.firstYear + 1)}</p>)}
          <p className="hf-note">{text.baseline}</p>
          <p className="hf-downloads">
            <HarvestFireCsvButton csv={csv} filename={`harvest-fire-${range}.csv`} label={text.csv} />{" "}
            <a className="btn btn--outline" href={RECORD_URL}>{text.record}</a>{" "}
            <a className="btn btn--outline" href={`/${locale}/${locale === "en" ? "explore" : "explorer"}?mode=recorded-harvest`}>{text.explore}</a>
          </p>
        </div>
      </section>

      <section className="content-section prose-measure">
        <h2>{text.limitsTitle}</h2>
        <ul>
          {series.limits.map((limit) => <li key={limit.en}>{limit[locale]}</li>)}
        </ul>
        <h2>{text.coverageTitle}</h2>
        <ul>
          {series.provinces.map((province) => (
            <li key={province.id}>{text.coverage(province.name[locale], formatNumber(cellsToHectares(province.unknownCells), locale, 0), UNMAPPED_REASONS[province.id][locale])}</li>
          ))}
        </ul>
        <p>{text.baseline}</p>
      </section>

      <section className="content-section prose-measure hf-sources" id="sources">
        <h2>{text.sourceTitle}</h2>
        <p>{series.sources.attribution[locale]}</p>
        <ul>
          <li><a href={series.sources.harvest.url}>{series.sources.harvest.title}</a></li>
          <li><a href={series.sources.fire.url}>{series.sources.fire.title}</a></li>
        </ul>
        <p>{series.sources.citation}</p>
        <p>{series.sources.boundary}</p>
        <p>{text.tabulation}</p>
      </section>
    </>
  );
}
