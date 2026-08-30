import type { Metadata } from "next";
import { MethodologyPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Méthodologie", alternates: localizedAlternates("fr", { en: "/en/methods", fr: "/fr/methodes" }) };

export default function FrenchMethodesPage() { return <SiteShell locale="fr"><MethodologyPage locale="fr" /></SiteShell>; }
