import type { Metadata } from "next";
import { GovernancePage } from "@/components/governance";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/terms", fr: "/fr/conditions" });

export default function Page() {
  return (
    <SiteShell locale="en">
      <GovernancePage kind="terms" locale="en" />
    </SiteShell>
  );
}
