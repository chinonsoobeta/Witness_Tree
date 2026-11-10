import { CitiesMostLost } from "@/components/site/RidingsMostLost";
import {
  RANKING_PREVIEW_ROWS,
  RANKING_TABS,
  ridingRankingsForTab,
  type ComparisonPlace,
  type RankingSort,
  type RankingTab,
} from "@/lib/comparison";
import type { Locale } from "@/lib/domain";
import { KeepRankInLinks } from "./KeepRankInLinks";
import { RankedRidingsTable } from "./RankedRidingsTable";

const COPY = {
  en: {
    label: "Rankings",
    tabs: { federal: "Federal ridings", provincial: "Provincial ridings", cities: "Cities" },
  },
  // Draft French for the owner's review (2026-11-10).
  fr: {
    label: "Classements",
    tabs: { federal: "Circonscriptions fédérales", provincial: "Circonscriptions provinciales", cities: "Villes" },
  },
} as const;

/**
 * Compare's rankings, one tab at a time, chosen by `rank=federal|provincial|cities`
 * and anchored at `#rankings`; the home page links straight to a tab. The
 * riding tabs are Compare's own ranking tables, unchanged, the provincial one
 * narrowed to the chosen ridings' provinces when there are any; the cities tab
 * is the ranking the home page showed, with the same rules for which cities
 * qualify.
 */
export function ComparisonRankings({
  tab,
  places,
  locale,
  sort,
  leftId,
  rightId,
  view,
  allRankings,
}: Readonly<{
  tab: RankingTab;
  /** The chosen ridings, which narrow the provincial tab to their provinces. */
  places: readonly (ComparisonPlace | null)[];
  locale: Locale;
  sort: RankingSort;
  leftId?: string;
  rightId?: string;
  view: "cards" | "table";
  allRankings: boolean;
}>) {
  const copy = COPY[locale];
  const href = (next: RankingTab) => {
    const query = new URLSearchParams();
    if (leftId) query.set("left", leftId);
    if (rightId) query.set("right", rightId);
    if (view === "table") query.set("view", view);
    if (sort !== "share-desc") query.set("sort", sort);
    if (allRankings) query.set("rankings", "all");
    query.set("rank", next);
    return `?${query.toString()}#rankings`;
  };
  return (
    <section className="comparison-rankings" id="rankings" aria-label={copy.label}>
      <nav className="segment comparison-rank-tabs" aria-label={copy.label}>
        {RANKING_TABS.map((option) => (
          <a key={option} className="segment-option" href={href(option)} aria-current={option === tab ? "page" : undefined}>
            {copy.tabs[option]}
          </a>
        ))}
      </nav>
      {tab === "cities" ? <CitiesMostLost locale={locale} /> : ridingRankingsForTab(tab, places).map((ranking) => (
        <RankedRidingsTable
          key={ranking.scope.level === "federal" ? "federal" : ranking.scope.province}
          rows={ranking.rows}
          context={ranking.context}
          scope={ranking.scope}
          locale={locale}
          sort={sort}
          leftId={leftId}
          rightId={rightId}
          view={view}
          limit={allRankings ? undefined : RANKING_PREVIEW_ROWS}
          allRankings={allRankings}
        />
      ))}
      <KeepRankInLinks rank={tab} />
    </section>
  );
}
