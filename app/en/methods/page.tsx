import type { Metadata } from "next";
import { MethodologyPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/methods", fr: "/fr/methodes" });

export default function EnglishMethodsPage() { return <SiteShell locale="en"><MethodologyPage locale="en" /></SiteShell>; }
