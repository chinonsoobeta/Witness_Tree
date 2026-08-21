import type { Locale } from "@/lib/domain";
import type { AnnualSummary, PublicNumber } from "@/lib/places";
import { PublicNumberValue } from "./PublicNumberValue";

const numeric = (value: PublicNumber): number => value.kind === "figure" ? value.value : Number.NEGATIVE_INFINITY;

function AnnualTable({ rows, locale, title }: Readonly<{ rows: readonly AnnualSummary[]; locale: Locale; title: string }>) {
  return <table id="annual-table"><caption>{title}</caption><thead><tr><th scope="col">{locale === "en" ? "Year" : "Année"}</th><th scope="col">{locale === "en" ? "Hectares" : "Hectares"}</th><th scope="col">{locale === "en" ? "Event IDs" : "Identifiants d’événement"}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.eventIds.join(":")}><td><PublicNumberValue value={row.year} locale={locale} /></td><td><PublicNumberValue value={row.hectares} locale={locale} /></td><td>{row.eventIds.join(", ")}</td></tr>)}</tbody></table>;
}

export function AnnualChangeChart({ annual, locale, view }: Readonly<{ annual: readonly AnnualSummary[]; locale: Locale; view: "chart" | "table" }>) {
  const rows = [...annual].sort((a, b) => numeric(a.year) - numeric(b.year));
  const max = Math.max(...rows.map((row) => Math.max(numeric(row.hectares), 0)), 1);
  const title = locale === "en" ? "Annual change" : "Changement annuel";
  if (view === "table") return <section><h2>{title}</h2><AnnualTable rows={rows} locale={locale} title={title} /></section>;
  return <section><h2>{title}</h2><svg aria-hidden="true" viewBox="0 0 300 120" width="100%"><title>{title}</title>{rows.map((row, index) => {
    const height = Math.max(numeric(row.hectares), 0) / max * 90;
    return <rect key={row.eventIds.join(":")} x={30 + index * 120} y={110 - height} width="48" height={height} />;
  })}</svg><p>{locale === "en" ? "All chart figures and their lineage are provided in the table below." : "Toutes les valeurs du graphique et leur filiation figurent dans le tableau ci-dessous."}</p><AnnualTable rows={rows} locale={locale} title={title} /></section>;
}
