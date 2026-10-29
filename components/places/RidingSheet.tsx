import type { Metadata } from "next";
import { HarvestFireChartSvg } from "@/components/transparency/HarvestFireChartSvg";
import { colon, EVIDENCE_DEFINITIONS, formatHectares, formatNumber, PRODUCT_NAME, type Locale } from "@/lib/domain";
import { UNMAPPED_REASONS } from "@/lib/explore/unmapped-reasons";
import { binLabel, cellsToHectares, HARVEST_FIRE_SERIES, harvestFireCharts, type HarvestFireChartModel, type HarvestFireSeries } from "@/lib/harvest-fire";
import { SVG_SIZE } from "@/lib/harvest-fire/chart";
import { landCoverProvenance, PLACE_DATA_VERSION, ridingSheetPath, type PlacePageRecord } from "@/lib/place-pages";
import { PLACE_METHOD_VERSION } from "@/lib/place-pages/paths";
import { placeSummary } from "@/lib/place-pages/summary";
import { RECEIPT_COPY } from "@/lib/share/meta";
import { localizedAlternates, SITE_ORIGIN } from "@/lib/site-metadata";
import { PrintButton } from "./PrintButton";
import { COPY as PAGE_COPY } from "./RecordPlacePage";

/**
 * A riding's one-page sheet, for a constituent or a reporter to print or save
 * as a PDF and hand on (feature plan item 2). It prints what the riding's page
 * and share card say, in their words (lib/place-pages/summary.ts, the card's
 * labels in lib/share/meta.ts and the page's own labels), with the province's
 * harvest and fire series beside it as an SVG drawn here on the server.
 *
 * The neutral-language rules hold: no ranking position, no colour scale, the
 * measure named as detected loss as a share of mapped forest, and no
 * representative's name, because a boundary does not make anyone responsible.
 * An Unknown prints as Unknown with its reason, never as 0.
 *
 * The browser's print dialog makes the PDF ("Save as PDF"), so there is no PDF
 * library. The print rules in app/globals.css lay the sheet out on the part of
 * the page that Letter and A4 share, so either paper takes it on one page.
 */

const COPY = {
  en: {
    back: "Back to the riding’s page",
    print: "Print or save as PDF",
    hint: "To keep a file, choose “Save as PDF” as the printer. The sheet fits one Letter or A4 page.",
    figureTitle: "Detected loss as a share of mapped forest",
    shareOf: "of the forest mapped in 1984 was detected as lost at least once from 1984 to 2022.",
    shareUnknown: "Unknown",
    provinceTitle: (province: string) => `Harvest and fire in ${province}, 1985–2022`,
    provinceNote: "This chart is for the whole province, not this riding. The riding figure above counts all detected loss, whatever its cause.",
    subtitle: "Hectares per five-year interval",
    harvest: "Harvest",
    fire: "Fire",
    harvestKey: "Harvest: left bar of each pair",
    fireKey: "Fire: right bar of each pair",
    xAxis: "Five-year interval",
    yAxis: "Hectares",
    tooltip: (name: string, label: string, kind: string, value: string) => `${name}, ${label}, ${kind}: ${value} ha`,
    chartLabel: (province: string) => `${province}: forest cleared by harvest and by fire, 1985–2022, in hectares per five-year interval`,
    short: (label: string, years: number) => `* ${label} covers ${years} years only; the record ends in 2022.`,
    provinceUnknown: (province: string, hectares: string, reason: string) => `${province}: ${hectares} ha have no satellite data, ${reason}. No harvest or fire can be dated there; it counts as unknown, never zero.`,
    sources: "Sources and licence",
    forestLoss: "Forest loss",
    harvestFire: "Harvest and fire",
    version: "Version",
    retrieved: "Retrieved",
    online: "This page online",
  },
  // Draft French for the owner's review (2026-10-29).
  fr: {
    back: "Retour à la page de la circonscription",
    print: "Imprimer ou enregistrer en PDF",
    hint: "Pour garder un fichier, choisissez «\u00a0Enregistrer au format PDF\u00a0» comme imprimante. La fiche tient sur une page Lettre ou A4.",
    figureTitle: "Perte détectée en part de la forêt cartographiée",
    shareOf: "de la forêt cartographiée en 1984 a été détectée comme perdue au moins une fois de 1984 à 2022.",
    shareUnknown: "Inconnu",
    provinceTitle: (province: string) => `Récolte et feu, ${province}, 1985–2022`,
    provinceNote: "Ce graphique porte sur toute la province, et non sur cette circonscription. Le chiffre de la circonscription, plus haut, compte toute perte détectée, quelle qu’en soit la cause.",
    subtitle: "Hectares par période de cinq ans",
    harvest: "Récolte",
    fire: "Feu",
    harvestKey: "Récolte\u202F: barre de gauche de chaque paire",
    fireKey: "Feu\u202F: barre de droite de chaque paire",
    xAxis: "Période de cinq ans",
    yAxis: "Hectares",
    tooltip: (name: string, label: string, kind: string, value: string) => `${name}, ${label}, ${kind.toLowerCase()}\u202F: ${value} ha`,
    chartLabel: (province: string) => `${province}\u202F: forêt récoltée et forêt brûlée, 1985–2022, en hectares par période de cinq ans`,
    short: (label: string, years: number) => `* ${label} ne couvre que ${years} années\u202F; la série se termine en 2022.`,
    provinceUnknown: (province: string, hectares: string, reason: string) => `${province}\u202F: ${hectares} ha n’ont pas de données satellitaires, ${reason}. Aucune récolte ni aucun feu ne peut y être daté\u202F; ce territoire compte comme inconnu, jamais comme zéro.`,
    sources: "Sources et licence",
    forestLoss: "Perte forestière",
    harvestFire: "Récolte et feu",
    version: "Version",
    retrieved: "Date de consultation",
    online: "Cette page en ligne",
  },
} as const;

