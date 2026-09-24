import type { Metadata } from "next";
import { ComponentGallery } from "@/components/gallery";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Comment les chiffres sont marqués", alternates: localizedAlternates("fr", { en: "/en/components", fr: "/fr/composants" }) };

export default function FrenchComponentsPage() {
  return <SiteShell locale="fr"><ComponentGallery locale="fr" /></SiteShell>;
}
