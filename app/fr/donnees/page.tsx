import type { Metadata } from "next";
import { DataPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/data", fr: "/fr/donnees" });

export default function FrenchDataPage() { return <SiteShell locale="fr"><DataPage locale="fr" /></SiteShell>; }
