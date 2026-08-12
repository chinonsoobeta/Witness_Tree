import type { Metadata } from "next";
import { WildfireView } from "@/components/wildfire";
import { SiteShell } from "@/components/site";
import { ILLUSTRATIVE_WILDFIRE_FEED } from "@/lib/wildfire";

export const metadata: Metadata = { title: "Wildfire context", alternates: { languages: { en: "/en/wildfire", fr: "/fr/incendies" } } };

export default function EnglishWildfirePage() {
  return <SiteShell locale="en"><WildfireView locale="en" feed={ILLUSTRATIVE_WILDFIRE_FEED} /></SiteShell>;
}
