import { RankedRidingsTable, SideBySideComparison } from "@/components/comparison";
import { comparisonContext, comparisonFixtures, rankedRidingFixtures } from "@/lib/comparison";
import { SiteShell } from "@/components/site";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Riding comparison", alternates: { languages: { en: "/en/compare", fr: "/fr/comparer" } } };
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) { const view = (await searchParams).view === "table" ? "table" : "cards"; return <SiteShell locale="en"><main id="main" className="page-wrap"><h1>Riding comparison</h1><RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" /><SideBySideComparison places={comparisonFixtures} locale="en" view={view} /></main></SiteShell>; }
