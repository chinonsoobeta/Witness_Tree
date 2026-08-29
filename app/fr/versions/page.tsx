import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("releases", "fr"),
  alternates: { languages: { en: "/en/releases", fr: "/fr/versions" } },
};

export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="releases" locale="fr" />
    </SiteShell>
  );
}
