import type { Metadata } from "next";
import Link from "next/link";
import { ExploreView } from "@/components/explore";
import { FederalDistrictFinder } from "@/components/search";
import { SiteShell } from "@/components/site";
import { federalRidingComparison } from "@/lib/comparison";
import {
  exploreFixtures,
  EXPLORE_MODES,
  parseBoundaryOverlays,
  parseExploreYear,
  ridingMeasurements,
} from "@/lib/explore";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "Explorer",
  alternates: localizedAlternates("fr", { en: "/en/explore", fr: "/fr/explorer" }),
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    presentation?: string;
    data?: string;
    year?: string;
    overlays?: string;
    district?: string;
  }>;
}) {
  const query = await searchParams;
  const mode = EXPLORE_MODES.includes(
    query.mode as (typeof EXPLORE_MODES)[number],
  )
    ? (query.mode as (typeof EXPLORE_MODES)[number])
    : "forest-change";
  const presentation = query.presentation === "list" ? "list" : "map";
  const year = parseExploreYear(query.year);
  const overlays = parseBoundaryOverlays(query.overlays);
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>Explorer les pertes forestières</h1>
          <p className="masthead-note">La portée, les téléchargements et les limites des versions sont répertoriés dans <Link href="/fr/versions">Versions des données</Link>.</p>
        </header>
        <ExploreView
          events={exploreFixtures}
          locale="fr"
          mode={mode}
          presentation={presentation}
          data={query.data === "table" ? "table" : "chart"}
          year={year}
          overlays={overlays}
          ridingMeasurements={ridingMeasurements}
        />
        <FederalDistrictFinder
          locale="fr"
          query={query.district ?? ""}
          rows={federalRidingComparison.places}
          parameters={[
            { name: "mode", value: mode },
            { name: "presentation", value: presentation },
            { name: "data", value: query.data === "table" ? "table" : "chart" },
            { name: "year", value: String(year) },
            ...(overlays.length > 0 ? [{ name: "overlays", value: overlays.join(",") }] : []),
          ]}
        />
      </main>
    </SiteShell>
  );
}
