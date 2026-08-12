import type { Metadata } from "next"; import { SiteShell } from "@/components/site"; import { SearchPage } from "@/components/search";
export const metadata: Metadata = { title: "Rechercher des lieux", alternates: { languages: { en: "/en/search", fr: "/fr/recherche" } } };
export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string }> }>) { return <SiteShell locale="fr"><main id="main"><SearchPage locale="fr" query={(await searchParams).q ?? ""} /></main></SiteShell>; }
