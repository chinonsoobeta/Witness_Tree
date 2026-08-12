import type { Metadata } from "next";
import { MethodologyPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Méthodologie" };

export default function FrenchMethodesPage() { return <SiteShell locale="fr"><MethodologyPage locale="fr" /></SiteShell>; }
