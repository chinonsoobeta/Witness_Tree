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

const TITLE = "Riding comparison";

export const metadata: Metadata = {
  title: TITLE,
  alternates: localizedAlternates("en", { en: "/en/compare", fr: "/fr/comparer" }),
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string; left?: string; right?: string }>;
}) {
  const parameters = await searchParams;
  const view = parameters.view === "table" ? "table" : "cards";
  const sort = parseRankingSort(parameters.sort);
  const selected = selectFederalRidings(federalRidingComparison.places, parameters.left, parameters.right);
  return (
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>{TITLE}</h1>
          <p className="masthead-note">Local 2021–2022 extent-corrected measurements. This is not an admitted or published production release.</p>
        </header>
        <FederalRidingPicker
          rows={federalRidingComparison.places}
          locale="en"
          leftId={parameters.left}
          rightId={parameters.right}
          view={view}
          sort={sort}
        />
        <SideBySideComparison
          places={[selected.left, selected.right]}
          context={federalRidingComparison.context}
          locale="en"
          view={view}
          leftId={selected.left.id}
          rightId={selected.right.id}
          sort={sort}
        />
        <RankedRidingsTable
          rows={federalRidingComparison.rows}
          context={federalRidingComparison.context}
          locale="en"
          sort={sort}
          leftId={selected.left.id}
          rightId={selected.right.id}
          view={view}
        />
      </main>
    </SiteShell>
  );
}
