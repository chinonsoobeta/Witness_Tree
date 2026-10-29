import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { UNKNOWN_ATLAS_ROUTES, UnknownAtlasPage } from "@/components/transparency/UnknownAtlasPage";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", UNKNOWN_ATLAS_ROUTES);

export default function FrenchInconnuPage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap"><UnknownAtlasPage locale="fr" /></main></SiteShell>;
}
