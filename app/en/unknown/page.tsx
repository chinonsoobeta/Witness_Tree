import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { UNKNOWN_ATLAS_ROUTES, UnknownAtlasPage } from "@/components/transparency/UnknownAtlasPage";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", UNKNOWN_ATLAS_ROUTES);

export default function EnglishUnknownAtlasPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap"><UnknownAtlasPage locale="en" /></main></SiteShell>;
}
