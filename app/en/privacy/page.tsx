import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("privacy", "en"),
  alternates: { languages: { en: "/en/privacy", fr: "/fr/confidentialite" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="privacy" locale="en" />
    </SiteShell>
  );
}
