import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("glossary", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/glossary", fr: "/fr/glossaire" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="glossary" locale="fr" />
    </SiteShell>
  );
}
