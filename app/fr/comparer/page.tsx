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

const TITRE = "Comparaison des circonscriptions";

export const metadata: Metadata = {
  title: TITRE,
  alternates: { languages: { en: "/en/compare", fr: "/fr/comparer" } },
};

export default async function ComparerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; left?: string; right?: string }>;
}) {
  const parameters = await searchParams;
  const view = parameters.view === "table" ? "table" : "cards";
  const sort = parseRankingSort(parameters.sort);
  const selected = selectFederalRidings(federalRidingComparison.places, parameters.left, parameters.right);
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITRE}</h1>
          <p className="masthead-note">Mesures locales corrigées selon l’étendue pour 2021–2022. Il ne s’agit pas d’une publication de production admise.</p>
        </header>
        <FederalRidingPicker
          rows={federalRidingComparison.places}
          locale="fr"
          leftId={selected.left.id}
          rightId={selected.right.id}
          view={view}
          sort={sort}
        />
        <RankedRidingsTable
          rows={federalRidingComparison.rows}
          context={federalRidingComparison.context}
          locale="fr"
          sort={sort}
          leftId={selected.left.id}
          rightId={selected.right.id}
          view={view}
        />
        <SideBySideComparison
          places={[selected.left, selected.right]}
          context={federalRidingComparison.context}
          locale="fr"
          view={view}
          leftId={selected.left.id}
          rightId={selected.right.id}
          sort={sort}
        />
      </main>
    </SiteShell>
  );
}
