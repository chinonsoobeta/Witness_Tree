import type { Metadata } from "next";
import { DataPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";
import { routeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = routeMetadata("en", { en: "/en/data", fr: "/fr/donnees" });

export default function EnglishDataPage() { return <SiteShell locale="en"><DataPage locale="en" /></SiteShell>; }
