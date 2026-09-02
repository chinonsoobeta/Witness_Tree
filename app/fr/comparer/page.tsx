import type { Metadata } from "next";
import {
  FederalRidingPicker,
  RankedRidingsTable,
  selectFederalRidings,
  SideBySideComparison,
} from "@/components/comparison";
import {
  federalRidingComparison,
  parseRankingSort,
} from "@/lib/comparison";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

const TITRE = "Comparaison des circonscriptions";

export const metadata: Metadata = {
  title: TITRE,
  alternates: localizedAlternates("fr", { en: "/en/compare", fr: "/fr/comparer" }),
};

export default async function ComparerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; left?: string; right?: string }>;
}) {
  const parameters = await searchParams;
  const view = parameters.view === "table" ? "table" : "cards";
  const sort = parseRankingSort(parameters.sort);
  const leftId = parameters.left ?? federalRidingComparison.defaultPair[0].id;
  const rightId = parameters.right ?? federalRidingComparison.defaultPair[1].id;
  const selected = selectFederalRidings(
    federalRidingComparison.comparisonRows,
    leftId,
    rightId,
    federalRidingComparison.defaultPair,
  );
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITRE}</h1>
          <p className="masthead-note">Mesures corrigées selon l’étendue pour 2021–2022.</p>
        </header>
        <FederalRidingPicker
          rows={federalRidingComparison.comparisonRows}
          locale="fr"
          leftId={leftId}
          rightId={rightId}
          view={view}
          sort={sort}
          fallback={federalRidingComparison.defaultPair}
        />
        <SideBySideComparison
          places={[selected.left, selected.right]}
          locale="fr"
          view={view}
          leftId={selected.left.id}
          rightId={selected.right.id}
          sort={sort}
        />
        <RankedRidingsTable
          rows={federalRidingComparison.comparisonRows}
          context={federalRidingComparison.context}
          locale="fr"
          sort={sort}
          leftId={selected.left.id}
          rightId={selected.right.id}
          view={view}
        />
      </main>
    </SiteShell>
  );
}
