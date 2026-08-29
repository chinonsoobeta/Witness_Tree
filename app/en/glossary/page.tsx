import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("glossary", "en"),
  alternates: { languages: { en: "/en/glossary", fr: "/fr/glossaire" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="glossary" locale="en" />
    </SiteShell>
  );
}
