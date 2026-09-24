import type { Metadata } from "next";
import { ComponentGallery } from "@/components/gallery";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "How figures are marked", alternates: localizedAlternates("en", { en: "/en/components", fr: "/fr/composants" }) };

export default function EnglishComponentsPage() {
  return <SiteShell locale="en"><ComponentGallery locale="en" /></SiteShell>;
}
