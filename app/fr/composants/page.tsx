import type { Metadata } from "next";
import { ComponentGallery } from "@/components/gallery";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Galerie de composants" };

export default function FrenchComponentsPage() {
  return <SiteShell locale="fr"><ComponentGallery locale="fr" /></SiteShell>;
}
