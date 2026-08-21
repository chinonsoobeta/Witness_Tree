import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/places";
import { SiteShell } from "@/components/site";
import { PLACES, localizedRecord, registryEntryByPlaceId } from "@/lib/places";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }): Promise<Metadata> {
  const { placeId } = await params;
  const record = localizedRecord("place", placeId, "en");
  if (!record?.route || !record.alternate.href) return {};
  return { alternates: { languages: { en: record.route, fr: record.alternate.href } } };
}

export function generateStaticParams() { return PLACES.map(({ id: placeId }) => ({ placeId })); }

export default async function EnglishPlacePage({ params }: Readonly<{ params: Promise<{ placeId: string }> }>) {
  const { placeId } = await params;
  const entry = registryEntryByPlaceId(placeId);
  if (!entry) notFound();
  return <SiteShell locale="en"><PlacePage locale="en" entry={entry} view="chart" /></SiteShell>;
}
