import type { Locale } from "@/lib/domain";
import type { AnnualSummary } from "@/lib/places";

export function AnnualChangeChart({ annual, locale, view }: Readonly<{ annual: readonly AnnualSummary[]; locale: Locale; view: "chart" | "table" }>) {
  const rows = [...annual].sort((a, b) => a.year - b.year);
  const max = Math.max(...rows.map((row) => row.hectares), 1);
  const title = locale === "en" ? "Annual change" : "Changement annuel";
  if (view === "table") return <section><h2>{title}</h2><table><caption>{title}</caption><thead><tr><th scope="col">{locale === "en" ? "Year" : "Année"}</th><th scope="col">{locale === "en" ? "Hectares" : "Hectares"}</th><th scope="col">{locale === "en" ? "Event IDs" : "Identifiants d’événement"}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.year}><td>{row.year}</td><td>{row.hectares}</td><td>{row.eventIds.join(", ")}</td></tr>)}</tbody></table></section>;
  return <section><h2>{title}</h2><svg role="img" aria-label={title} viewBox="0 0 300 140" width="100%"><title>{title}</title>{rows.map((row, index) => <g key={row.year}><rect x={30 + index * 120} y={120 - (row.hectares / max) * 90} width="48" height={(row.hectares / max) * 90} /><text x={30 + index * 120} y="135">{row.year}</text><text x={30 + index * 120} y={110 - (row.hectares / max) * 90}>{row.hectares}</text></g>)}</svg><p><a href="?view=table">{locale === "en" ? "View table equivalent" : "Voir l’équivalent sous forme de tableau"}</a></p></section>;
}
