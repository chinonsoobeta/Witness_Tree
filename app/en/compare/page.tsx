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

const TITLE = "Riding comparison";

export const metadata: Metadata = routeMetadata("en", { en: "/en/compare", fr: "/fr/comparer" });

export default async function ComparePage({
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
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITLE}</h1>
          <p className="masthead-note">Figures for 1984–2022, for the mapped part of each riding. Choose any two ridings in the four provinces, federal or provincial.</p>
        </header>
        <CoverageStatement locale="en"><p>Before comparing two ridings, check how much of each was mapped: a smaller loss can just mean less was mapped. Ridings without full data are left out of the ranking rather than counted as zero, and every share is of mapped forest only.</p></CoverageStatement>
        <FederalRidingPicker
          rows={comparableRidings}
          locale="en"
          leftId={leftId ?? null}
          rightId={rightId ?? null}
          view={view}
          sort={sort}
          allRankings={allRankings}
          notices={selected.notices}
          rank={parameters.rank === rank ? rank : undefined}
        />
        {nothingChosen(selected) ? <ComparisonPrompt locale="en" /> : (
          <SideBySideComparison
            places={[selected.left, selected.right]}
            locale="en"
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
          locale="en"
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
