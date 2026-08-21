import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-metadata";
import "../site-fonts.css";
import "../globals.css";

export const metadata: Metadata = siteMetadata("fr");

export default function FrenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
