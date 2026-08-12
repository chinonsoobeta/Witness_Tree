import { RankedRidingsTable, SideBySideComparison } from "@/components/comparison";
import { comparisonContext, comparisonFixtures, rankedRidingFixtures } from "@/lib/comparison";
import { SiteShell } from "@/components/site";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Comparaison des circonscriptions", alternates: { languages: { en: "/en/compare", fr: "/fr/comparer" } } };
export default async function ComparerPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) { const view = (await searchParams).view === "table" ? "table" : "cards"; return <SiteShell locale="fr"><main id="main" className="page-wrap"><h1>Comparaison des circonscriptions</h1><RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="fr" /><SideBySideComparison places={comparisonFixtures} locale="fr" view={view} /></main></SiteShell>; }
