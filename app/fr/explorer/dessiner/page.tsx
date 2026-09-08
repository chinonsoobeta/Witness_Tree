import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { DrawPage } from "@/components/explore/DrawPage";
import { coarseGridAvailable } from "@/lib/shapes/runtime";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "Dessiner et mesurer",
  alternates: localizedAlternates("fr", { en: "/en/explore/draw", fr: "/fr/explorer/dessiner" }),
};

export default async function Page() {
  const available = await coarseGridAvailable();
  return <SiteShell locale="fr"><main id="main"><DrawPage locale="fr" available={available} /></main></SiteShell>;
}
