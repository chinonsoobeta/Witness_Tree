import type { Metadata } from "next";
import {
  RankedRidingsTable,
  SideBySideComparison,
} from "@/components/comparison";
import {
  comparisonContext,
  comparisonFixtures,
  rankedRidingFixtures,
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
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view === "table" ? "table" : "cards";
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITRE}</h1>
        </header>
        <RankedRidingsTable
          rows={rankedRidingFixtures}
          context={comparisonContext}
          locale="fr"
        />
        <SideBySideComparison
          places={comparisonFixtures}
          context={comparisonContext}
          locale="fr"
          view={view}
        />
      </main>
    </SiteShell>
  );
}
