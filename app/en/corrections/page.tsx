import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("corrections", "en"),
  alternates: { languages: { en: "/en/corrections", fr: "/fr/corrections" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="corrections" locale="en" />
    </SiteShell>
  );
}
