import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("decisions", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/decisions", fr: "/fr/decisions" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="decisions" locale="fr" />
    </SiteShell>
  );
}
