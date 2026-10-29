import type { Metadata } from "next";
import { GovernancePage } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/corrections", fr: "/fr/corrections" });

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="corrections" locale="fr" />
    </SiteShell>
  );
}
