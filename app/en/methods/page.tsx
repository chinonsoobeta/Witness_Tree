import type { Metadata } from "next";
import { MethodologyPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Methodology" };

export default function EnglishMethodsPage() { return <SiteShell locale="en"><MethodologyPage locale="en" /></SiteShell>; }
