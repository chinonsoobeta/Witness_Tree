import type { Metadata } from "next";
import { AccountStatusPage } from "@/components/account";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "État du service de compte", alternates: { languages: { en: "/en/account", fr: "/fr/compte" } } };

export default function AccountPage() { return <SiteShell locale="fr"><AccountStatusPage locale="fr" /></SiteShell>; }
