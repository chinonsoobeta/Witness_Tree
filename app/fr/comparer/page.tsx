import { CoverageStatement } from "@/components/policy/CoverageStatement";
import type { Metadata } from "next";
import {
  ComparisonPrompt,
  ComparisonRankings,
  FederalRidingPicker,
  nothingChosen,
  selectComparedRidings,
  SideBySideComparison,
} from "@/components/comparison";
import {
  comparableRidings,
  federalRidingComparison,
  parseRankingSort,
  parseRankingTab,
} from "@/lib/comparison";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

const TITRE = "Comparaison des circonscriptions";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/compare", fr: "/fr/comparer" });

export default async function ComparerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; left?: string; right?: string; rankings?: string; rank?: string }>;
}) {
  const parameters = await searchParams;
  const view = parameters.view === "table" ? "table" : "cards";
  const sort = parseRankingSort(parameters.sort);
  const allRankings = parameters.rankings === "all";
  const selected = selectComparedRidings(comparableRidings, parameters.left, parameters.right, {
    outside: federalRidingComparison.outside,
  });
  const leftId = selected.left?.id;
  const rightId = selected.right?.id;
  const rank = parseRankingTab(parameters.rank, [selected.left, selected.right]);
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITRE}</h1>
          <p className="masthead-note">Chiffres pour 1984–2022, pour la partie cartographiée de chaque circonscription. Choisissez deux circonscriptions des quatre provinces, fédérales ou provinciales.</p>
        </header>
        <CoverageStatement locale="fr"><p>Avant de comparer deux circonscriptions, vérifiez quelle part de chacune a été cartographiée{" "}: une perte plus faible peut simplement signifier qu’une plus petite partie a été cartographiée. Les circonscriptions sans données complètes sont exclues du classement plutôt que comptées comme zéro, et chaque part porte seulement sur la forêt cartographiée.</p></CoverageStatement>
        <FederalRidingPicker
          rows={comparableRidings}
          locale="fr"
          leftId={leftId ?? null}
          rightId={rightId ?? null}
          view={view}
          sort={sort}
          allRankings={allRankings}
          notices={selected.notices}
          rank={parameters.rank === rank ? rank : undefined}
        />
        {nothingChosen(selected) ? <ComparisonPrompt locale="fr" /> : (
          <SideBySideComparison
            places={[selected.left, selected.right]}
            locale="fr"
            view={view}
            leftId={leftId}
            rightId={rightId}
            sort={sort}
            allRankings={allRankings}
          />
        )}
        <ComparisonRankings
          tab={rank}
          places={[selected.left, selected.right]}
          locale="fr"
          sort={sort}
          leftId={leftId}
          rightId={rightId}
          view={view}
          allRankings={allRankings}
        />
      </main>
    </SiteShell>
  );
}
