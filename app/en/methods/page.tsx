import type { Metadata } from "next";
import { MethodologyPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";
import { localizedAlternates } from "@/lib/site-metadata";

export const metadata: Metadata = { title: "Methodology", alternates: localizedAlternates("en", { en: "/en/methods", fr: "/fr/methodes" }) };

export default function EnglishMethodsPage() { return <SiteShell locale="en"><MethodologyPage locale="en" /></SiteShell>; }
