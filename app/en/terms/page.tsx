import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("terms", "en"),
  alternates: localizedAlternates("en", { en: "/en/terms", fr: "/fr/conditions" }),
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="terms" locale="en" />
    </SiteShell>
  );
}
