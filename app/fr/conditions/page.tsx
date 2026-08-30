import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("terms", "fr"),
  alternates: localizedAlternates("fr", { en: "/en/terms", fr: "/fr/conditions" }),
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="terms" locale="fr" />
    </SiteShell>
  );
}
