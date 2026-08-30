import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("corrections", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/corrections", fr: "/fr/corrections" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="corrections" locale="fr" />
    </SiteShell>
  );
}
