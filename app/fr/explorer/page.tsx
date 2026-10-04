import type { Metadata } from "next";
import Link from "next/link";
import { provincialCauseByInterval } from "@/lib/phase4/provincial-cause";
import { ExploreView } from "@/components/explore";
import { SiteShell } from "@/components/site";
import {
  exploreFixtures,
  EXPLORE_MODES,
  parseBoundaryOverlays,
  parseExploreInterval,
  parseExploreYear,
} from "@/lib/explore";
// Imported by path rather than through the barrel: this module carries every
// span for every district and must never be pulled into a browser bundle.
// The same holds for the economic-region table.
import { forestRegionFigures, regionIntervalMeasurements } from "@/lib/explore/region-intervals";
import { ridingIntervalMeasurements } from "@/lib/explore/riding-intervals";
import { conditionRecoveryView } from "@/lib/explore/condition-recovery";
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
    from?: string;
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
  const year = parseExploreYear(query.year);
  // The span, not just its closing year. A URL that names only `year` still
  // means the annual interval ending there, which is what it has always meant.
  const interval = parseExploreInterval(query.from, String(year));
  const overlays = parseBoundaryOverlays(query.overlays);
  return (
    <SiteShell locale="fr">
      <main id="main" className="page-wrap">
        <header className="masthead">
          <h1>Explorer les pertes forestières</h1>
          <p className="masthead-note">Les téléchargements, les sources et les limites se trouvent sur la page <Link href="/fr/donnees">Données</Link>.</p>
        </header>
        <ExploreView
          events={exploreFixtures}
          locale="fr"
          mode={mode}
          data={query.data === "table" ? "table" : "chart"}
          year={interval.toYear}
          fromYear={interval.fromYear}
          overlays={overlays}
          ridingMeasurements={[...ridingIntervalMeasurements(interval), ...regionIntervalMeasurements(interval)]}
          forestRegions={forestRegionFigures(interval)}
          provincialCause={provincialCauseByInterval()}
          conditionRecovery={mode === "condition-recovery" ? conditionRecoveryView() : null}
        />
      </main>
    </SiteShell>
  );
}
