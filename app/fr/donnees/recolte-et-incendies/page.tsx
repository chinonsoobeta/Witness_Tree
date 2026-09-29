import type { Metadata } from "next";
import { HarvestFirePage } from "@/components/transparency/HarvestFirePage";
import { SiteShell } from "@/components/site";
import { HARVEST_FIRE_ROUTES, parseHarvestFireQuery } from "@/lib/harvest-fire";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Récolte et feu par province", alternates: localizedAlternates("fr", HARVEST_FIRE_ROUTES) };

export default async function FrenchHarvestFirePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Les cases à cocher répètent leur nom : une liste arrive sous forme de tableau.
  const query = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]));
  return <SiteShell locale="fr"><main id="main" className="page-wrap"><HarvestFirePage locale="fr" query={parseHarvestFireQuery(query)} /></main></SiteShell>;
}
