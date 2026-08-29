import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("decisions", "en"),
  alternates: { languages: { en: "/en/decisions", fr: "/fr/decisions" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="decisions" locale="en" />
    </SiteShell>
  );
}
