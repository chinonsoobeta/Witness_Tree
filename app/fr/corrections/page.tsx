import type { Metadata } from "next";
import { GovernancePage } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { correctionsRecipient } from "@/lib/corrections/contact";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("fr", { en: "/en/corrections", fr: "/fr/corrections" });

// The recipient is read when the page is built, so changing it needs a redeploy.
export default function Page() {
  return (
    <SiteShell locale="fr">
      <GovernancePage kind="corrections" locale="fr" correctionsRecipient={correctionsRecipient()} />
    </SiteShell>
  );
}
