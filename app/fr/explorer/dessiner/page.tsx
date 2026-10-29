import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { DrawPage } from "@/components/explore/DrawPage";
import { addressLookupConfigured } from "@/lib/address/runtime";
import { districtIndexAvailable } from "@/lib/districts/runtime";
import { parseCircleQuery } from "@/lib/shapes/circle";
import { coarseGridAvailable } from "@/lib/shapes/runtime";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/explore/draw", fr: "/fr/explorer/dessiner" });

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<{ shape?: string; lat?: string; lon?: string; r?: string }> }>) {
  const [query, available, addressLookup, districtLookup] = await Promise.all([
    searchParams,
    coarseGridAvailable(),
    addressLookupConfigured(),
    districtIndexAvailable(),
  ]);
  return <SiteShell locale="fr"><main id="main"><DrawPage
    locale="fr"
    available={available}
    initialCircle={parseCircleQuery(query)}
    addressLookup={addressLookup}
    districtLookup={districtLookup}
  /></main></SiteShell>;
}
