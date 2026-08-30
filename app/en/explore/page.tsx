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

export const metadata: Metadata = {
  title: "Explore",
  alternates: { languages: { en: "/en/explore", fr: "/fr/explorer" } },
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
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>Explore forest change</h1>
          <p className="masthead-note">Release scope, downloads and limitations are indexed in <Link href="/en/releases">Data releases</Link>.</p>
        </header>
        <ExploreView
          events={exploreFixtures}
          locale="en"
          mode={mode}
          presentation={presentation}
          data={query.data === "table" ? "table" : "chart"}
          year={year}
          overlays={overlays}
          ridingMeasurements={ridingMeasurements}
        />
        <FederalDistrictFinder
          locale="en"
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
