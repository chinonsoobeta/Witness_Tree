import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("releases", "en"),
  alternates: localizedAlternates("en", { en: "/en/releases", fr: "/fr/versions" }),
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="releases" locale="en" />
    </SiteShell>
  );
}
