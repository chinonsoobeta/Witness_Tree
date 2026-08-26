import type { Metadata } from "next";
import { Document } from "@/components/site/Document";
import { siteMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = siteMetadata;

/**
 * Root layout for the language gateway at `/`. The gateway is bilingual, and
 * English is its document language; the French choice carries its own `lang`.
 */
export default function GatewayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Document lang="en">{children}</Document>;
}
