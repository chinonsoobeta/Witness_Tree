import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("engagement", "en"),
  alternates: { languages: { en: "/en/engagement", fr: "/fr/dialogue" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="engagement" locale="en" />
    </SiteShell>
  );
}
