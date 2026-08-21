import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocationResult } from "@/components/places";
import { SiteShell } from "@/components/site";
import { LOCATIONS, localizedRecord, registryEntryByLocationId } from "@/lib/places";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locationId: string }> }): Promise<Metadata> {
  const { locationId } = await params;
  const record = localizedRecord("location", locationId, "fr");
  if (!record?.route || !record.alternate.href) return {};
  return { alternates: { languages: { en: record.alternate.href, fr: record.route } } };
}

export function generateStaticParams() { return LOCATIONS.map(({ id: locationId }) => ({ locationId })); }

export default async function FrenchLocationPage({ params }: Readonly<{ params: Promise<{ locationId: string }> }>) {
  const { locationId } = await params;
  const entry = registryEntryByLocationId(locationId);
  if (!entry) notFound();
  return <SiteShell locale="fr"><LocationResult locale="fr" location={entry.location} places={[entry.place]} /></SiteShell>;
}
