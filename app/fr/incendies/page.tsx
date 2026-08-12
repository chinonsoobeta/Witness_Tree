import type { Metadata } from "next";
import { WildfireView } from "@/components/wildfire";
import { SiteShell } from "@/components/site";
import { ILLUSTRATIVE_WILDFIRE_FEED } from "@/lib/wildfire";

export const metadata: Metadata = { title: "Contexte des incendies", alternates: { languages: { en: "/en/wildfire", fr: "/fr/incendies" } } };

export default function FrenchWildfirePage() {
  return <SiteShell locale="fr"><WildfireView locale="fr" feed={ILLUSTRATIVE_WILDFIRE_FEED} /></SiteShell>;
}
