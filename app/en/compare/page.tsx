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

const TITLE = "Riding comparison";

export const metadata: Metadata = {
  title: TITLE,
  alternates: { languages: { en: "/en/compare", fr: "/fr/comparer" } },
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view === "table" ? "table" : "cards";
  return (
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITLE}</h1>
        </header>
        <RankedRidingsTable
          rows={rankedRidingFixtures}
          context={comparisonContext}
          locale="en"
        />
        <SideBySideComparison
          places={comparisonFixtures}
          context={comparisonContext}
          locale="en"
          view={view}
        />
      </main>
    </SiteShell>
  );
}
