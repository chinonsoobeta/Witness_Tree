import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-metadata";
import "../site-fonts.css";
import "../globals.css";

export const metadata: Metadata = siteMetadata("en");

export default function EnglishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
