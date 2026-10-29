import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { UNKNOWN_ATLAS_ROUTES, UNKNOWN_ATLAS_TITLE, UnknownAtlasPage } from "@/components/transparency/UnknownAtlasPage";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: UNKNOWN_ATLAS_TITLE.en, alternates: localizedAlternates("en", UNKNOWN_ATLAS_ROUTES) };

export default function EnglishUnknownAtlasPage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap"><UnknownAtlasPage locale="en" /></main></SiteShell>;
}