/**
 * The print chart's frame: the page chart's margins on a shorter plot, so it
 * fits a sheet that also carries the figure, limits and sources.
 */
const PRINT_SIZE = { ...SVG_SIZE, height: 200 } as const;

/** The province's chart in five-year steps, the Data page's default grouping, on its own scale. */
function provinceChart(series: HarvestFireSeries, record: PlacePageRecord): HarvestFireChartModel | null {
  const province = series.provinces.find((entry) => entry.code === record.province);
  if (!province) return null;
  return harvestFireCharts(series, { provinces: [province.id], firstYear: series.firstYear, lastYear: series.lastYear, step: 5, scale: "own", view: "chart" })[0] ?? null;
}

function Fact({ label, value, locale }: Readonly<{ label: string; value: string; locale: Locale }>) {
  return <div className="riding-sheet-fact"><dt>{label}{colon(locale)}</dt><dd>{value}</dd></div>;
}

export function RidingSheet({ locale, record }: Readonly<{ locale: Locale; record: PlacePageRecord }>) {
  const text = COPY[locale];
  const page = PAGE_COPY[locale];
  const card = RECEIPT_COPY[locale];
  const summary = placeSummary(record, locale);
  const { figures } = summary;
  const provenance = landCoverProvenance(locale);
  const series = HARVEST_FIRE_SERIES;
  const chart = series ? provinceChart(series, record) : null;
  const short = chart?.bins.find((bin) => bin.short);
  const codeLabel = page.code[record.kind === "federal-riding" ? "federal" : "provincial"];
  const pageUrl = `${SITE_ORIGIN}${summary.path}`;

  return (
    <main id="main" className="riding-sheet">
      <div className="riding-sheet-toolbar">
        <a href={summary.path}>{text.back}</a>
        <PrintButton label={text.print} />
        <p>{text.hint}</p>
      </div>

      <article className="riding-sheet-page" data-theme="light">
        <header className="riding-sheet-head">
          <p className="riding-sheet-brand">{PRODUCT_NAME[locale]} · {record.typeLabel[locale]} · {summary.province}</p>
          <h1>{summary.name}</h1>
          <dl className="riding-sheet-facts">
            <Fact label={codeLabel} value={record.code} locale={locale} />
            <Fact label={card.years} value={card.span} locale={locale} />
            <Fact label={card.edition} value={record.boundary.edition} locale={locale} />
            <Fact label={card.dataVersion} value={PLACE_DATA_VERSION} locale={locale} />
            <Fact label={card.evidence} value={EVIDENCE_DEFINITIONS[figures.lost.evidence].label[locale]} locale={locale} />
            <Fact label={text.online} value={pageUrl} locale={locale} />
          </dl>
        </header>

        <section className="riding-sheet-figure" aria-labelledby="riding-sheet-figure-title">
          <h2 id="riding-sheet-figure-title">{text.figureTitle}</h2>
          {figures.share.kind === "figure" ? (
            <p className="riding-sheet-value"><strong>{summary.share}</strong> {text.shareOf}</p>
          ) : (
            <p className="riding-sheet-value"><strong>– {text.shareUnknown}</strong> {figures.share.reason[locale]}</p>
          )}
          <dl className="riding-sheet-facts riding-sheet-facts--figure">
            <Fact
              label={summary.lostLabel}
              value={figures.lost.kind === "figure" ? summary.lost : `– ${summary.lost}. ${figures.lost.reason[locale]}`}
              locale={locale}
            />
            <Fact label={page.mappedForest} value={formatHectares(figures.knownForestHectares, locale)} locale={locale} />
            <Fact label={page.unmapped} value={summary.unmapped} locale={locale} />
            <Fact label={page.coverage} value={summary.coverage} locale={locale} />
            <Fact label={page.confidence} value={figures.confidence.reason[locale]} locale={locale} />
          </dl>
          {figures.lostIsMinimum ? <p className="riding-sheet-note">{card.minimum}</p> : null}
        </section>

        {series && chart ? (
          <section className="riding-sheet-province" aria-labelledby="riding-sheet-province-title">
            <h2 id="riding-sheet-province-title">{text.provinceTitle(chart.province.name[locale])}</h2>
            <p className="riding-sheet-note">{text.provinceNote} {series.measure[locale]}</p>
            <p className="riding-sheet-note"><span>{text.subtitle}.</span>{" "}
              <span className="riding-sheet-key"><span className="hf-swatch hf-swatch--harvest" aria-hidden="true" />{text.harvestKey}</span>{" "}
              <span className="riding-sheet-key"><span className="hf-swatch hf-swatch--fire" aria-hidden="true" />{text.fireKey}</span>
            </p>
            <div className="hf-chart-scroll riding-sheet-chart" tabIndex={0} role="region" aria-label={text.chartLabel(chart.province.name[locale])}>
              <HarvestFireChartSvg
                chart={chart}
                locale={locale}
                label={text.chartLabel(chart.province.name[locale])}
                words={{ harvest: text.harvest, fire: text.fire, xAxis: text.xAxis, yAxis: text.yAxis, tooltip: text.tooltip }}
                size={PRINT_SIZE}
              />
            </div>
            <p className="riding-sheet-note">
              {short ? `${text.short(binLabel(short, locale), short.lastYear - short.firstYear + 1)} ` : ""}
              {text.provinceUnknown(chart.province.name[locale], formatNumber(cellsToHectares(chart.province.unknownCells), locale, 0), UNMAPPED_REASONS[chart.province.id][locale])}
            </p>
          </section>
        ) : null}

        <section className="riding-sheet-limits" aria-labelledby="riding-sheet-limits-title">
          <h2 id="riding-sheet-limits-title">{page.limits}</h2>
          <ul>{page.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </section>

        <section className="riding-sheet-sources" aria-labelledby="riding-sheet-sources-title">
          <h2 id="riding-sheet-sources-title">{text.sources}</h2>
          <p>
            <strong>{text.forestLoss}{colon(locale)}</strong> {provenance.dataset}. {text.version}{colon(locale)} {provenance.version}. {text.retrieved}{colon(locale)} {provenance.retrievedDate}. {provenance.recordUrl}
          </p>
          <p>
            <strong>{page.boundary}{colon(locale)}</strong> {record.boundary.title[locale]} ({record.boundary.edition}). {page.method}{colon(locale)} {PLACE_METHOD_VERSION}. {page.recordFile}{colon(locale)} {record.record}
          </p>
          {series ? (
            <p>
              <strong>{text.harvestFire}{colon(locale)}</strong> {series.sources.harvest.title}, {series.sources.harvest.url}. {series.sources.fire.title}, {series.sources.fire.url}. {series.sources.citation}
            </p>
          ) : null}
          <p>{card.licence} {series ? series.sources.attribution[locale] : null}</p>
        </section>

        <footer className="riding-sheet-cite">
          <h2>{page.citation}</h2>
          <p>{summary.citation}</p>
          <p className="riding-sheet-note">{card.preview}</p>
        </footer>
      </article>
    </main>
  );
}

/** A print copy of the riding's page: not indexed, so search sends readers to the page itself. */
export function ridingSheetMetadata(locale: Locale, record: PlacePageRecord): Metadata {
  const title = `${record.name[locale]} (${record.typeLabel[locale]}) · ${COPY[locale].print}`;
  return {
    title,
    robots: { index: false, follow: true },
    alternates: localizedAlternates(locale, {
      en: ridingSheetPath("en", record.geography, record.code),
      fr: ridingSheetPath("fr", record.geography, record.code),
    }),
  };
}
