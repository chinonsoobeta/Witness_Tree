import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlacePage } from "@/components/places";
import { SiteShell } from "@/components/site";
import { PLACES, localizedRecord, registryEntryByPlaceId } from "@/lib/places";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }): Promise<Metadata> {
  const { placeId } = await params;
  const record = localizedRecord("place", placeId, "fr");
  if (!record?.route || !record.alternate.href) return {};
  return { alternates: { languages: { en: record.alternate.href, fr: record.route } } };
}

export function generateStaticParams() { return PLACES.map(({ id: placeId }) => ({ placeId })); }

export default async function FrenchPlacePage({ params }: Readonly<{ params: Promise<{ placeId: string }> }>) {
  const { placeId } = await params;
  const entry = registryEntryByPlaceId(placeId);
  if (!entry) notFound();
  return <SiteShell locale="fr"><PlacePage locale="fr" entry={entry} view="chart" /></SiteShell>;
}
