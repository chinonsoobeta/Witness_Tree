import type { Metadata } from "next";
import { GovernancePage, governancePageTitle } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { correctionsRecipient } from "@/lib/corrections/contact";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: governancePageTitle("corrections", "en"),
  alternates: localizedAlternates("en", { en: "/en/corrections", fr: "/fr/corrections" }),
};

// The recipient is read when the page is built, so changing it needs a redeploy.
export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="corrections" locale="en" correctionsRecipient={correctionsRecipient()} />
    </SiteShell>
  );
}
