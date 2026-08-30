import type { Metadata } from "next";
import { WildfireView } from "@/components/wildfire";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Information sur les feux de forêt", alternates: localizedAlternates("fr", { en: "/en/wildfire", fr: "/fr/incendies" }) };

export default function FrenchWildfirePage() {
  return <SiteShell locale="fr"><WildfireView locale="fr" /></SiteShell>;
}
