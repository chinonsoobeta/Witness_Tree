import { CoverageStatement } from "@/components/policy/CoverageStatement";
import type { Metadata } from "next";
import {
  FederalRidingPicker,
  RankedRidingsTable,
  selectComparedRidings,
  SideBySideComparison,
} from "@/components/comparison";
import {
  comparableRidings,
  comparisonRankings,
  federalRidingComparison,
  parseRankingSort,
  RANKING_PREVIEW_ROWS,
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
  searchParams: Promise<{ view?: string; sort?: string; left?: string; right?: string; rankings?: string }>;
}) {
  const parameters = await searchParams;
  const view = parameters.view === "table" ? "table" : "cards";
  const sort = parseRankingSort(parameters.sort);
  const allRankings = parameters.rankings === "all";
  const selected = selectComparedRidings(comparableRidings, parameters.left, parameters.right, {
    fallback: federalRidingComparison.defaultPair,
    outside: federalRidingComparison.rows,
  });
  const leftId = selected.left?.id;
  const rightId = selected.right?.id;
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITRE}</h1>
          <p className="masthead-note">Chiffres pour 2021–2022, pour la partie cartographiée de chaque circonscription. Choisissez deux circonscriptions des quatre provinces, fédérales ou provinciales.</p>
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
        />
        <SideBySideComparison
          places={[selected.left, selected.right]}
          locale="fr"
          view={view}
          leftId={leftId}
          rightId={rightId}
          sort={sort}
          allRankings={allRankings}
        />
        {comparisonRankings([selected.left, selected.right]).map((ranking) => (
          <RankedRidingsTable
            key={ranking.scope.level === "federal" ? "federal" : ranking.scope.province}
            rows={ranking.rows}
            context={ranking.context}
            scope={ranking.scope}
            locale="fr"
            sort={sort}
            leftId={leftId}
            rightId={rightId}
            view={view}
            limit={allRankings ? undefined : RANKING_PREVIEW_ROWS}
            allRankings={allRankings}
          />
        ))}
      </main>
    </SiteShell>
  );
}
