import type { Metadata } from "next";
import { GovernancePage } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/corrections", fr: "/fr/corrections" });

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="corrections" locale="en" />
    </SiteShell>
  );
}
