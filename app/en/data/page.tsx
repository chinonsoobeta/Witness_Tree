import type { Metadata } from "next";
import { DataPage } from "@/components/transparency";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Data and transparency" };

export default function EnglishDataPage() { return <SiteShell locale="en"><DataPage locale="en" /></SiteShell>; }
