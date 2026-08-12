import type { Metadata } from "next";
import { DataPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Données et transparence" };

export default function FrenchDataPage() { return <SiteShell locale="fr"><DataPage locale="fr" /></SiteShell>; }
