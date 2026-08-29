import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = {
  title: governancePageTitle("terms", "en"),
  alternates: { languages: { en: "/en/terms", fr: "/fr/conditions" } },
};

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="terms" locale="en" />
    </SiteShell>
  );
}
