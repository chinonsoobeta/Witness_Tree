import type { Metadata } from "next"; import { SiteShell } from "@/components/site"; import { SearchPage } from "@/components/search"; import { localizedAlternates } from "@/lib/site-metadata";
import { addressLookupConfigured } from "@/lib/address/runtime";
import { districtIndexAvailable } from "@/lib/districts/runtime";
export const metadata: Metadata = { title: "Rechercher des lieux", alternates: localizedAlternates("fr", { en: "/en/search", fr: "/fr/recherche" }) };
export default async function Page({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string; district?: string; scope?: string }> }>) { const query = await searchParams;
  // The address field needs a provider key and a reachable index. Both
  // answers come from the worker's stamped headers, so a field that cannot
  // answer is never offered.
  const [addressConfigured, districtConfigured] = await Promise.all([
    addressLookupConfigured(),
    districtIndexAvailable(),
  ]); const scope = query.scope === "districts" || (query.district !== undefined && query.q === undefined) ? "districts" : "places"; return <SiteShell locale="fr"><main id="main"><SearchPage locale="fr" addressLookup={addressConfigured && districtConfigured} scope={scope} query={scope === "districts" ? query.district ?? "" : query.q ?? ""} /></main></SiteShell>; }
