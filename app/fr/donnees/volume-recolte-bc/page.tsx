import type { Metadata } from "next";
import indicator from "@/data/bc-timber-harvest-aac-indicator.json";
import { BcHarvestVolumeIndicator } from "@/components/transparency/BcHarvestVolumeIndicator";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Volume récolté et possibilité annuelle de coupe en C.-B.", alternates: localizedAlternates("fr", { en: "/en/data/bc-harvest-volume", fr: "/fr/donnees/volume-recolte-bc" }) };

export default async function FrenchBcHarvestVolumePage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap"><BcHarvestVolumeIndicator rows={indicator.rows} locale="fr" /></main></SiteShell>;
}
