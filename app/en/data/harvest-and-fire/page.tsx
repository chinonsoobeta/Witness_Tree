import type { Metadata } from "next";
import { HarvestFirePage } from "@/components/transparency/HarvestFirePage";
import { SiteShell } from "@/components/site";
import { HARVEST_FIRE_ROUTES, parseHarvestFireQuery } from "@/lib/harvest-fire";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Harvest and fire by province", alternates: localizedAlternates("en", HARVEST_FIRE_ROUTES) };

export default async function EnglishHarvestFirePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Checkboxes repeat their name, so a list arrives as an array.
  const query = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]));
  return <SiteShell locale="en"><main id="main" className="page-wrap"><HarvestFirePage locale="en" query={parseHarvestFireQuery(query)} /></main></SiteShell>;
}
