import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("engagement", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/engagement", fr: "/fr/dialogue" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="engagement" locale="fr" />
    </SiteShell>
  );
}
