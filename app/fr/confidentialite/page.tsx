import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("privacy", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/privacy", fr: "/fr/confidentialite" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="privacy" locale="fr" />
    </SiteShell>
  );
}
