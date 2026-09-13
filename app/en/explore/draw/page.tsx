import type { Metadata } from "next";
import { SiteShell } from "@/components/site";
import { DrawPage } from "@/components/explore/DrawPage";
import { coarseGridAvailable } from "@/lib/shapes/runtime";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "Draw and measure",
  alternates: localizedAlternates("en", { en: "/en/explore/draw", fr: "/fr/explorer/dessiner" }),
};

export default async function Page() {
  const available = await coarseGridAvailable();
  return <SiteShell locale="en"><main id="main"><DrawPage locale="en" available={available} /></main></SiteShell>;
}
