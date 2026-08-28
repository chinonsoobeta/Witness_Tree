import type { Metadata } from "next";
import { ExploreMapClient, ExploreView } from "@/components/explore";
import { SiteShell } from "@/components/site";
import { exploreFixtures, EXPLORE_MODES, fixturesThroughYear, parseExploreYear } from "@/lib/explore";

export const metadata: Metadata = { title: "Explore", alternates: { languages: { en: "/en/explore", fr: "/fr/explorer" } } };

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string; presentation?: string; data?: string; year?: string }> }) {
  const query = await searchParams;
  const mode = EXPLORE_MODES.includes(query.mode as typeof EXPLORE_MODES[number]) ? query.mode as typeof EXPLORE_MODES[number] : "forest-change";
  const presentation = query.presentation === "list" ? "list" : "map";
  const year = parseExploreYear(query.year);
  const events = fixturesThroughYear(exploreFixtures, year);
  return <SiteShell locale="en"><main id="main" className="page-wrap"><h1>Explore forest change</h1>{presentation === "map" ? <ExploreMapClient locale="en" mode={mode} year={year} /> : null}<ExploreView events={events} locale="en" mode={mode} presentation={presentation} data={query.data === "table" ? "table" : "chart"} year={year} /></main></SiteShell>;
}
