import type { Metadata } from "next";
import release from "@/data/nfd-provincial-volume-wood-supply.json";
import { ProvincialHarvestVolume, type ProvincialVolumeRow } from "@/components/transparency/ProvincialHarvestVolume";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Volume récolté et possibilité de coupe en Alberta, en Ontario et au Québec", alternates: localizedAlternates("fr", { en: "/en/data/provincial-harvest-volume", fr: "/fr/donnees/volume-recolte-provinces" }) };

export default function FrenchProvincialHarvestVolumePage() {
  return <SiteShell locale="fr"><main id="main" className="page-wrap"><ProvincialHarvestVolume rows={release.rows as readonly ProvincialVolumeRow[]} locale="fr" /></main></SiteShell>;
}
