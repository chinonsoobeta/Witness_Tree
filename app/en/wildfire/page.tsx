import type { Metadata } from "next";
import { WildfireView } from "@/components/wildfire";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Wildfire information", alternates: localizedAlternates("en", { en: "/en/wildfire", fr: "/fr/incendies" }) };

export default function EnglishWildfirePage() {
  return <SiteShell locale="en"><WildfireView locale="en" /></SiteShell>;
}
