import { CoverageBand, EvidenceChip, ForestDefinitionLink } from "@/components/policy";
import { comparePlaces, type ComparisonPlace, type RankingContext } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

type Props = Readonly<{
  places: readonly ComparisonPlace[];
  context: RankingContext;
  locale: Locale;
  view?: "cards" | "table";
  acknowledgeBoundaryMismatch?: boolean;
}>;

export function SideBySideComparison({ places, context, locale, view = "cards", acknowledgeBoundaryMismatch = false }: Props) {
  const mismatch = places.length === 2 && (
    places[0]!.boundaryEdition !== places[1]!.boundaryEdition
    || places[0]!.boundaryApplication !== places[1]!.boundaryApplication
    || places.some((place) => place.boundaryEdition !== context.boundaryEdition || place.boundaryApplication !== context.boundaryApplication)
  );
  if (mismatch && !acknowledgeBoundaryMismatch) throw new Error("Cross-edition comparison requires an acknowledged boundary warning.");
  const [left, right] = comparePlaces(places, acknowledgeBoundaryMismatch);
  const labels = locale === "en" ? {
    title: "Side-by-side comparison", table: "View as table", cards: "View as cards", measure: "Measure",
    share: "Detected change share", change: "Detected change", forest: "Forested area", coverage: "Coverage",
    evidence: "Evidence", method: "Method",
    boundaryWarning: "Boundary editions differ. This comparison is shown only after explicit acknowledgement.",
  } : {
    title: "Comparaison côte à côte", table: "Afficher en tableau", cards: "Afficher en cartes", measure: "Mesure",
    share: "Part du changement détecté", change: "Changement détecté", forest: "Superficie forestière", coverage: "Couverture",
    evidence: "Élément de preuve", method: "Méthode",
    boundaryWarning: "Les éditions des limites diffèrent. Cette comparaison est affichée uniquement après une confirmation explicite.",
  };
  const warning = mismatch ? <p role="alert">{labels.boundaryWarning}</p> : null;
  const boundaryBasis = context.boundaryApplication === "period-contemporaneous"
    ? (locale === "en" ? "Boundary contemporaneous with the period" : "Limite contemporaine de la période")
    : (locale === "en" ? "Current boundary applied to historic events" : "Limite actuelle appliquée aux événements historiques");
  const methodNote = <p>{labels.method}: {context.method[locale]}</p>;

  if (view === "table") {
    return <section>
      <a href="?view=cards">{labels.cards}</a>
      {warning}
      <p>{context.boundaryEdition} · {boundaryBasis}</p>
      <table aria-label={labels.title}>
        <caption>{labels.title}</caption>
        <thead><tr><th scope="col">{labels.measure}</th><th scope="col">{left.name[locale]}</th><th scope="col">{right.name[locale]}</th></tr></thead>
        <tbody>
          <tr><th scope="row">{labels.share}</th><td><ForestDefinitionLink locale={locale}>{left.detectedChangePercent}%</ForestDefinitionLink></td><td><ForestDefinitionLink locale={locale}>{right.detectedChangePercent}%</ForestDefinitionLink></td></tr>
          <tr><th scope="row">{labels.change}</th><td>{left.detectedChangeHectares} ha</td><td>{right.detectedChangeHectares} ha</td></tr>
          <tr><th scope="row">{labels.forest}</th><td>{left.forestedHectares} ha</td><td>{right.forestedHectares} ha</td></tr>
          <tr><th scope="row">{labels.coverage}</th><td><CoverageBand coverageGrade={left.coverageGrade} locale={locale} /></td><td><CoverageBand coverageGrade={right.coverageGrade} locale={locale} /></td></tr>
          <tr><th scope="row">{labels.evidence}</th><td><EvidenceChip evidence={left.evidence} locale={locale} /></td><td><EvidenceChip evidence={right.evidence} locale={locale} /></td></tr>
        </tbody>
      </table>
      {methodNote}
    </section>;
  }

  return <section aria-label={labels.title}>
    <a href="?view=table">{labels.table}</a>
    {warning}
    <p>{context.boundaryEdition} · {boundaryBasis}</p>
    <Place place={left} locale={locale} />
    <Place place={right} locale={locale} />
    {methodNote}
  </section>;
}

function Place({ place, locale }: Readonly<{ place: ComparisonPlace; locale: Locale }>) {
  return <article>
    <h2>{place.name[locale]}</h2>
    <p><ForestDefinitionLink locale={locale}>{place.detectedChangePercent}%</ForestDefinitionLink> · {place.detectedChangeHectares} ha · {place.forestedHectares} ha</p>
    <CoverageBand coverageGrade={place.coverageGrade} locale={locale} />
    <EvidenceChip evidence={place.evidence} locale={locale} />
  </article>;
}
