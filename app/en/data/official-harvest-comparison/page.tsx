import type { Metadata } from "next";
import comparison from "@/data/phase2-official-published-harvest-comparison.json";
import { OfficialPublishedHarvestComparison } from "@/components/transparency/OfficialPublishedHarvestComparison";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Official-source harvest comparison", alternates: localizedAlternates("en", { en: "/en/data/official-harvest-comparison", fr: "/fr/donnees/comparaison-recolte-officielle" }) };

export default async function EnglishOfficialHarvestComparisonPage({ searchParams }: { searchParams: Promise<{ province?: string }> }) {
  const query = await searchParams;
  return <SiteShell locale="en"><OfficialPublishedHarvestComparison rows={comparison.rows} locale="en" province={query.province} /></SiteShell>;
}
