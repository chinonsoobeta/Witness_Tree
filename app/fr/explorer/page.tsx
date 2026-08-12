import type { Metadata } from "next";
import { ExploreMapClient, ExploreView } from "@/components/explore";
import { SiteShell } from "@/components/site";
import { exploreFixtures, EXPLORE_MODES } from "@/lib/explore";

export const metadata: Metadata = { title: "Explorer", alternates: { languages: { en: "/en/explore", fr: "/fr/explorer" } } };

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string; presentation?: string; data?: string }> }) {
  const query = await searchParams;
  const mode = EXPLORE_MODES.includes(query.mode as typeof EXPLORE_MODES[number]) ? query.mode as typeof EXPLORE_MODES[number] : "forest-change";
  const presentation = query.presentation === "list" ? "list" : "map";
  const events = exploreFixtures.filter((event) => event.mode === mode);
  return <SiteShell locale="fr"><main id="main" className="page-wrap"><h1>Explorer les changements forestiers</h1>{presentation === "map" ? <ExploreMapClient events={events} locale="fr" /> : null}<ExploreView events={exploreFixtures} locale="fr" mode={mode} presentation={presentation} data={query.data === "table" ? "table" : "chart"} /></main></SiteShell>;
}
