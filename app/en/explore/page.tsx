import type { Metadata } from "next";
import Link from "next/link";
import { ExploreView, ShapeMeasureClient } from "@/components/explore";
import { FederalDistrictFinder } from "@/components/search";
import { SiteShell } from "@/components/site";
import { federalRidingComparison } from "@/lib/comparison";
import {
  exploreFixtures,
  EXPLORE_MODES,
  parseBoundaryOverlays,
  parseExploreInterval,
  parseExploreYear,
} from "@/lib/explore";
// Imported by path rather than through the barrel: this module carries every
// span for every district and must never be pulled into a browser bundle.
import { ridingIntervalMeasurements } from "@/lib/explore/riding-intervals";
import { coarseGridAvailable } from "@/lib/shapes/runtime";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "Explore",
  alternates: localizedAlternates("en", { en: "/en/explore", fr: "/fr/explorer" }),
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    presentation?: string;
    data?: string;
    year?: string;
    from?: string;
    overlays?: string;
    district?: string;
  }>;
}) {
  const query = await searchParams;
  const shapeMeasurement = await coarseGridAvailable();
  const mode = EXPLORE_MODES.includes(
    query.mode as (typeof EXPLORE_MODES)[number],
  )
    ? (query.mode as (typeof EXPLORE_MODES)[number])
    : "forest-change";
  const presentation = query.presentation === "list" ? "list" : "map";
  const year = parseExploreYear(query.year);
  // The span, not just its closing year. A URL that names only `year` still
  // means the annual interval ending there, which is what it has always meant.
  const interval = parseExploreInterval(query.from, String(year));
  const overlays = parseBoundaryOverlays(query.overlays);
  return (
    <SiteShell locale="en">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>Explore forest loss</h1>
          <p className="masthead-note">Release scope, downloads and limitations are indexed in <Link href="/en/releases">Data releases</Link>.</p>
        </header>
        <ExploreView
          events={exploreFixtures}
          locale="en"
          mode={mode}
          presentation={presentation}
          data={query.data === "table" ? "table" : "chart"}
          year={interval.toYear}
          fromYear={interval.fromYear}
          overlays={overlays}
          ridingMeasurements={ridingIntervalMeasurements(interval)}
        />
        {shapeMeasurement ? <ShapeMeasureClient locale="en" /> : null}
        <FederalDistrictFinder
          locale="en"
          query={query.district ?? ""}
          rows={federalRidingComparison.places}
          parameters={[
            { name: "mode", value: mode },
            { name: "presentation", value: presentation },
            { name: "data", value: query.data === "table" ? "table" : "chart" },
            { name: "year", value: String(interval.toYear) },
            ...(interval.fromYear !== interval.toYear - 1
              ? [{ name: "from", value: String(interval.fromYear) }]
              : []),
            ...(overlays.length > 0 ? [{ name: "overlays", value: overlays.join(",") }] : []),
          ]}
        />
      </main>
    </SiteShell>
  );
}
