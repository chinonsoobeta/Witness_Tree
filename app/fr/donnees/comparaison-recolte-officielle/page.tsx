import type { Metadata } from "next";
import comparison from "@/data/phase2-official-published-harvest-comparison.json";
import { OfficialPublishedHarvestComparison } from "@/components/transparency/OfficialPublishedHarvestComparison";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Comparaison avec une source officielle sur la récolte", alternates: { languages: { en: "/en/data/official-harvest-comparison", fr: "/fr/donnees/comparaison-recolte-officielle" } } };

export default async function FrenchOfficialHarvestComparisonPage({ searchParams }: { searchParams: Promise<{ province?: string }> }) {
  const query = await searchParams;
  return <SiteShell locale="fr"><OfficialPublishedHarvestComparison rows={comparison.rows} locale="fr" province={query.province} /></SiteShell>;
}
