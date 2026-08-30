import type { Metadata } from "next"; import { SiteShell } from "@/components/site"; import { SearchPage } from "@/components/search";
export const metadata: Metadata = { title: "Rechercher des lieux", alternates: { languages: { en: "/en/search", fr: "/fr/recherche" } } };
export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string; district?: string }> }>) { const query = await searchParams; return <SiteShell locale="fr"><main id="main"><SearchPage locale="fr" query={query.q ?? ""} districtQuery={query.district ?? ""} /></main></SiteShell>; }
