import type { Metadata } from "next";
import { Document } from "@/components/site/Document";
import { localeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = localeMetadata("en");

/** Root layout for every `/en` route, so English routes report English. */
export default function EnglishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Document lang="en">{children}</Document>;
}
