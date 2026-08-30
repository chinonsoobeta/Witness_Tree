import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("glossary", "en"),
  alternates: localizedAlternates("en", { en: "/en/glossary", fr: "/fr/glossaire" }),
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="glossary" locale="en" />
    </SiteShell>
  );
}
