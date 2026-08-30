import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("releases", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/releases", fr: "/fr/versions" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="releases" locale="fr" />
    </SiteShell>
  );
}
