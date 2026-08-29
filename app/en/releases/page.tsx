import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("releases", "en"),
  alternates: { languages: { en: "/en/releases", fr: "/fr/versions" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="releases" locale="en" />
    </SiteShell>
  );
}
