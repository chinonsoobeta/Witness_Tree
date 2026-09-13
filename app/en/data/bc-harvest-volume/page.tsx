import type { Metadata } from "next";
import indicator from "@/data/bc-timber-harvest-aac-indicator.json";
import { BcHarvestVolumeIndicator } from "@/components/transparency/BcHarvestVolumeIndicator";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "BC harvest volume and allowable annual cut", alternates: localizedAlternates("en", { en: "/en/data/bc-harvest-volume", fr: "/fr/donnees/volume-recolte-bc" }) };

export default async function EnglishBcHarvestVolumePage() {
  return <SiteShell locale="en"><BcHarvestVolumeIndicator rows={indicator.rows} locale="en" /></SiteShell>;
}
