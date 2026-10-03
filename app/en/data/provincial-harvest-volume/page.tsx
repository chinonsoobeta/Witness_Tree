import type { Metadata } from "next";
import release from "@/data/nfd-provincial-volume-wood-supply.json";
import { ProvincialHarvestVolume, type ProvincialVolumeRow } from "@/components/transparency/ProvincialHarvestVolume";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Alberta, Ontario and Québec harvest volume and allowable cut", alternates: localizedAlternates("en", { en: "/en/data/provincial-harvest-volume", fr: "/fr/donnees/volume-recolte-provinces" }) };

export default function EnglishProvincialHarvestVolumePage() {
  return <SiteShell locale="en"><main id="main" className="page-wrap"><ProvincialHarvestVolume rows={release.rows as readonly ProvincialVolumeRow[]} locale="en" /></main></SiteShell>;
}
