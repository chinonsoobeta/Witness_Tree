import type { Metadata } from "next";
import { AccountStatusPage } from "@/components/account";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/account", fr: "/fr/compte" });

export default function AccountPage() { return <SiteShell locale="en"><AccountStatusPage locale="en" /></SiteShell>; }
