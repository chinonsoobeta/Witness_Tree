import type { Metadata } from "next";
import { WildfireView } from "@/components/wildfire";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/wildfire", fr: "/fr/incendies" });

export default function EnglishWildfirePage() {
  return <SiteShell locale="en"><WildfireView locale="en" /></SiteShell>;
}
