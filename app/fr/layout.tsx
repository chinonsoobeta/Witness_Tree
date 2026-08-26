import type { Metadata } from "next";
import { Document } from "@/components/site/Document";
import { localeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = localeMetadata("fr");

/** Root layout for every `/fr` route, so French routes report French. */
export default function FrenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Document lang="fr">{children}</Document>;
}
