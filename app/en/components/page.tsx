import type { Metadata } from "next";
import { ComponentGallery } from "@/components/gallery";
import { SiteShell } from "@/components/site";

export const metadata: Metadata = { title: "Component gallery" };

export default function EnglishComponentsPage() {
  return <SiteShell locale="en"><ComponentGallery locale="en" /></SiteShell>;
}
